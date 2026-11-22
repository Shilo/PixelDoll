// Sign-in for both cloud providers: a full-page redirect with PKCE, the code exchange, access-token refresh and revoke.
// Google gives browser apps no refresh token, so its exchange, refresh and revoke go through the D31 token endpoint,
// which holds the client secret. Dropbox issues refresh tokens to PKCE clients directly. Refresh tokens are returned to
// the caller to store; access tokens stay in memory.
import { SYNC_CONFIG, redirectUri } from '../config.ts';
import { browserTransport, type Transport } from '../providers/http.ts';
import { SyncError, type ProviderKind, type TokenSource } from '../providers/types.ts';
import { challenge, randomToken } from './pkce.ts';

/** Key-value storage for pending sign-ins (the Lead backs it with IndexedDB "pixeldoll-sync"). */
export interface AuthKV {
	get<T>(key: string): Promise<T | undefined>;
	set(key: string, value: unknown): Promise<void>;
	delete(key: string): Promise<void>;
}

export type SignInProvider = Exclude<ProviderKind, 'sim'>;

export interface Credentials {
	provider: SignInProvider;
	refreshToken: string;
	/** Shown next to the connection; never verified. */
	email?: string;
}

type SyncConfig = typeof SYNC_CONFIG;

/** SyncError messages the UI tells apart from provider failures. */
export const NOT_CONFIGURED = 'not-configured';
export const CANCELED = 'canceled';
/** The user unticked the Google Drive permission on Google's consent screen. */
export const NO_DRIVE_ACCESS = 'no-drive-access';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DROPBOX_TOKEN = 'https://api.dropboxapi.com/oauth2/token';
const DROPBOX_API = 'https://api.dropboxapi.com/2';
const PENDING_LIFE_MS = 10 * 60_000;
/** Refresh this long before an access token expires, so a request never starts with one about to lapse. */
const EXPIRY_MARGIN_MS = 60_000;

interface Pending {
	provider: SignInProvider;
	verifier: string;
	created: number;
}

function requireConfig(provider: SignInProvider, config: SyncConfig) {
	const ready =
		provider === 'google' ? config.googleClientId && config.tokenEndpoint : config.dropboxAppKey;
	if (!ready) throw new SyncError('failed', NOT_CONFIGURED);
}

export async function signInUrl(
	provider: SignInProvider,
	kv: AuthKV,
	config: SyncConfig = SYNC_CONFIG,
	redirect: string = redirectUri()
): Promise<string> {
	requireConfig(provider, config);
	const verifier = randomToken();
	const state = randomToken();
	await kv.set(`pending:${state}`, { provider, verifier, created: Date.now() } satisfies Pending);
	const common = {
		response_type: 'code',
		redirect_uri: redirect,
		state,
		code_challenge: await challenge(verifier),
		code_challenge_method: 'S256'
	};
	if (provider === 'google') {
		const params = new URLSearchParams({
			...common,
			client_id: config.googleClientId,
			scope: `openid email ${DRIVE_SCOPE}`,
			// Without both, Google returns no refresh token on a device whose earlier grant already exists.
			access_type: 'offline',
			prompt: 'consent',
			include_granted_scopes: 'false'
		});
		return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
	}
	// No scope parameter: the Dropbox app's configured permissions (App folder) apply.
	const params = new URLSearchParams({
		...common,
		client_id: config.dropboxAppKey,
		token_access_type: 'offline'
	});
	return `https://www.dropbox.com/oauth2/authorize?${params}`;
}

/** Finishes a sign-in redirect. Undefined when `url` is not a sign-in callback. The caller stores the credentials. */
export async function completeSignIn(
	url: URL,
	kv: AuthKV,
	config: SyncConfig = SYNC_CONFIG,
	transport: Transport = browserTransport,
	redirect: string = redirectUri()
): Promise<Credentials | undefined> {
	const state = url.searchParams.get('state');
	if (!state) return undefined;
	const key = `pending:${state}`;
	const pending = await kv.get<Pending>(key);
	if (!pending)
		throw new SyncError('failed', 'This sign-in was already finished or was not started here.');
	// Consumed before the exchange: a code works once, so a repeated callback must not try again.
	await kv.delete(key);
	if (Date.now() - pending.created > PENDING_LIFE_MS)
		throw new SyncError('failed', 'The sign-in took too long. Please connect again.');
	requireConfig(pending.provider, config);
	if (url.searchParams.has('error')) throw new SyncError('failed', CANCELED);
	const code = url.searchParams.get('code');
	if (!code) throw new SyncError('failed', 'The sign-in returned no authorization code.');

	if (pending.provider === 'google') {
		const tokens = await call(
			`${config.tokenEndpoint}/exchange`,
			json({ code, code_verifier: pending.verifier, redirect_uri: redirect }),
			transport
		);
		if (
			!String(tokens.scope ?? '')
				.split(' ')
				.includes(DRIVE_SCOPE)
		)
			throw new SyncError('failed', NO_DRIVE_ACCESS);
		return {
			provider: 'google',
			refreshToken: requireString(tokens.refresh_token, 'refresh token'),
			email: typeof tokens.id_token === 'string' ? idTokenEmail(tokens.id_token) : undefined
		};
	}
	const tokens = await call(
		DROPBOX_TOKEN,
		form({
			code,
			grant_type: 'authorization_code',
			code_verifier: pending.verifier,
			client_id: config.dropboxAppKey,
			redirect_uri: redirect
		}),
		transport
	);
	const account = await call(
		`${DROPBOX_API}/users/get_current_account`,
		{
			method: 'POST',
			headers: { authorization: `Bearer ${requireString(tokens.access_token, 'access token')}` }
		},
		transport
	);
	return {
		provider: 'dropbox',
		refreshToken: requireString(tokens.refresh_token, 'refresh token'),
		email: typeof account.email === 'string' ? account.email : undefined
	};
}

