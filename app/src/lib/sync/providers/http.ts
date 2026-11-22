// One authorized request with the retry rules every adapter shares: a rejected token is refreshed once, busy or failing
// servers (429, 5xx) are retried with backoff, and what still fails becomes a SyncError the user can act on.
import { SyncError, type TokenSource } from './types.ts';

export interface Transport {
	fetch: typeof fetch;
	sleep: (ms: number) => Promise<void>;
}
export const browserTransport: Transport = {
	fetch: (...args) => fetch(...args),
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
};

/** A provider's own reading of a failed response: a SyncError to throw, 'retry' for a rate limit it reports in another
 *  status (Drive's 403 rateLimitExceeded), or undefined for the shared rules. */
export type Classify = (response: Response) => Promise<SyncError | 'retry' | undefined>;

const ATTEMPTS = 4;
const MAX_WAIT_MS = 30_000;

function backoff(attempt: number, response?: Response) {
	const after = Number(response?.headers.get('retry-after'));
	if (Number.isFinite(after) && after > 0) return Math.min(after * 1000, MAX_WAIT_MS);
	return Math.min(500 * 2 ** attempt + Math.floor(Math.random() * 250), MAX_WAIT_MS);
}

/** Text of a failed response for an error message, never its headers (they may hold a token). */
async function describe(response: Response) {
	const text = await response.text().catch(() => '');
	return `${response.status} ${text.slice(0, 300)}`.trim();
}

export async function authorized(
	url: string,
	init: RequestInit,
	token: TokenSource,
	transport: Transport,
	classify?: Classify
): Promise<Response> {
	let refreshed = false;
	let refresh = false;
	for (let attempt = 0; ; attempt++) {
		const headers = new Headers(init.headers);
		headers.set('authorization', `Bearer ${await token(refresh)}`);
		refresh = false;
		let response: Response;
		try {
			response = await transport.fetch(url, { ...init, headers });
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
			if (attempt + 1 >= ATTEMPTS || globalThis.navigator?.onLine === false)
				throw new SyncError('offline', 'The cloud service could not be reached.', { cause });
			await transport.sleep(backoff(attempt));
			continue;
		}
		if (response.ok) return response;
		if (response.status === 401) {
			await response.body?.cancel();
			if (refreshed) throw new SyncError('reconnect', 'The cloud sign-in was not accepted.');
			refreshed = refresh = true;
			continue;
		}
		const own = await classify?.(response.clone());
		if (own instanceof SyncError) throw own;
		if (own === 'retry' || response.status === 429 || response.status >= 500) {
			if (attempt + 1 >= ATTEMPTS)
				throw new SyncError('failed', `The cloud service is busy (${await describe(response)}).`);
			await response.body?.cancel();
			await transport.sleep(backoff(attempt, response));
			continue;
		}
		return response;
	}
}

/** Throw a SyncError('failed') for a response that is still not ok after `authorized`. */
export async function expectOk(response: Response, what: string): Promise<Response> {
	if (!response.ok) throw new SyncError('failed', `${what} failed: ${await describe(response)}`);
	return response;
}
