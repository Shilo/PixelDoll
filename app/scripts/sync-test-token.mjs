// One-time owner helper: put a Cloud Save test account's refresh token into the repo-root .env, so agents can test real
// providers (npm run dev:agent) without ever opening a sign-in page. Run from app/ with NO server on port 5199 (the
// browser then stops on an error page and the address keeps the code; a running app would consume it):
//   node scripts/sync-test-token.mjs google    (or dropbox)
// It prints a sign-in URL. Sign in with the SPARE test account, then paste the address the browser lands on
// (http://localhost:5199/?code=...) here. The token is written to .env and never printed.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { SYNC_CONFIG } from '../src/lib/sync/config.ts';

const provider = process.argv[2];
const NAMES = {
	google: 'GOOGLE_SYNC_TEST_REFRESH_TOKEN',
	dropbox: 'DROPBOX_SYNC_TEST_REFRESH_TOKEN'
};
if (!(provider in NAMES)) {
	console.error('Usage: node scripts/sync-test-token.mjs google|dropbox');
	process.exit(1);
}
const redirect = 'http://localhost:5199/';
const b64 = (bytes) => Buffer.from(bytes).toString('base64url');
const verifier = b64(randomBytes(32)),
	state = b64(randomBytes(16)),
	challenge = b64(createHash('sha256').update(verifier).digest());

const url =
	provider === 'google'
		? new URL('https://accounts.google.com/o/oauth2/v2/auth')
		: new URL('https://www.dropbox.com/oauth2/authorize');
const params =
	provider === 'google'
		? {
				client_id: SYNC_CONFIG.googleClientId,
				redirect_uri: redirect,
				response_type: 'code',
				scope: 'openid email https://www.googleapis.com/auth/drive.file',
				access_type: 'offline',
				prompt: 'consent',
				code_challenge: challenge,
				code_challenge_method: 'S256',
				state
			}
		: {
				client_id: SYNC_CONFIG.dropboxAppKey,
				redirect_uri: redirect,
				response_type: 'code',
				token_access_type: 'offline',
				code_challenge: challenge,
				code_challenge_method: 'S256',
				state
			};
if (!params.client_id || (provider === 'google' && !SYNC_CONFIG.tokenEndpoint)) {
	console.error('Fill in app/src/lib/sync/config.ts first (owner checklist).');
	process.exit(1);
}
for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
console.log(`\nOpen this URL in a private window and sign in with the TEST account:\n\n${url}\n`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const landed = new URL((await rl.question('Paste the full address you were sent to: ')).trim());
rl.close();
if (landed.searchParams.get('state') !== state)
	throw new Error('That address is from another sign-in.');
const code = landed.searchParams.get('code');
if (!code) throw new Error(`Sign-in failed: ${landed.searchParams.get('error') ?? 'no code'}`);

const response =
	provider === 'google'
		? await fetch(`${SYNC_CONFIG.tokenEndpoint}/exchange`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: 'http://localhost:5199' },
				body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirect })
			})
		: await fetch('https://api.dropboxapi.com/oauth2/token', {
				method: 'POST',
				body: new URLSearchParams({
					code,
					grant_type: 'authorization_code',
					code_verifier: verifier,
					client_id: SYNC_CONFIG.dropboxAppKey,
					redirect_uri: redirect
				})
			});
const tokens = await response.json();
if (!response.ok || !tokens.refresh_token)
	throw new Error(`Exchange failed (${response.status}): ${tokens.error ?? 'no refresh token'}`);

const env = new URL('../../.env', import.meta.url);
const name = NAMES[provider];
const lines = existsSync(env) ? readFileSync(env, 'utf8').split(/\r?\n/) : [];
const kept = lines.filter((line) => !line.startsWith(`${name}=`) && line !== '');
writeFileSync(env, [...kept, `${name}=${tokens.refresh_token}`, ''].join('\n'));
console.log(`Saved ${name} to the repo-root .env (value not shown).`);
