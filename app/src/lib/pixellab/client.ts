// fetch wrapper for PixelLab REST v2. The key only ever goes into the Authorization header.

export const API_BASE = 'https://api.pixellab.ai/v2';
const TIMEOUT_MS = 120_000, SKELETON_TIMEOUT_MS = 600_000;
// The estimator returns synchronously; provider queue time is part of this HTTP request. This is a bounded client policy,
// not a provider SLA. Async submissions and free reads keep their shorter timeout; unknown paid outcomes are never resent.
export const timeoutFor = (method: string, path: string) => method === 'POST' && path === '/estimate-skeleton' ? SKELETON_TIMEOUT_MS : TIMEOUT_MS;

// auth: stop queue, ask for key · credits: stop queue · invalid/policy: terminal · retry: backoff (a paid POST only when
// `rejected`, see queue.submit) · notfound · other: terminal
export type ErrorKind = 'auth' | 'credits' | 'invalid' | 'policy' | 'retry' | 'notfound' | 'other';

export class ApiError extends Error {
  status: number;
  kind: ErrorKind;
  body: unknown;
  constructor(status: number, kind: ErrorKind, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.kind = kind;
    this.body = body;
  }
}

export function classify(status: number, body?: unknown): ErrorKind {
  if (isPolicy(body)) return 'policy';
  if (status === 0 || status === 423 || status === 429 || status >= 500) return 'retry';
  if (status === 401) return 'auth';
  if (status === 402) return 'credits';
  if (status === 404) return 'notfound';
  if (status === 422 || status === 400) return 'invalid';
  return 'other';
}

/** No connection at all (fetch never got an answer, not a timeout): the queue pauses instead of trying the next job (B15). */
export const isNetwork = (e: unknown) => e instanceof ApiError && e.status === 0 && !!(e.body as { network?: boolean } | undefined)?.network;

/** A documented concurrency/rate-limit rejection can be retried. Other server failures do not prove a paid request was unsent.
 * Known route-specific no-job refusals are checked separately in queue.submit; free GET requests still retry transient errors. */
export const rejected = (status: number) => status === 429;

// Content-policy refusal: code 5000 at top level or in a job's last_response. Never retried.
export function isPolicy(body: unknown): boolean {
  const b = body as { code?: unknown; last_response?: { code?: unknown } } | null;
  return !!b && typeof b === 'object' && (b.code === 5000 || b.last_response?.code === 5000);
}

export function errorText(body: unknown): string {
  const b = body as { detail?: unknown; error?: unknown; last_response?: { error?: unknown } } | null;
  const d = b?.detail ?? b?.error ?? b?.last_response?.error ?? body;
  return (typeof d === 'string' ? d : JSON.stringify(d) ?? '').slice(0, 400);
}

export async function api<T>(key: string, method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  if (!key) throw new ApiError(401, 'auth', 'no API key set');
  let r: Response;
  try {
    r = await fetch(API_BASE + path, {
      method,
      headers: { authorization: `Bearer ${key}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: signal ?? AbortSignal.timeout(timeoutFor(method, path)), // a hung request never holds a queue slot forever
    });
  } catch (e) {
    // B15: `network` = no connection (offline banner, queue pauses); a timeout or abort is not one
    const name = (e as Error)?.name;
    throw new ApiError(0, 'retry', `network error: ${(e as Error).message}`, { network: name !== 'TimeoutError' && name !== 'AbortError' });
  }
  const text = await r.text();
  let json: unknown;
  try { json = text ? JSON.parse(text) : null; } catch { json = text.slice(0, 500); }
  if (!r.ok) throw new ApiError(r.status, classify(r.status, json), `${method} ${path} -> ${r.status}: ${errorText(json)}`, json);
  return json as T;
}

export function selfTest() {
  console.assert(classify(401) === 'auth' && classify(402) === 'credits' && classify(422) === 'invalid', 'classify 4xx');
  console.assert(classify(429) === 'retry' && classify(529) === 'retry' && classify(503) === 'retry' && classify(0) === 'retry', 'classify retry');
  console.assert(classify(422, { last_response: { code: 5000 } }) === 'policy' && classify(200, { code: 5000 }) === 'policy', 'classify policy');
  console.assert(rejected(429) && !rejected(423) && !rejected(503) && !rejected(529) && !rejected(0) && !rejected(502) && !rejected(504) && !rejected(500), 'only documented generic rate-limit rejection is automatically resent');
  console.assert(errorText({ detail: 'Maximum 20 concurrent' }) === 'Maximum 20 concurrent', 'errorText');
}
