import { writable } from 'svelte/store';

export interface ActivityContext {
  label?: string; queueId?: string; queueTag?: string; activityScope?: string; background?: boolean;
  relatedQueueIds?: string[]; relatedScopes?: string[];
}
export interface ApiCost { generations: number | null; usd: number | null }
export interface ApiCall extends ActivityContext {
  id: string;
  method: string;
  endpoint: string;
  url: string;
  body: unknown;
  startedAt: number;
  finishedAt?: number;
  status: number | null;
  state: 'pending' | 'completed' | 'failed';
  background: boolean;
  kind: 'api' | 'download';
  restored?: boolean;
  bodyUnavailable?: boolean;
  costPartial?: boolean;
  cost: ApiCost;
  costSource: 'free' | 'reported' | 'unknown';
  usagePending: boolean;
}

// Request bodies stay in memory only. No headers, credentials or response text enter this store.
export const MAX_FOREGROUND_CALLS = 500;
export const MAX_BACKGROUND_CALLS = 2000;
export const MAX_ACTIVITY_CALLS = MAX_FOREGROUND_CALLS + MAX_BACKGROUND_CALLS;
const store = writable<readonly ApiCall[]>([]);
export const apiActivity = { subscribe: store.subscribe };
const retentionStore = writable({ droppedForeground: 0, droppedBackground: 0 });
export const activityRetention = { subscribe: retentionStore.subscribe };
let retention = { droppedForeground: 0, droppedBackground: 0 };
let calls: ApiCall[] = [];
const jobs = new Map<string, { callId: string; usage?: ApiCost; terminal: boolean }>();
const queued = new Map<string, string>();
const submissionUsage = new Map<string, ApiCost>();

const secretField = /^(?:authorization|proxy-authorization|cookie|set-cookie|password|secret|api[-_]?key|access[-_]?token|refresh[-_]?token|token|credential|signature|sig|x-amz-.+|x-goog-.+)$/i;
/** Safe for display and JSON export, while retaining complete PNG bytes and keypoint arrays. */
export function sanitizeActivityValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeActivityValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, secretField.test(key) ? '[redacted]' : sanitizeActivityValue(item)]));
  if (typeof value === 'string') return /^https?:\/\//i.test(value) ? sanitizeActivityUrl(value) : value.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]');
  return value;
}
export function sanitizeActivityUrl(value: string): string {
  try {
    const url = new URL(value, 'https://api.pixellab.ai');
    url.username = ''; url.password = ''; url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (!['limit', 'offset', 'states'].includes(key)) url.searchParams.set(key, '[redacted]');
    return value.startsWith('/') ? url.pathname + url.search : url.href;
  } catch { return '[invalid URL]'; }
}
function publish() {
  const foreground = calls.filter((call) => !call.background), background = calls.filter((call) => call.background);
  const evicted = new Set([
    ...foreground.slice(0, Math.max(0, foreground.length - MAX_FOREGROUND_CALLS)),
    ...background.slice(0, Math.max(0, background.length - MAX_BACKGROUND_CALLS)),
  ].map((call) => call.id));
  if (evicted.size) {
    retention = { droppedForeground: retention.droppedForeground + foreground.filter((call) => evicted.has(call.id)).length, droppedBackground: retention.droppedBackground + background.filter((call) => evicted.has(call.id)).length };
    calls = calls.filter((call) => !evicted.has(call.id));
    retentionStore.set(retention);
  }
  const retained = new Set(calls.map((call) => call.id));
  for (const [id, job] of jobs) if (!retained.has(job.callId)) jobs.delete(id);
  for (const [id, callId] of queued) if (!retained.has(callId)) queued.delete(id);
  for (const id of submissionUsage.keys()) if (!retained.has(id)) submissionUsage.delete(id);
  store.set(calls);
}
function update(id: string, change: Partial<ApiCall>) {
  calls = calls.map((call) => call.id === id ? { ...call, ...change } : call);
  publish();
}
export function beginActivityCall(method: string, url: string, body?: unknown, context: ActivityContext = {}, kind: ApiCall['kind'] = 'api'): string {
  const safeUrl = sanitizeActivityUrl(url);
  const parsed = new URL(safeUrl, 'https://api.pixellab.ai');
  const endpoint = parsed.origin === 'https://api.pixellab.ai' ? parsed.pathname.replace(/^\/v2(?=\/)/, '') + parsed.search : safeUrl;
  const free = method !== 'POST';
  const call: ApiCall = {
    label: context.label, queueId: context.queueId, queueTag: context.queueTag, activityScope: context.activityScope,
    relatedQueueIds: context.relatedQueueIds ? [...context.relatedQueueIds] : undefined,
    relatedScopes: context.relatedScopes ? [...context.relatedScopes] : undefined,
    id: crypto.randomUUID(), method, url: safeUrl, endpoint,
    body: body === undefined ? null : sanitizeActivityValue(body), startedAt: Date.now(), status: null, state: 'pending', kind,
    background: context.background ?? (kind === 'download' || endpoint === '/balance' || endpoint.startsWith('/background-jobs/') && method === 'GET'),
    cost: free ? { generations: 0, usd: 0 } : { generations: null, usd: null }, costSource: free ? 'free' : 'unknown', usagePending: !free,
  };
  calls = [...calls, call];
  // Only an original queued API request owns this association. Polls, cancellation and downloads share its queueId.
  if (context.queueId && kind === 'api' && !endpoint.startsWith('/background-jobs/')) queued.set(context.queueId, call.id);
  publish();
  return call.id;
}
const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
function usageOf(value: unknown): ApiCost | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const usage = value as { type?: unknown; generations?: unknown; usd?: unknown };
  if (usage.type === 'generations' && amount(usage.generations) !== null) return { generations: amount(usage.generations), usd: 0 };
  if (usage.type === 'usd' && amount(usage.usd) !== null) return { generations: 0, usd: amount(usage.usd) };
  return undefined;
}
function reconcile(callId: string) {
  const owned = [...jobs.values()].filter((job) => job.callId === callId);
  if (!owned.length) return;
  const known = owned.filter((job) => job.usage !== undefined);
  const complete = known.length === owned.length;
  const submitted = submissionUsage.get(callId);
  update(callId, {
    cost: !complete && submitted ? submitted : { generations: known.length ? known.reduce((sum, job) => sum + (job.usage?.generations ?? 0), 0) : null, usd: known.length ? known.reduce((sum, job) => sum + (job.usage?.usd ?? 0), 0) : null },
    costPartial: known.length > 0 && !complete && !submitted,
    costSource: complete || submitted ? 'reported' : 'unknown', usagePending: owned.some((job) => !job.terminal),
  });
}
/** Response metadata only: job ownership and reported usage; never retain arbitrary response contents. */
export function finishActivityCall(id: string, status: number | null, ok: boolean, response?: unknown) {
  const call = calls.find((item) => item.id === id);
  if (!call) return;
  const data = response && typeof response === 'object' ? response as Record<string, unknown> : {};
  const ids = Array.isArray(data.background_job_ids) ? data.background_job_ids.filter((value): value is string => typeof value === 'string') : typeof data.background_job_id === 'string' ? [data.background_job_id] : [];
  const usage = usageOf(data.usage);
  const refused = call.method === 'POST' && !ok && status !== null && [401, 402, 423, 429, 503, 529].includes(status);
  update(id, {
    finishedAt: Date.now(), status, state: ok ? 'completed' : 'failed',
    ...(call.method === 'POST' ? { usagePending: ids.length > 0, ...(usage ? { cost: usage, costSource: 'reported' as const } : refused ? { cost: { generations: 0, usd: 0 }, costSource: 'free' as const } : {}) } : {}),
  });
  if (call.method === 'POST') {
    if (usage) submissionUsage.set(id, usage);
    for (const jobId of ids) jobs.set(jobId, { callId: id, terminal: false });
  }
  if ((call.method === 'GET' || call.method === 'DELETE') && call.endpoint.startsWith('/background-jobs/')) {
    const jobId = decodeURIComponent(call.endpoint.split('/').pop()!.split('?')[0]);
    const owner = jobs.get(jobId);
    if (owner) {
      if (usage) owner.usage = usage;
      owner.terminal = owner.terminal || ['completed', 'failed', 'cancelled'].includes(String(data.status)) || call.method === 'DELETE' && ok;
      reconcile(owner.callId);
    }
  }
}

