// fetch wrapper for PixelLab REST v2. The key only ever goes into the Authorization header.

export const API_BASE = 'https://api.pixellab.ai/v2';
const TIMEOUT_MS = 120_000;

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

/** The server refused before creating a job (OpenAPI: 429/529 rate limit, 503 renderer busy; 423 locked): safe to resubmit.
 * Any other 5xx or a network error (status 0) may come after the job was created, so a paid POST is never resent on those. */
export const rejected = (status: number) => status === 423 || status === 429 || status === 503 || status === 529;

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
      signal: signal ?? AbortSignal.timeout(TIMEOUT_MS), // a hung request never holds a queue slot forever
    });
  } catch (e) {
    throw new ApiError(0, 'retry', `network error: ${(e as Error).message}`);
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
  console.assert(rejected(429) && rejected(503) && !rejected(0) && !rejected(502) && !rejected(504) && !rejected(500), 'rejected = no job created');
  console.assert(errorText({ detail: 'Maximum 20 concurrent' }) === 'Maximum 20 concurrent', 'errorText');
}
