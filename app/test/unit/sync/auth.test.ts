import { afterEach, expect, test, vi } from 'vitest';
import {
	CANCELED,
	NO_DRIVE_ACCESS,
	NOT_CONFIGURED,
	completeSignIn,
	revokeEverywhere,
	signInUrl,
	stripCallback,
	tokenSource,
	type AuthKV,
	type Credentials
} from '../../../src/lib/sync/auth/auth.ts';
import { challenge } from '../../../src/lib/sync/auth/pkce.ts';
import type { Transport } from '../../../src/lib/sync/providers/http.ts';
import { SyncError } from '../../../src/lib/sync/providers/types.ts';

const CONFIG = {
	googleClientId: 'google-client',
	dropboxAppKey: 'dropbox-key',
	tokenEndpoint: 'https://token.test'
};
const REDIRECT = 'http://localhost:5199/';
const DRIVE = 'https://www.googleapis.com/auth/drive.file';

afterEach(() => vi.restoreAllMocks());

function memoryKV(): AuthKV & { map: Map<string, unknown> } {
	const map = new Map<string, unknown>();
	return {
		map,
		get: async <T>(key: string) => map.get(key) as T | undefined,
		set: async (key, value) => void map.set(key, structuredClone(value)),
		delete: async (key) => void map.delete(key)
	};
}

type Reply = Response | Error | (() => Response | Promise<Response>);
/** Answers requests in order and records them. */
function fakeTransport(...replies: Reply[]) {
	const calls: { url: string; init: RequestInit }[] = [];
	const transport: Transport = {
		fetch: async (input, init) => {
			calls.push({ url: String(input), init: init ?? {} });
			const reply = replies.shift();
			if (!reply) throw new Error(`unexpected request to ${String(input)}`);
			if (reply instanceof Error) throw reply;
			return typeof reply === 'function' ? reply() : reply;
		},
		sleep: async () => {}
	};
	return { transport, calls };
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fail = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const idToken = (claims: object) =>
	`header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;

async function startSignIn(provider: 'google' | 'dropbox', kv = memoryKV()) {
	const url = new URL(await signInUrl(provider, kv, CONFIG, REDIRECT));
	return { kv, url, state: url.searchParams.get('state')! };
}

function callback(state: string, extra: Record<string, string> = { code: 'the-code' }) {
	return new URL(`${REDIRECT}?${new URLSearchParams({ ...extra, state })}`);
}

test('the Google sign-in URL asks for offline Drive access with PKCE', async () => {
	const { kv, url, state } = await startSignIn('google');
	expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
	const params = Object.fromEntries(url.searchParams);
	expect(params).toMatchObject({
		client_id: 'google-client',
		redirect_uri: REDIRECT,
		response_type: 'code',
		scope: `openid email ${DRIVE}`,
		access_type: 'offline',
		prompt: 'consent',
		include_granted_scopes: 'false',
		code_challenge_method: 'S256'
	});
	const pending = kv.map.get(`pending:${state}`) as { provider: string; verifier: string };
	expect(pending.provider).toBe('google');
	expect(params.code_challenge).toBe(await challenge(pending.verifier));
	expect(pending.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
	expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

test('the Dropbox sign-in URL asks for an offline token without a scope', async () => {
	const { url } = await startSignIn('dropbox');
	expect(url.origin + url.pathname).toBe('https://www.dropbox.com/oauth2/authorize');
	const params = Object.fromEntries(url.searchParams);
	expect(params).toMatchObject({
		client_id: 'dropbox-key',
		redirect_uri: REDIRECT,
		response_type: 'code',
		token_access_type: 'offline',
		code_challenge_method: 'S256'
	});
	expect(params.scope).toBeUndefined();
	expect(params.code_challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

test('every sign-in gets its own state and verifier', async () => {
	const kv = memoryKV();
	const a = await startSignIn('google', kv);
	const b = await startSignIn('google', kv);
	expect(a.state).not.toBe(b.state);
	expect(kv.map.size).toBe(2);
});

test('a Google callback exchanges the code through the endpoint once and reads the email', async () => {
	const { kv, state } = await startSignIn('google');
	const verifier = (kv.map.get(`pending:${state}`) as { verifier: string }).verifier;
	const { transport, calls } = fakeTransport(
		ok({
			access_token: 'access',
			expires_in: 3599,
			refresh_token: 'refresh',
			scope: `${DRIVE} openid https://www.googleapis.com/auth/userinfo.email`,
			id_token: idToken({ email: 'ada@example.com', sub: '1' })
		})
	);
	const credentials = await completeSignIn(callback(state), kv, CONFIG, transport, REDIRECT);
	expect(credentials).toEqual({
		provider: 'google',
		refreshToken: 'refresh',
		email: 'ada@example.com'
	});
	expect(calls).toHaveLength(1);
	expect(calls[0]!.url).toBe('https://token.test/exchange');
	expect(calls[0]!.init.method).toBe('POST');
	expect(new Headers(calls[0]!.init.headers).get('content-type')).toBe('application/json');
	expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
		code: 'the-code',
		code_verifier: verifier,
		redirect_uri: REDIRECT
	});
	expect(kv.map.size).toBe(0);

	const again = completeSignIn(callback(state), kv, CONFIG, transport, REDIRECT);
	await expect(again).rejects.toThrow(/already finished/);
	expect(calls).toHaveLength(1);
});

