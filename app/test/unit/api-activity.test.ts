import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';
import { api } from '../../src/lib/pixellab/client.ts';
import { downloadCharacter } from '../../src/lib/pixellab/library.ts';
import { Queue, type JobRec } from '../../src/lib/pixellab/queue.ts';
import { apiActivity, activityRetention, activityTotals, beginActivityCall, clearActivity, exportActivityJson, finishActivityCall, hasActivityRequest, MAX_BACKGROUND_CALLS, restoreActivityRequest } from '../../src/lib/pixellab/activity.ts';

beforeEach(clearActivity);
afterEach(() => vi.unstubAllGlobals());
const snapshot = () => get(apiActivity);
const usage = (generations: number) => ({ type: 'generations' as const, generations });
function finishJob(id: string, generations?: number) {
  const poll = beginActivityCall('GET', `https://api.pixellab.ai/v2/background-jobs/${id}`);
  finishActivityCall(poll, 200, true, { status: 'completed', usage: generations === undefined ? null : usage(generations) });
}

test('records exact sent bodies without auth and reconciles repeated polls to one charged submission', async () => {
  const body = { description: 'hood', frames: [{ image: { type: 'base64', base64: 'actual-image-bytes' } }], seed: 7 };
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ background_job_id: 'job-1' }))
    .mockImplementation(() => Promise.resolve(Response.json({ status: 'completed', usage: usage(10) })));
  vi.stubGlobal('fetch', fetchMock);
  await api('unit-test-credential', 'POST', '/edit-animation-v2', body, undefined, { queueId: 'queue-1', queueTag: 'm3', label: 'Hood' });
  expect(snapshot()[0]).toMatchObject({ body, cost: { generations: null, usd: null }, costSource: 'unknown', queueId: 'queue-1', queueTag: 'm3' });
  await api('unit-test-credential', 'GET', '/background-jobs/job-1');
  await api('unit-test-credential', 'GET', '/background-jobs/job-1');
  expect(snapshot()[0]).toMatchObject({ cost: { generations: 10, usd: 0 }, usagePending: false });
  expect(snapshot().slice(1).every((call) => call.background && call.cost.generations === 0)).toBe(true);
  expect(activityTotals(snapshot())).toEqual({ generations: 10, usd: 0, unknown: 0, pending: 0 });
  expect(exportActivityJson()).not.toContain('unit-test-credential');
  expect(fetchMock.mock.calls[0]![1].headers.authorization).toBe('Bearer unit-test-credential');
  expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' });
});

test('paid automatic measurements remain foreground and failed calls have unknown cost', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ usage: usage(0.1), keypoints: [] }))
    .mockRejectedValueOnce(new TypeError('offline')));
  await api('test-key', 'POST', '/estimate-skeleton', { image: { type: 'base64', base64: 'image' } });
  await expect(api('test-key', 'POST', '/animate-with-skeleton-v3', { seed: 7 })).rejects.toThrow('network error');
  expect(snapshot()[0]).toMatchObject({ background: false, cost: { generations: 0.1, usd: 0 } });
  expect(snapshot()[1]).toMatchObject({ state: 'failed', status: null, costSource: 'unknown', cost: { generations: null, usd: null } });
  expect(activityTotals(snapshot())).toMatchObject({ generations: 0.1, unknown: 1 });
});

test('rejected attempts are distinct from a subsequent charged attempt', () => {
  const rejected = beginActivityCall('POST', '/edit-animation-v2', { seed: 7 }, { queueId: 'queue-1' });
  finishActivityCall(rejected, 429, false);
  const sent = beginActivityCall('POST', '/edit-animation-v2', { seed: 7 }, { queueId: 'queue-1' });
  finishActivityCall(sent, 200, true, { background_job_id: 'job-2' });
  finishJob('job-2', 10);
  expect(snapshot().filter((call) => call.method === 'POST')).toHaveLength(2);
  expect(snapshot()[0].cost.generations).toBe(0);
  expect(activityTotals(snapshot()).generations).toBe(10);
});

test('multi-job partial charges and missing usage remain honest; dollar billing is separate', () => {
  const sent = beginActivityCall('POST', '/characters/animations');
  finishActivityCall(sent, 200, true, { background_job_ids: ['south', 'east', 'north'] });
  finishJob('south', 3);
  expect(snapshot()[0]).toMatchObject({ costPartial: true, costSource: 'unknown', cost: { generations: 3, usd: 0 } });
  finishJob('east');
  const poll = beginActivityCall('GET', '/background-jobs/north');
  finishActivityCall(poll, 200, true, { status: 'failed', usage: { type: 'usd', usd: 0.25 } });
  expect(snapshot()[0]).toMatchObject({ costPartial: true, usagePending: false });
  expect(activityTotals(snapshot())).toEqual({ generations: 3, usd: 0.25, unknown: 1, pending: 0 });
});

