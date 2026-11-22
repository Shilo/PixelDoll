import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import worker from './worker.ts';

const SECRET = 'test-client-secret';
const BASE = 'https://pixeldoll-sync-token.example.workers.dev';
const APP = 'https://pixeldoll.app';

let allowed: boolean;
let limitKeys: string[];
let google: ReturnType<typeof vi.fn<typeof fetch>>;
const env = () => ({
	GOOGLE_CLIENT_ID: 'test-client-id',
	GOOGLE_CLIENT_SECRET: SECRET,
	LIMITER: {
		limit: async ({ key }: { key: string }) => {
			limitKeys.push(key);
			return { success: allowed };
		}
	}
});

beforeEach(() => {
	allowed = true;
	limitKeys = [];
	google = vi.fn<typeof fetch>(
		async () =>
			new Response('{"access_token":"a","expires_in":3599}', {
				status: 200,
				headers: { 'content-type': 'application/json; charset=utf-8' }
			})
	);
	vi.stubGlobal('fetch', google);
});
afterEach(() => vi.unstubAllGlobals());

function call(path: string, body: unknown, init: { origin?: string; method?: string } = {}) {
	const headers: Record<string, string> = {
		'content-type': 'application/json',
		'cf-connecting-ip': '203.0.113.7'
	};
	if (init.origin !== '') headers.origin = init.origin ?? APP;
	const method = init.method ?? 'POST';
	const request = new Request(`${BASE}${path}`, {
		method,
		headers,
		body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
	});
	return worker.fetch(request, env());
}

/** The form fields the worker sent to Google. */
function sent(index = 0) {
	const [url, init] = google.mock.calls[index]!;
	return { url, fields: Object.fromEntries(new URLSearchParams(init!.body as URLSearchParams)) };
}

const exchange = {
	code: 'the-code',
	code_verifier: 'the-verifier',
	redirect_uri: 'https://pixeldoll.app/'
};

test('exchange forwards the code with the client secret and returns Google unchanged', async () => {
	const response = await call('/exchange', exchange);
	expect(response.status).toBe(200);
	expect(response.headers.get('access-control-allow-origin')).toBe(APP);
	expect(await response.text()).toBe('{"access_token":"a","expires_in":3599}');
	expect(sent()).toEqual({
		url: 'https://oauth2.googleapis.com/token',
		fields: {
			client_id: 'test-client-id',
			client_secret: SECRET,
			grant_type: 'authorization_code',
			code: 'the-code',
			code_verifier: 'the-verifier',
			redirect_uri: 'https://pixeldoll.app/'
		}
	});
	expect(limitKeys).toEqual(['203.0.113.7']);
});

test('refresh and revoke forward only their own fields', async () => {
	await call('/refresh', { refresh_token: 'r1', extra: 'ignored' });
	expect(sent(0)).toEqual({
		url: 'https://oauth2.googleapis.com/token',
		fields: {
			client_id: 'test-client-id',
			client_secret: SECRET,
			grant_type: 'refresh_token',
			refresh_token: 'r1'
		}
	});
	await call('/revoke', { token: 'r1' }, { origin: 'http://localhost:5199' });
	expect(sent(1)).toEqual({ url: 'https://oauth2.googleapis.com/revoke', fields: { token: 'r1' } });
});

test("Google's errors pass through with their status, and the secret is never echoed", async () => {
	google.mockResolvedValueOnce(
		new Response(
			'{"error":"invalid_grant","error_description":"Token has been expired or revoked."}',
			{
				status: 400,
				headers: { 'content-type': 'application/json' }
			}
		)
	);
	const response = await call('/refresh', { refresh_token: 'r1' });
	expect(response.status).toBe(400);
	const text = await response.text();
	expect(JSON.parse(text).error).toBe('invalid_grant');
	expect(text).not.toContain(SECRET);
	expect([...response.headers.values()].join(' ')).not.toContain(SECRET);
});

test.each([
	'https://evil.example',
	'https://pixeldoll.app.evil.example',
	'http://localhost:5173',
	''
])('origin %j is refused without CORS headers', async (origin) => {
	const response = await call('/exchange', exchange, { origin });
	expect(response.status).toBe(403);
	expect(response.headers.get('access-control-allow-origin')).toBeNull();
	expect(google).not.toHaveBeenCalled();
});

test('preflight answers allowed origins without calling Google', async () => {
	const response = await call('/refresh', undefined, { method: 'OPTIONS' });
	expect(response.status).toBe(204);
	expect(response.headers.get('access-control-allow-origin')).toBe(APP);
	expect(response.headers.get('access-control-allow-methods')).toBe('POST');
	expect(response.headers.get('access-control-allow-headers')).toBe('content-type');
	expect(google).not.toHaveBeenCalled();
	expect(limitKeys).toEqual([]);
});

test.each([
	['/token', 'POST', 404],
	['/', 'POST', 404],
	['/exchange/', 'POST', 404],
	['/exchange', 'GET', 405],
	['/refresh', 'PUT', 405]
])('%s with %s is refused (%i)', async (path, method, status) => {
	const response = await call(path, method === 'GET' ? undefined : { refresh_token: 'r' }, {
		method
	});
	expect(response.status).toBe(status);
	expect(google).not.toHaveBeenCalled();
});

test('bodies over 4 KB, non-JSON and missing fields are refused', async () => {
	expect((await call('/refresh', { refresh_token: 'r'.repeat(4097) })).status).toBe(413);
	expect((await call('/refresh', 'not json')).status).toBe(400);
	expect((await call('/refresh', {})).status).toBe(400);
	expect((await call('/refresh', { refresh_token: 42 })).status).toBe(400);
	expect((await call('/revoke', null)).status).toBe(400);
	expect((await call('/exchange', { ...exchange, code: '' })).status).toBe(400);
	expect(google).not.toHaveBeenCalled();
});

test.each([
	'https://evil.example/',
	'https://pixeldoll.app/callback',
	'https://pixeldoll.app',
	'http://localhost:5199/x'
])('redirect_uri %s is refused', async (redirect_uri) => {
	expect((await call('/exchange', { ...exchange, redirect_uri })).status).toBe(400);
	expect(google).not.toHaveBeenCalled();
});

test('the local agent root is an allowed redirect', async () => {
	const response = await call(
		'/exchange',
		{ ...exchange, redirect_uri: 'http://localhost:5199/' },
		{ origin: 'http://localhost:5199' }
	);
	expect(response.status).toBe(200);
	expect(sent().fields.redirect_uri).toBe('http://localhost:5199/');
});

test('a rate-limited IP gets 429 with CORS so the app can read it', async () => {
	allowed = false;
	const response = await call('/refresh', { refresh_token: 'r1' });
	expect(response.status).toBe(429);
	expect(response.headers.get('access-control-allow-origin')).toBe(APP);
	expect(google).not.toHaveBeenCalled();
});
