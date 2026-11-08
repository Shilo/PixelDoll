// fetch wrapper for PixelLab REST v2. The key only ever goes into the Authorization header.
import { beginActivityCall, finishActivityCall, type ActivityContext } from './activity.ts';

// Agent dev server only: a local API server for a PIXELLAB_SECRET_DEV token (vite.config.ts). Builds keep only the public URL.
// Node imports this module without Vite (Playwright specs, scripts/): no import.meta.env, so the chain stops before the
// Vite-defined __AGENT_API_BASE__ and they get the public URL.
export const API_BASE = (import.meta.env?.DEV && import.meta.env.MODE === 'agent' && __AGENT_API_BASE__) || 'https://api.pixellab.ai/v2';
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
  retryAfterMs?: number;
  constructor(status: number, kind: ErrorKind, message: string, body?: unknown, retryAfterMs?: number) {
    super(message);
    this.status = status;
    this.kind = kind;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
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

/** A network interruption pauses the queue; a timeout or caller abort does not imply the browser is offline. */
export const isNetwork = (e: unknown) => e instanceof ApiError && e.status === 0 && !!(e.body as { network?: boolean } | undefined)?.network;

/** A documented concurrency/rate-limit rejection can be retried. Other server failures do not prove a paid request was unsent.
 * Known route-specific no-job refusals are checked separately in queue.submit; free GET requests still retry transient errors. */
export const rejected = (status: number) => status === 429;

const NO_ANIMATION_JOBS = /^Failed to start any animation jobs[.!]?$/i;
/** An accepted job identifier contradicts a retryable status, including when wrapped in last_response. */
export const hasJobEvidence = (value: unknown): boolean => {
  for (let body = value; body && typeof body === 'object'; body = (body as Record<string, unknown>).last_response) {
    const b = body as Record<string, unknown>;
    if (b.background_job_id != null && b.background_job_id !== '') return true;
    if (b.background_job_ids != null && (!Array.isArray(b.background_job_ids) || b.background_job_ids.length)) return true;
  }
  return false;
};
/** B15 observed a simple root refusal on this route; any additional payload makes the paid outcome uncertain. */
export const noAnimationJobsStarted = (endpoint: string, error: ApiError): boolean => {
  if (endpoint !== '/characters/animations' || error.status !== 500) return false;
  if (typeof error.body === 'string') return NO_ANIMATION_JOBS.test(error.body.trim());
  if (!error.body || typeof error.body !== 'object' || Array.isArray(error.body)) return false;
  const messages = Object.entries(error.body);
  return messages.length > 0 && messages.every(([key, message]) => (key === 'detail' || key === 'error') && typeof message === 'string' && NO_ANIMATION_JOBS.test(message.trim()));
};

/** Shared paid-outcome contract: headers or job evidence alone never prove an uncharged refusal. */
export function paidRequestRejected(endpoint: string, status: number | null, body: unknown, responseRead = true): boolean {
  return responseRead && !hasJobEvidence(body) && (status === 401 || status === 402 || status === 429 || noAnimationJobsStarted(endpoint, new ApiError(status ?? 0, 'retry', '', body)));
}

/** Retry-After is a lower bound; accept both seconds and an HTTP date when CORS exposes it. */
export function retryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value?.trim()) return undefined;
  const delay = /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) && delay >= 0 ? delay : undefined;
}

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

function transportError(error: unknown, responseStatus?: number): ApiError {
  const name = (error as Error)?.name, message = (error as Error)?.message ?? String(error);
  // Unread bytes can hide accepted job IDs, even after rejection-looking headers. Status 0 prevents a paid resend.
  return new ApiError(0, 'retry', `${responseStatus === undefined ? 'network error' : 'response body error'}: ${message}`, {
    network: name !== 'TimeoutError' && name !== 'AbortError', ...(responseStatus === undefined ? {} : { responseStatus }),
  });
}

export async function api<T>(key: string, method: string, path: string, body?: unknown, signal?: AbortSignal, context?: ActivityContext): Promise<T> {
  if (!key) throw new ApiError(401, 'auth', 'no API key set');
  const activityId = beginActivityCall(method, API_BASE + path, body, context);
  let r: Response;
  try {
    r = await fetch(API_BASE + path, {
      method,
      credentials: 'omit',
      redirect: 'error', // an authenticated call must not follow an unexpected redirect
      cache: 'no-store',
      headers: { authorization: `Bearer ${key}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: signal ?? AbortSignal.timeout(timeoutFor(method, path)), // a hung request never holds a queue slot forever
    });
  } catch (e) {
    finishActivityCall(activityId, null, false);
    throw transportError(e);
  }
  let text: string;
  try { text = await r.text(); }
  catch (e) { finishActivityCall(activityId, r.status, false, undefined, false); throw transportError(e, r.status); }
  let json: unknown;
  try { json = text ? JSON.parse(text) : null; } catch { json = text.slice(0, 500); }
  finishActivityCall(activityId, r.status, r.ok, json);
  if (!r.ok) throw new ApiError(r.status, classify(r.status, json), `${method} ${path} -> ${r.status}: ${errorText(json)}`, json, retryAfter(r.headers.get('retry-after')));
  return json as T;
}

export function selfTest() {
  console.assert(classify(401) === 'auth' && classify(402) === 'credits' && classify(422) === 'invalid', 'classify 4xx');
  console.assert(classify(429) === 'retry' && classify(529) === 'retry' && classify(503) === 'retry' && classify(0) === 'retry', 'classify retry');
  console.assert(classify(422, { last_response: { code: 5000 } }) === 'policy' && classify(200, { code: 5000 }) === 'policy', 'classify policy');
  console.assert(rejected(429) && !rejected(423) && !rejected(503) && !rejected(529) && !rejected(0) && !rejected(502) && !rejected(504) && !rejected(500), 'only documented generic rate-limit rejection is automatically resent');
  console.assert(errorText({ detail: 'Maximum 20 concurrent' }) === 'Maximum 20 concurrent', 'errorText');
}