test('a Google grant without Drive access is refused', async () => {
	const { kv, state } = await startSignIn('google');
	const { transport } = fakeTransport(
		ok({ access_token: 'a', expires_in: 3599, refresh_token: 'r', scope: 'openid email' })
	);
	await expect(completeSignIn(callback(state), kv, CONFIG, transport, REDIRECT)).rejects.toThrow(
		NO_DRIVE_ACCESS
	);
});

test('a Dropbox callback exchanges the code directly and reads the account email', async () => {
	const { kv, state } = await startSignIn('dropbox');
	const verifier = (kv.map.get(`pending:${state}`) as { verifier: string }).verifier;
	const { transport, calls } = fakeTransport(
		ok({
			access_token: 'access',
			expires_in: 14400,
			refresh_token: 'refresh',
			token_type: 'bearer'
		}),
		ok({ email: 'ada@example.com', account_id: 'dbid:1' })
	);
	const credentials = await completeSignIn(callback(state), kv, CONFIG, transport, REDIRECT);
	expect(credentials).toEqual({
		provider: 'dropbox',
		refreshToken: 'refresh',
		email: 'ada@example.com'
	});
	expect(calls[0]!.url).toBe('https://api.dropboxapi.com/oauth2/token');
	expect(Object.fromEntries(calls[0]!.init.body as URLSearchParams)).toEqual({
		code: 'the-code',
		grant_type: 'authorization_code',
		code_verifier: verifier,
		client_id: 'dropbox-key',
		redirect_uri: REDIRECT
	});
	expect(calls[1]!.url).toBe('https://api.dropboxapi.com/2/users/get_current_account');
	expect(new Headers(calls[1]!.init.headers).get('authorization')).toBe('Bearer access');
});

test('a URL without state is not a callback', async () => {
	const { transport, calls } = fakeTransport();
	expect(
		await completeSignIn(new URL(`${REDIRECT}?code=x`), memoryKV(), CONFIG, transport, REDIRECT)
	).toBe(undefined);
	expect(calls).toHaveLength(0);
});

test('an unknown state is refused without a request', async () => {
	const { transport, calls } = fakeTransport();
	await expect(
		completeSignIn(callback('forged'), memoryKV(), CONFIG, transport, REDIRECT)
	).rejects.toBeInstanceOf(SyncError);
	expect(calls).toHaveLength(0);
});

test('a sign-in older than ten minutes is refused and forgotten', async () => {
	const { kv, state } = await startSignIn('google');
	vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * 60_000 + 1);
	const { transport, calls } = fakeTransport();
	await expect(completeSignIn(callback(state), kv, CONFIG, transport, REDIRECT)).rejects.toThrow(
		/too long/
	);
	expect(kv.map.size).toBe(0);
	expect(calls).toHaveLength(0);
});

test('a canceled sign-in throws the canceled error', async () => {
	const { kv, state } = await startSignIn('dropbox');
	const { transport, calls } = fakeTransport();
	const error = await completeSignIn(
		callback(state, {
			error: 'access_denied',
			error_description: 'The user chose not to give your app access'
		}),
		kv,
		CONFIG,
		transport,
		REDIRECT
	).catch((caught: unknown) => caught);
	expect(error).toBeInstanceOf(SyncError);
	expect(error).toMatchObject({ code: 'failed', message: CANCELED });
	expect(calls).toHaveLength(0);
});

test('a missing client id or endpoint fails before anything else', async () => {
	const kv = memoryKV();
	for (const [provider, config] of [
		['google', { ...CONFIG, googleClientId: '' }],
		['google', { ...CONFIG, tokenEndpoint: '' }],
		['dropbox', { ...CONFIG, dropboxAppKey: '' }]
	] as const) {
		await expect(signInUrl(provider, kv, config, REDIRECT)).rejects.toMatchObject({
			code: 'failed',
			message: NOT_CONFIGURED
		});
	}
	expect(kv.map.size).toBe(0);
	const { transport, calls } = fakeTransport();
	const source = tokenSource(
		{ provider: 'google', refreshToken: 'r' },
		{ ...CONFIG, tokenEndpoint: '' },
		transport
	);
	await expect(source()).rejects.toMatchObject({ message: NOT_CONFIGURED });
	expect(calls).toHaveLength(0);
});