/** Access tokens for one connection, kept in memory until shortly before they expire. */
export function tokenSource(
	credentials: Credentials,
	config: SyncConfig = SYNC_CONFIG,
	transport: Transport = browserTransport
): TokenSource {
	let current: { token: string; expires: number } | undefined;
	let inFlight: Promise<string> | undefined;

	async function renew() {
		requireConfig(credentials.provider, config);
		const tokens =
			credentials.provider === 'google'
				? await call(
						`${config.tokenEndpoint}/refresh`,
						json({ refresh_token: credentials.refreshToken }),
						transport
					)
				: await call(
						DROPBOX_TOKEN,
						form({
							grant_type: 'refresh_token',
							refresh_token: credentials.refreshToken,
							client_id: config.dropboxAppKey
						}),
						transport
					);
		const token = requireString(tokens.access_token, 'access token');
		const seconds = Number(tokens.expires_in);
		if (!Number.isFinite(seconds))
			throw new SyncError('failed', 'The sign-in service returned no token lifetime.');
		current = { token, expires: Date.now() + seconds * 1000 };
		return token;
	}

	return (refresh = false) => {
		if (inFlight) return inFlight;
		if (!refresh && current && Date.now() < current.expires - EXPIRY_MARGIN_MS)
			return Promise.resolve(current.token);
		current = undefined;
		inFlight = renew().finally(() => (inFlight = undefined));
		return inFlight;
	};
}

/** Ends the connection with the provider. Google revokes the whole grant, so every device signs out. */
export async function revokeEverywhere(
	credentials: Credentials,
	config: SyncConfig = SYNC_CONFIG,
	transport: Transport = browserTransport
): Promise<void> {
	requireConfig(credentials.provider, config);
	if (credentials.provider === 'google') {
		try {
			await call(
				`${config.tokenEndpoint}/revoke`,
				json({ token: credentials.refreshToken }),
				transport
			);
		} catch (error) {
			// Google answers invalid_token for a grant that is already gone, which is the outcome asked for.
			if (!(error instanceof SyncError && error.message.includes('invalid_token'))) throw error;
		}
		return;
	}
	// Dropbox revokes only the token it is given, which ends this device's grant alone. The UI links to Dropbox's
	// connected apps page for the other devices.
	const token = await tokenSource(credentials, config, transport)();
	await call(
		`${DROPBOX_API}/auth/token/revoke`,
		{ method: 'POST', headers: { authorization: `Bearer ${token}` } },
		transport
	);
}

const CALLBACK_PARAMS = [
	'code',
	'state',
	'scope',
	'authuser',
	'prompt',
	'hd',
	'error',
	'error_description'
];

/** The callback URL without the sign-in parameters, for history.replaceState. */
export function stripCallback(url: URL): URL {
	const clean = new URL(url);
	for (const name of CALLBACK_PARAMS) clean.searchParams.delete(name);
	return clean;
}

function json(body: Record<string, string>): RequestInit {
	return {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	};
}

function form(body: Record<string, string>): RequestInit {
	return { method: 'POST', body: new URLSearchParams(body) };
}

/** One sign-in request. Error texts carry the status and response body (OAuth error bodies hold no tokens), never the
 *  request. */
async function call(
	url: string,
	init: RequestInit,
	transport: Transport
): Promise<Record<string, unknown>> {
	let response: Response;
	try {
		response = await transport.fetch(url, init);
	} catch (cause) {
		throw new SyncError('offline', 'The sign-in service could not be reached.', { cause });
	}
	const text = await response.text();
	const body = parseObject(text);
	if (response.ok) {
		// Dropbox answers `null` and Google's revoke an empty body for calls with no result.
		if (body || ['', 'null'].includes(text.trim())) return body ?? {};
		throw new SyncError(
			'failed',
			`The sign-in service returned an unreadable answer (${response.status}).`
		);
	}
	if ((response.status === 400 || response.status === 401) && body?.error === 'invalid_grant')
		throw new SyncError('reconnect', 'The cloud sign-in has ended. Please connect again.');
	throw new SyncError(
		'failed',
		`Sign-in request failed: ${response.status} ${text.slice(0, 300)}`.trim()
	);
}

function parseObject(text: string): Record<string, unknown> | undefined {
	try {
		const value: unknown = JSON.parse(text);
		return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
	} catch {
		// Not JSON (a proxy's HTML error page, say): the caller reports the raw text instead.
		return undefined;
	}
}

function requireString(value: unknown, what: string): string {
	if (typeof value !== 'string' || !value)
		throw new SyncError('failed', `The sign-in service returned no ${what}.`);
	return value;
}

/** The email claim of a Google id_token, read without verification: it is only displayed. */
function idTokenEmail(idToken: string): string | undefined {
	const payload = idToken.split('.')[1] ?? '';
	const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
	const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
	const claims = parseObject(new TextDecoder().decode(bytes));
	return typeof claims?.email === 'string' ? claims.email : undefined;
}