export interface RestoredActivityRequest extends ActivityContext {
  method: string; endpoint: string; body: unknown; startedAt: number; state: ApiCall['state'];
  jobs: { id: string; done: boolean; usage?: unknown }[];
  usage?: unknown;
  bodyUnavailable?: boolean;
}
export const hasActivityRequest = (queueId: string) => queued.has(queueId);
export const activityRequest = (queueId: string): ApiCall | undefined => calls.find(call => call.id === queued.get(queueId));
/** A previous real submission from the persisted queue, not a newly sent request. */
export function restoreActivityRequest(request: RestoredActivityRequest): string | undefined {
  if (!request.queueId) return undefined;
  const existing = activityRequest(request.queueId);
  // The ledger is an aggregate, so it must never overwrite a locally captured per-attempt HTTP record.
  if (existing && !existing.restored) return existing.id;
  const id = existing?.id ?? beginActivityCall(request.method, `https://api.pixellab.ai/v2${request.endpoint}`, request.body, request);
  const usage = usageOf(request.usage);
  if (usage) submissionUsage.set(id, usage);
  else submissionUsage.delete(id);
  for (const [jobId, job] of jobs) if (job.callId === id) jobs.delete(jobId);
  const free = request.method !== 'POST';
  update(id, { startedAt: request.startedAt, restored: true, bodyUnavailable: request.bodyUnavailable, state: request.state,
    label: request.label, queueTag: request.queueTag, activityScope: request.activityScope, costPartial: false,
    cost: usage ?? (free ? { generations: 0, usd: 0 } : { generations: null, usd: null }),
    costSource: usage ? 'reported' : free ? 'free' : 'unknown', usagePending: request.jobs.some((job) => !job.done) });
  for (const job of request.jobs) jobs.set(job.id, { callId: id, terminal: job.done, usage: usageOf(job.usage) });
  if (request.jobs.length) reconcile(id);
  return id;
}
export function activityTotals(records: readonly ApiCall[]) {
  return records.reduce((total, call) => ({
    generations: total.generations + (call.cost.generations ?? 0), usd: total.usd + (call.cost.usd ?? 0),
    unknown: total.unknown + Number(call.costSource === 'unknown'), pending: total.pending + Number(call.usagePending),
  }), { generations: 0, usd: 0, unknown: 0, pending: 0 });
}
export function exportActivityJson(records: readonly ApiCall[] = calls): string {
  return JSON.stringify(sanitizeActivityValue({ format: 'pixeldoll-api-activity/1', retention: { ...retention, totalsScope: 'retained calls only' }, calls: records.map((call) => ({ ...call, url: sanitizeActivityUrl(call.url), endpoint: sanitizeActivityUrl(call.endpoint) })), totals: activityTotals(records) }), null, 2);
}
export function clearActivity() { calls = []; jobs.clear(); queued.clear(); submissionUsage.clear(); retention = { droppedForeground: 0, droppedBackground: 0 }; retentionStore.set(retention); publish(); }