test('the poll that reports a terminal job keeps its status and error for the export', () => {
  const sent = beginActivityCall('POST', '/edit-animation-v2');
  finishActivityCall(sent, 200, true, { background_job_id: 'stockings' });
  const running = beginActivityCall('GET', '/background-jobs/stockings');
  finishActivityCall(running, 200, true, { status: 'processing', last_response: { progress: 0.5 } });
  const failed = beginActivityCall('GET', '/background-jobs/stockings');
  finishActivityCall(failed, 200, true, { status: 'failed', last_response: { error: 'worker timed out' } });
  const refused = beginActivityCall('GET', '/background-jobs/other');
  finishActivityCall(refused, 200, true, { status: 'failed', last_response: { code: 5000, error: 'content policy' } });
  finishJob('done');
  const calls = (JSON.parse(exportActivityJson()) as { calls: { job?: unknown }[] }).calls;
  expect(calls.map((call) => call.job)).toEqual([undefined, undefined, { status: 'failed', error: 'worker timed out' }, { status: 'failed', error: 'content policy', policy: true }, { status: 'completed' }]);
});

test('restored queue jobs receive their final cost without inventing a new submission', () => {
  const input = { queueId: 'restored', queueTag: 'studio-base', label: 'Body', method: 'POST', endpoint: '/create-character-v3', body: { description: 'body', seed: 1 }, startedAt: 100, state: 'pending' as const, jobs: [{ id: 'old-job', done: false }] };
  const first = restoreActivityRequest(input);
  expect(restoreActivityRequest(input)).toBe(first);
  finishJob('old-job', 2);
  expect(snapshot()[0]).toMatchObject({ restored: true, startedAt: 100, queueId: 'restored', cost: { generations: 2, usd: 0 } });
  expect(snapshot().filter((call) => call.method === 'POST')).toHaveLength(1);
});

test('polling retention never evicts a pending generation or loses its final usage', () => {
  const sent = beginActivityCall('POST', '/animate-with-skeleton-v3', { seed: 1 }, { activityScope: 'move-one' });
  finishActivityCall(sent, 200, true, { background_job_id: 'long-job' });
  for (let i = 0; i < MAX_BACKGROUND_CALLS + 10; i++) {
    const poll = beginActivityCall('GET', '/background-jobs/long-job');
    finishActivityCall(poll, 200, true, { status: 'processing' });
  }
  finishJob('long-job', 3);
  expect(snapshot()[0]).toMatchObject({ id: sent, activityScope: 'move-one', cost: { generations: 3, usd: 0 }, costSource: 'reported' });
  expect(activityTotals(snapshot())).toEqual({ generations: 3, usd: 0, unknown: 0, pending: 0 });
  expect(get(activityRetention).droppedBackground).toBe(11);
});

test('reported submission usage remains available when terminal poll omits usage', () => {
  const sent = beginActivityCall('POST', '/create-character-v3');
  finishActivityCall(sent, 200, true, { background_job_id: 'known-charge', usage: usage(2) });
  finishJob('known-charge');
  expect(snapshot()[0]).toMatchObject({ cost: { generations: 2, usd: 0 }, costSource: 'reported', usagePending: false });
});

test('cancel usage is attributed to the paid request, while cancellation itself stays free', () => {
  const id = beginActivityCall('POST', '/create-character-v3');
  finishActivityCall(id, 200, true, { background_job_id: 'canceled-job' });
  const stop = beginActivityCall('DELETE', '/background-jobs/canceled-job');
  finishActivityCall(stop, 200, true, { status: 'cancelled', usage: usage(1) });
  expect(snapshot()[0]).toMatchObject({ cost: { generations: 1, usd: 0 }, usagePending: false });
  expect(snapshot()[1]).toMatchObject({ background: false, costSource: 'free', cost: { generations: 0, usd: 0 } });
});

test('public ZIP downloads stay unauthenticated and record completion/failure', async () => {
  const uuid = '5352683c-54aa-4617-b303-e942e472c66d';
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])))
    .mockResolvedValueOnce(new Response(null, { status: 404 }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await downloadCharacter(uuid)).toEqual(new Uint8Array([1, 2, 3]));
  await expect(downloadCharacter(uuid)).rejects.toThrow('could not find');
  expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: 'omit' });
  expect(fetchMock.mock.calls[0]![1].headers).toBeUndefined();
  expect(snapshot()[0]).toMatchObject({ kind: 'download', background: false, state: 'completed', costSource: 'free' });
  expect(snapshot()[1]).toMatchObject({ state: 'failed', status: 404 });
});