const google: Credentials = { provider: 'google', refreshToken: 'refresh' };
const dropbox: Credentials = { provider: 'dropbox', refreshToken: 'refresh' };

test('access tokens are reused until a minute before expiry, and refresh forces a new one', async () => {
	const now = Date.now();
	const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
	const { transport, calls } = fakeTransport(
		ok({ access_token: 't1', expires_in: 3600 }),
		ok({ access_token: 't2', expires_in: 3600 }),
		ok({ access_token: 't3', expires_in: 3600 })
	);
	const source = tokenSource(google, CONFIG, transport);
	expect(await source()).toBe('t1');
	clock.mockReturnValue(now + 3600_000 - 60_001);
	expect(await source()).toBe('t1');
	clock.mockReturnValue(now + 3600_000 - 60_000);
	expect(await source()).toBe('t2');
	expect(await source(true)).toBe('t3');
	expect(calls.map((call) => call.url)).toEqual(Array(3).fill('https://token.test/refresh'));
	expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ refresh_token: 'refresh' });
});

test('concurrent callers share one refresh', async () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	const { transport, calls } = fakeTransport(async () => {
		await gate;
		return ok({ access_token: 't1', expires_in: 3600 });
	});
	const source = tokenSource(google, CONFIG, transport);
	const all = Promise.all([source(), source(true), source()]);
	release();
	expect(await all).toEqual(['t1', 't1', 't1']);
	expect(calls).toHaveLength(1);
});

test('Dropbox refreshes with the app key and no secret or verifier', async () => {
	const { transport, calls } = fakeTransport(ok({ access_token: 't1', expires_in: 14400 }));
	expect(await tokenSource(dropbox, CONFIG, transport)()).toBe('t1');
	expect(calls[0]!.url).toBe('https://api.dropboxapi.com/oauth2/token');
	expect(Object.fromEntries(calls[0]!.init.body as URLSearchParams)).toEqual({
		grant_type: 'refresh_token',
		refresh_token: 'refresh',
		client_id: 'dropbox-key'
	});
});

test.each([
	['google', 400],
	['dropbox', 400],
	['google', 401]
] as const)('%s invalid_grant (%i) asks to reconnect', async (provider, status) => {
	const { transport } = fakeTransport(fail(status, { error: 'invalid_grant' }));
	await expect(
		tokenSource({ provider, refreshToken: 'r' }, CONFIG, transport)()
	).rejects.toMatchObject({ code: 'reconnect' });
});

test('a network error is offline and another failure is failed, and the next call tries again', async () => {
	const { transport, calls } = fakeTransport(
		new TypeError('Failed to fetch'),
		fail(429, { error: 'rate' }),
		fail(400, { error: 'invalid_client' }),
		ok({ access_token: 't1', expires_in: 3600 })
	);
	const source = tokenSource(google, CONFIG, transport);
	await expect(source()).rejects.toMatchObject({ code: 'offline' });
	await expect(source()).rejects.toMatchObject({ code: 'failed' });
	await expect(source()).rejects.toMatchObject({ code: 'failed' });
	expect(await source()).toBe('t1');
	expect(calls).toHaveLength(4);
});

test('revoke everywhere goes through the endpoint for Google, and an already revoked grant is fine', async () => {
	const { transport, calls } = fakeTransport(
		new Response('', { status: 200 }),
		fail(400, { error: 'invalid_token', error_description: 'Token expired or revoked' })
	);
	await revokeEverywhere(google, CONFIG, transport);
	await revokeEverywhere(google, CONFIG, transport);
	expect(calls[0]!.url).toBe('https://token.test/revoke');
	expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ token: 'refresh' });
});

test('revoke on Dropbox revokes a fresh access token', async () => {
	const { transport, calls } = fakeTransport(
		ok({ access_token: 't1', expires_in: 14400 }),
		new Response('null', { status: 200 })
	);
	await revokeEverywhere(dropbox, CONFIG, transport);
	expect(calls[1]!.url).toBe('https://api.dropboxapi.com/2/auth/token/revoke');
	expect(new Headers(calls[1]!.init.headers).get('authorization')).toBe('Bearer t1');
});

test('stripCallback removes only the sign-in parameters', () => {
	const url = new URL(
		`${REDIRECT}?code=c&state=s&scope=x&authuser=0&prompt=consent&hd=example.com&error=e&error_description=d&dev=1#top`
	);
	expect(stripCallback(url).href).toBe(`${REDIRECT}?dev=1#top`);
	expect(url.searchParams.get('code')).toBe('c');
});
