// PixelDoll's stateless Google OAuth token endpoint (PLAN.md D31). Google gives browser apps no refresh token, and its
// code exchange needs the client secret, so this Worker adds the secret and forwards three calls to Google. It stores
// nothing and logs nothing: refresh tokens pass through in transit only.

interface Env {
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

const ORIGINS = ['https://pixeldoll.app', 'http://localhost:5199'];
/** The app roots both providers redirect to (docs/handoff/2026-11-22-cloud-save-autonomous-plan.md, section 5). */
const REDIRECTS = ['https://pixeldoll.app/', 'http://localhost:5199/'];
const MAX_BODY = 4096;
const GOOGLE = 'https://oauth2.googleapis.com';

type Fields = Record<string, unknown>;
const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

/** The form Google receives for each route, or undefined when the request lacks what it needs. */
const ROUTES: Record<
	string,
	(body: Fields, env: Env) => [string, Record<string, string>] | undefined
> = {
	'/exchange': (body, env) => {
		const code = text(body.code);
		const verifier = text(body.code_verifier);
		const redirect = text(body.redirect_uri);
		if (!code || !verifier || !redirect || !REDIRECTS.includes(redirect)) return undefined;
		return [
			`${GOOGLE}/token`,
			{
				...secret(env),
				grant_type: 'authorization_code',
				code,
				code_verifier: verifier,
				redirect_uri: redirect
			}
		];
	},
	'/refresh': (body, env) => {
		const token = text(body.refresh_token);
		if (!token) return undefined;
		return [
			`${GOOGLE}/token`,
			{ ...secret(env), grant_type: 'refresh_token', refresh_token: token }
		];
	},
	'/revoke': (body) => {
		const token = text(body.token);
		return token ? [`${GOOGLE}/revoke`, { token }] : undefined;
	}
};

function secret(env: Env) {
	return { client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET };
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const origin = request.headers.get('origin') ?? '';
		if (!ORIGINS.includes(origin)) return new Response(null, { status: 403 });
		const cors = {
			'access-control-allow-origin': origin,
			'access-control-allow-methods': 'POST',
			'access-control-allow-headers': 'content-type',
			'access-control-max-age': '86400',
			vary: 'origin'
		};
		const reply = (status: number, body: BodyInit | null = null, type?: string) =>
			new Response(body, { status, headers: type ? { ...cors, 'content-type': type } : cors });

		const route = ROUTES[new URL(request.url).pathname];
		if (!route) return reply(404);
		if (request.method === 'OPTIONS') return reply(204);
		if (request.method !== 'POST') return reply(405);

		const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
		if (!(await env.LIMITER.limit({ key: ip })).success) return reply(429);

		if (Number(request.headers.get('content-length')) > MAX_BODY) return reply(413);
		const raw = await request.text();
		if (new TextEncoder().encode(raw).length > MAX_BODY) return reply(413);
		let body: unknown;
		try {
			body = JSON.parse(raw);
		} catch {
			return reply(400);
		}
		const target = body && typeof body === 'object' ? route(body as Fields, env) : undefined;
		if (!target) return reply(400);

		const google = await fetch(target[0], { method: 'POST', body: new URLSearchParams(target[1]) });
		// Google's own answer, unchanged: the client reads its error codes (invalid_grant) directly.
		return reply(
			google.status,
			await google.text(),
			google.headers.get('content-type') ?? 'application/json'
		);
	}
};