test('sanitizes secret fields and signed URL parameters, preserves image data, and bounds retained history', () => {
  const body = { Authorization: 'secret', nested: { api_key: 'hidden', image_url: 'https://storage.example.test/art?token=private', keypoints: [{ label: 'NOSE' }], image: { type: 'base64', base64: 'complete-png' } } };
  beginActivityCall('POST', '/edit-animation-v2', body);
  beginActivityCall('GET', 'https://storage.example.test/image.png?X-Amz-Signature=private&token=hidden', undefined, {}, 'download');
  const exported = exportActivityJson();
  expect(exported).not.toContain('private');
  expect(exported).not.toContain('hidden');
  expect(exported).toContain('complete-png');
  expect(exported).toContain('keypoints');
  for (let i = 0; i < MAX_BACKGROUND_CALLS + 4; i++) beginActivityCall('GET', '/balance');
  expect(snapshot()).toHaveLength(MAX_BACKGROUND_CALLS + 1);
  expect(snapshot()[0].method).toBe('POST');
  expect(get(activityRetention)).toEqual({ droppedForeground: 0, droppedBackground: 5 });
});

test('related job/scope associations survive recording and export without sharing mutable arrays', () => {
  const context = { relatedQueueIds: ['queue-one', 'queue-two'], relatedScopes: ['scope-one', 'scope-two'], background: true };
  const id = beginActivityCall('GET', '/balance', undefined, context);
  finishActivityCall(id, 200, true);
  context.relatedQueueIds.push('later-queue'); context.relatedScopes.push('later-scope');
  expect(snapshot()[0]).toMatchObject({ relatedQueueIds: ['queue-one', 'queue-two'], relatedScopes: ['scope-one', 'scope-two'] });
  expect(JSON.parse(exportActivityJson()).calls[0].relatedScopes).toEqual(['scope-one', 'scope-two']);
});

function memoryQueue(records: Map<string, JobRec>) {
  return new Queue({
    all: async () => [...records.values()].map(record => structuredClone(record)),
    put: async (id, record) => { records.set(id, structuredClone(record)); },
    putBlob: async () => 'missing-input', getBlob: async () => undefined,
    locks: null, online: () => true, now: () => 1000,
  });
}
test('input preparation failure never records a paid request, including after reloading its failed queue record', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  const records = new Map<string, JobRec>(), queue = memoryQueue(records);
  const record = await queue.enqueue({ method: 'POST', path: '/edit-animation-v2', body: { seed: 1, image: { type: 'base64', base64: 'aA==' } } });
  queue.setKey('test-key');
  await queue.tick();
  expect(records.get(record.id)).toMatchObject({ state: 'failed', attempts: 0, requestStarted: false, error: expect.stringContaining('nothing was sent') });
  expect(snapshot().filter(call => !call.background)).toEqual([]);
  const reloaded = memoryQueue(records); await reloaded.load(); reloaded.setKey('test-key'); await reloaded.tick();
  expect(snapshot().filter(call => !call.background)).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled(); // Missing inputs fail before account lookup or a submission attempt.
});

test.each([false, true, undefined])('crash restore distinguishes known-unsent preparation from unknown transport (%s)', async (requestStarted) => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  const record: JobRec = { id: 'interrupted', label: 'Interrupted body', method: 'POST', endpoint: '/create-character-v3', params: { description: 'body', seed: 1 }, inputs: [], requestHash: 'hash', state: 'submitting', attempts: 1, requestStarted, nextAt: 0, createdAt: 1000, jobs: [], gens: 0, usd: 0 };
  const records = new Map([[record.id, record]]), reloaded = memoryQueue(records);
  await reloaded.load(); reloaded.setKey('test-key'); await reloaded.tick();
  if (requestStarted === false) {
    expect(records.get(record.id)).toMatchObject({ state: 'failed', error: expect.stringContaining('nothing was sent') });
    expect(snapshot()).toEqual([]);
  } else {
    expect(records.get(record.id)?.state).toBe('lost');
    expect(snapshot()).toMatchObject([{ restored: true, state: 'failed', costSource: 'unknown' }]);
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

test('legacy missing-input failure is not reconstructed as a paid request', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  const record: JobRec = { id: 'legacy', label: 'Missing legacy input', method: 'POST', endpoint: '/edit-animation-v2', params: { seed: 1 }, inputs: [], requestHash: 'hash', state: 'failed', attempts: 1, nextAt: 0, createdAt: 1000, jobs: [], gens: 0, usd: 0, error: 'input image missing from storage; nothing was sent' };
  await memoryQueue(new Map([[record.id, record]])).load();
  expect(snapshot()).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

function completedRecord(id: string, scope = 'follower-operation'): JobRec {
  return { id, activityScope: scope, label: 'Saved body', method: 'POST', endpoint: '/create-character-v3', params: { description: 'saved body', reference_image: { type: 'base64', $blob: 'saved-png', format: 'png' }, seed: 7 }, inputs: ['saved-png'], requestHash: 'hash', state: 'done', attempts: 1, requestStarted: true, nextAt: 0, createdAt: 1000, submittedAt: 1001, finishedAt: 1002, jobs: [{ id: `${id}-remote`, status: 'completed', done: true, results: [], usage: usage(2) }], gens: 2, usd: 0 };
}

test('follower inspection lazily restores mirrored bodies/costs and refreshes usage without another PNG read', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  const record = completedRecord('mirrored'), records = new Map([[record.id, record]]);
  const getBlob = vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])]));
  const queue = new Queue({ all: async () => [...records.values()].map(r => structuredClone(r)), getBlob, locks: null });
  queue.role = 'follower'; await queue.sync();
  expect(snapshot()).toEqual([]); expect(getBlob).not.toHaveBeenCalled();
  await Promise.all([queue.inspectActivity([record.id]), queue.inspectActivity([], 'follower-operation')]);
  expect(snapshot()).toMatchObject([{ queueId: 'mirrored', restored: true, body: { description: 'saved body', reference_image: { type: 'base64', base64: 'AQID', format: 'png' }, seed: 7 }, cost: { generations: 2, usd: 0 }, costSource: 'reported' }]);
  const restoredId = snapshot()[0].id;
  expect(getBlob).toHaveBeenCalledTimes(1);
  record.jobs[0].usage = usage(3); record.gens = 3;
  await queue.sync(); await queue.inspectActivity([record.id]);
  expect(snapshot()).toHaveLength(1);
  expect(snapshot()[0]).toMatchObject({ id: restoredId, cost: { generations: 3, usd: 0 } });
  expect(getBlob).toHaveBeenCalledTimes(1);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('inspection never replaces real locally captured attempts with aggregate mirrored usage', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  const record = completedRecord('local-owner');
  const local = beginActivityCall('POST', '/create-character-v3', { description: 'actual submitted body' }, { queueId: record.id });
  finishActivityCall(local, 200, true, { usage: usage(1) });
  const getBlob = vi.fn(async () => new Blob(['unused']));
  const queue = new Queue({ all: async () => [structuredClone(record)], getBlob, locks: null });
  queue.role = 'follower'; await queue.sync(); await queue.inspectActivity([record.id]);
  expect(snapshot()).toHaveLength(1);
  expect(snapshot()[0]).toMatchObject({ id: local, body: { description: 'actual submitted body' }, cost: { generations: 1, usd: 0 } });
  expect(snapshot()[0].restored).toBeUndefined();
  expect(getBlob).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
});

test('inspection omits never-attempted and known-unsent records and keeps missing usage unknown', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  const queued = { ...completedRecord('never-sent'), attempts: 0, requestStarted: false, state: 'queued' as const, jobs: [] };
  const preparationFailed = { ...completedRecord('preparation-failed'), state: 'failed' as const, requestStarted: false, error: 'nothing was sent', jobs: [] };
  const legacyFailed = { ...completedRecord('legacy-unsent'), state: 'failed' as const, requestStarted: undefined, error: 'input image missing; nothing was sent', jobs: [] };
  const unknown = completedRecord('unknown-cost'); unknown.jobs[0].usage = null;
  const queue = new Queue({ all: async () => [queued, preparationFailed, legacyFailed, unknown].map(r => structuredClone(r)), getBlob: async () => new Blob(['image']), locks: null });
  queue.role = 'follower'; await queue.sync(); await queue.inspectActivity([], 'follower-operation');
  expect(snapshot()).toMatchObject([{ queueId: 'unknown-cost', cost: { generations: null, usd: null }, costSource: 'unknown', usagePending: false }]);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('queued GET originals are inspectable once and a related poll cannot replace their association', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  const record = { ...completedRecord('read-character'), method: 'GET' as const, endpoint: '/characters/managed-id', params: null, inputs: [], jobs: [] };
  const queue = new Queue({ all: async () => [structuredClone(record)], locks: null });
  queue.role = 'follower'; await queue.sync(); await queue.inspectActivity([record.id]);
  expect(hasActivityRequest(record.id)).toBe(true);
  const restoredId = snapshot()[0].id;
  const poll = beginActivityCall('GET', '/background-jobs/related-job', undefined, { queueId: record.id });
  finishActivityCall(poll, 200, true, { status: 'processing' });
  await queue.inspectActivity([record.id]);
  expect(snapshot().filter(call => call.restored)).toHaveLength(1);
  expect(snapshot()[0]).toMatchObject({ id: restoredId, method: 'GET', endpoint: '/characters/managed-id', costSource: 'free' });
  expect(fetchMock).not.toHaveBeenCalled();
});
