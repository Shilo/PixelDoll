import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { sha256 } from '../../src/lib/image/hash.ts';
import { cellHash, DIRECTIONS, type DirectionName, type Rig, type Sha256 } from '../../src/lib/rig/rig.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import { CURRENT_FORMAT, type Project } from '../../src/lib/store/manifest.ts';
import type { StoredProject } from '../../src/lib/store/project.ts';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';
import type { Req } from '../../src/lib/pixellab/routes.ts';
import type { StarterPlan, StarterPresetId } from '../../src/lib/rig/starter-presets.ts';

const mocks = vi.hoisted(() => ({ loadProject: vi.fn(), api: vi.fn(), enqueue: vi.fn(), get: vi.fn(), getBlob: vi.fn(), putCharacter: vi.fn() }));
vi.mock('../../src/lib/store/project.ts', () => ({ loadProject: mocks.loadProject }));
vi.mock('../../src/lib/store/db.ts', () => ({ get: mocks.get, getBlob: mocks.getBlob, putCharacter: mocks.putCharacter }));
vi.mock('../../src/lib/pixellab/client.ts', () => ({ api: mocks.api }));
vi.mock('../../src/ui/motion-lab/run.ts', () => ({ LAB_TAG: 'unit-starter', labQueue: { key: 'synthetic-unit-fixture', enqueue: mocks.enqueue } }));
import { describeStarterPilot, loadStarterSource, prepareStarter, readStarter, starterFrames, starterHeld, starterJobs, submitStarter, STARTER_CAP, STARTER_KEY, type StarterSession } from '../../src/ui/motion-lab/starter-pack.ts';

const PILOT: DirectionName[] = ['south', 'east'];
const MORE = DIRECTIONS.filter(d => !PILOT.includes(d));
let storage: Map<string, string>, records: Map<string, JobRec>, blobs: Map<string, Blob>;
let source: { rec: StoredProject; project: Project }, standing: Map<DirectionName, Uint8Array>;
let originalAvailable: boolean, snapshotRecords: Map<string, StoredProject>, snapshotImages: Map<string, Map<Sha256, Img>>;

function job(id: string, overrides: Partial<JobRec> = {}): JobRec {
  return { id, label: 'Synthetic starter transport', method: 'POST', endpoint: '/characters/animations', params: {}, inputs: [], requestHash: id,
    state: 'queued', attempts: 0, nextAt: 0, createdAt: 0, jobs: [], gens: 0, usd: 0, ...overrides };
}
function persist(session: StarterSession) { storage.set(STARTER_KEY, JSON.stringify(session)); }
function bindings(session: StarterSession) { return Object.fromEntries(Object.entries(session.plans).map(([id, p]) => [id, p.binding])); }
const serverCharacter = () => ({ id: 'unit-character', template_id: 'mannequin', view: 'low top-down',
  rotation_urls: Object.fromEntries(DIRECTIONS.map(d => [d, `https://backblaze.pixellab.ai/unit/${d}.png`])) });

beforeEach(async () => {
  vi.clearAllMocks();
  storage = new Map(); records = new Map(); blobs = new Map(); standing = new Map(); originalAvailable = true; snapshotRecords = new Map(); snapshotImages = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } });
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => unknown) => callback() } });
  const images = new Map<Sha256, Img>(), rest: NonNullable<Rig['rest']> = {}, cells: Partial<Record<DirectionName, Sha256[]>> = {};
  for (const [i, direction] of DIRECTIONS.entries()) {
    const image = makeImg(32, 32); image.data.set([100 + i, 50, 30, 255], (10 * 32 + 15) * 4); image.data.set([50, 30, 10, 255], (30 * 32 + 16) * 4);
    const hash = await cellHash(image); images.set(hash, image); cells[direction] = [hash]; standing.set(direction, await encodePngBytes(image));
    rest[direction] = { image: hash, keypoints: LABELS.map(label => ({ label, x: .5, y: .5 })) };
  }
  const rig: Rig = { template: 'mannequin', view: 'low top-down', cell: { w: 32, h: 32 }, pivot: { x: 16, y: 31 },
    directions: DIRECTIONS.map(id => ({ id })), baseItem: 'body', baseHash: `sha256:${'a'.repeat(64)}`, rest,
    animations: [{ id: 'default', cells: 1, loop: true, frames: [{ cell: 0, ms: 150 }] }] };
  const project: Project = { images, manifest: { format: CURRENT_FORMAT, name: 'Synthetic native eight', app: 'Unit fixture only', rig, materials: [],
    slots: [{ id: 'body', z: 10, class: 'base', required: true }], presets: [],
    items: [{ id: 'body', name: 'Fixture body', slot: 'body', status: 'accepted', mirror: 'generate', materials: [], prompt: 'Synthetic test pixels',
      baseHash: rig.baseHash, provenance: [], layers: [{ id: 'main', z: 10, role: 'fg', cells: { default: cells } }] }] } };
  source = { project, rec: { id: 'rig-starter-unit', savedAt: '', manifest: project.manifest, character: { id: 'unit-character', looks: 'Synthetic native source' }, origin: 'studio' } };
  mocks.loadProject.mockReset().mockImplementation(async (id: string) => {
    if (id === source.rec.id && originalAvailable) return source;
    const snapshot = snapshotRecords.get(id), images = snapshotImages.get(id);
    if (!snapshot || !images) throw new Error('Synthetic source project is unavailable.');
    const rec = structuredClone(snapshot);
    return { rec, project: { manifest: rec.manifest, images: new Map([...images].map(([hash, image]) => [hash, structuredClone(image)])) } };
  });
  mocks.api.mockReset().mockImplementation(async () => serverCharacter());
  mocks.get.mockReset().mockImplementation(async (table: string, id: string) => table === 'projects' ? snapshotRecords.get(id) : records.get(id));
  mocks.getBlob.mockReset().mockImplementation(async (id: string) => blobs.get(id));
  mocks.putCharacter.mockReset().mockImplementation(async (id: string, record: StoredProject, images: Map<string, Blob>) => {
    if (snapshotRecords.has(id)) throw new Error('Synthetic snapshot already exists.');
    const decoded = new Map<Sha256, Img>();
    for (const [hash, blob] of images) decoded.set(`sha256:${hash}`, await decodePngBytes(new Uint8Array(await blob.arrayBuffer())));
    snapshotRecords.set(id, structuredClone(record)); snapshotImages.set(id, decoded);
  });
  mocks.enqueue.mockReset().mockImplementation(async (_request: Req) => { const queued = job('queued-continuation'); records.set(queued.id, queued); return queued; });
  vi.stubGlobal('fetch', vi.fn(async (address: string | URL | Request) => {
    const url = new URL(String(address)), direction = url.pathname.split('/').at(-1)!.replace('.png', '') as DirectionName, bytes = standing.get(direction);
    if (!bytes) throw new Error('Unexpected synthetic asset request.');
    return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]), { status: 200 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

async function completedPilot(session: StarterSession, preset: StarterPresetId): Promise<StarterPlan> {
  const plan = session.plans[preset]!, localId = `local-${preset}`;
  const jobs: JobRec['jobs'] = [];
  for (const [d, direction] of PILOT.entries()) {
    const results = [];
    for (let i = 0; i < plan.frames; i++) {
      const image = makeImg(48, 48); image.data.set([90 + d, 60 + i, 40, 255], (20 * 48 + 20) * 4);
      const bytes = await encodePngBytes(image), sha = await sha256(bytes); blobs.set(sha, new Blob([bytes as Uint8Array<ArrayBuffer>]));
      results.push({ label: `${direction}/${i}`, sha, w: 48, h: 48 });
    }
    jobs.push({ id: `${preset}-${direction}`, status: 'completed', done: true, results });
  }
  records.set(localId, job(localId, { state: 'done', jobs, gens: 6, response: { animation_group_id: `group-${preset}`, directions: PILOT, background_job_ids: jobs.map(j => j.id), status: 'processing' } }));
  session.calls.push({ id: `hold-${preset}`, plan, directions: [...PILOT], units: 8, recordId: localId }); persist(session); return plan;
}

test('free preparation is idempotent and retains paid-plan bindings instead of minting a new seed', async () => {
  const first = await prepareStarter(source.rec.id), before = bindings(first);
  await completedPilot(first, 'slash');
  const preparedAgain = await prepareStarter(source.rec.id);
  expect(bindings(preparedAgain)).toEqual(before); expect(preparedAgain.calls).toHaveLength(1);
  expect(preparedAgain.sourceSnapshotId).toBe(first.sourceSnapshotId); expect(mocks.putCharacter).toHaveBeenCalledTimes(1);
  expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.api).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});

test('preparation atomically pins hidden source records and exact standing pixels that survive original deletion', async () => {
  source.rec.creationSpec = 'original-creation-attempt';
  source.rec.moveRecovery = { id: 'old-recovery', originalRigVersion: 'before', bodyRigVersion: 'after', specHash: 'old' };
  const expected = new Map([...source.project.images].map(([hash, image]) => [hash, new Uint8ClampedArray(image.data)]));
  const session = await prepareStarter(source.rec.id), id = session.sourceSnapshotId!;
  expect(id).toMatch(/^starter-source-[a-f0-9]{64}$/); expect(id.startsWith('rig-')).toBe(false);
  const record = snapshotRecords.get(id)!;
  expect(record).toMatchObject({ id, origin: 'dev', character: { id: 'unit-character' } });
  expect(record.creationSpec).toBeUndefined(); expect(record.moveRecovery).toBeUndefined();
  expect(mocks.putCharacter.mock.calls[0][2].size).toBe(source.project.images.size);
  originalAvailable = false;
  source.project.images.clear(); source.rec.manifest.name = 'Original was removed';
  const pinned = await loadStarterSource(session);
  expect(pinned.project.manifest.name).toBe('Synthetic native eight');
  for (const [hash, pixels] of expected) expect(pinned.project.images.get(hash)?.data).toEqual(pixels);
  await expect(submitStarter('walk', PILOT)).rejects.toThrow('unavailable');
  expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.api).not.toHaveBeenCalled();
});

test('an atomic source-pin failure publishes no preparation identity or generation work', async () => {
  mocks.putCharacter.mockRejectedValue(new Error('Simulated atomic source storage failure'));
  await expect(prepareStarter(source.rec.id)).rejects.toThrow('atomic source storage failure');
  expect(storage.has(STARTER_KEY)).toBe(false); expect(snapshotRecords.size).toBe(0);
  expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.api).not.toHaveBeenCalled();
});

test.each(['identity', 'metadata', 'standing pixels', 'missing record'] as const)('review rejects pinned source corruption: %s', async (change) => {
  const session = await prepareStarter(source.rec.id), id = session.sourceSnapshotId!;
  if (change === 'identity') session.sourceSnapshotId = `starter-source-${'0'.repeat(64)}`;
  if (change === 'metadata') snapshotRecords.get(id)!.manifest.rig.view = 'side';
  if (change === 'standing pixels') snapshotImages.get(id)!.values().next().value!.data[0] ^= 1;
  if (change === 'missing record') snapshotRecords.delete(id);
  await expect(loadStarterSource(session)).rejects.toThrow();
  expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.api).not.toHaveBeenCalled();
});

test('a new exact source gets a new retained pin without deleting an earlier source snapshot', async () => {
  const original = await prepareStarter(source.rec.id), oldId = original.sourceSnapshotId!;
  const replacement = makeImg(32, 32); replacement.data.set([100, 70, 40, 255], (12 * 32 + 15) * 4);
  const hash = await cellHash(replacement); source.project.images.set(hash, replacement); source.rec.manifest.rig.rest!.south!.image = hash;
  const changed = await prepareStarter(source.rec.id);
  expect(changed.sourceSnapshotId).not.toBe(oldId); expect(snapshotRecords.has(oldId)).toBe(true); expect(snapshotRecords.size).toBe(2);
  const old = await loadStarterSource(original); expect(old.rec.manifest.rig.rest!.south!.image).not.toBe(hash);
  expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.api).not.toHaveBeenCalled();
});

test('an unresolved reservation survives free preparation and cannot be replayed by another priced click', async () => {
  const session = await prepareStarter(source.rec.id), plan = session.plans.slash!;
  session.calls.push({ id: 'unknown-submit', plan, directions: [...PILOT], units: 8, error: 'Receipt was not saved' }); persist(session);
  expect(bindings(await prepareStarter(source.rec.id))).toEqual(bindings(session));
  await expect(submitStarter('slash', PILOT)).rejects.toThrow('unfinished');
  expect(readStarter().calls).toEqual(session.calls); expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.api).not.toHaveBeenCalled();
});

test('changed standing artwork cannot replace a source plan while a reserved outcome is unresolved', async () => {
  const session = await prepareStarter(source.rec.id), before = bindings(session);
  session.calls.push({ id: 'unresolved', plan: session.plans.walk!, directions: [...PILOT], units: 8 }); persist(session);
  const replacement = makeImg(32, 32); replacement.data.set([120, 40, 20, 255], 0); const hash = await cellHash(replacement);
  source.project.images.set(hash, replacement); source.rec.manifest.rig.rest!.south!.image = hash;
  await expect(prepareStarter(source.rec.id)).rejects.toThrow('reserved or uncertain');
  expect(bindings(readStarter())).toEqual(before);
  await expect(submitStarter('walk', PILOT)).rejects.toThrow('source changed');
  expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.api).not.toHaveBeenCalled();
});

test('a server artwork mismatch is free and blocks enqueue before consuming a generation reservation', async () => {
  await prepareStarter(source.rec.id);
  const wrong = makeImg(32, 32); wrong.data.set([250, 0, 0, 255], 0); standing.set('south', await encodePngBytes(wrong));
  await expect(submitStarter('slash', PILOT)).rejects.toThrow('server artwork differs');
  expect(readStarter().calls).toEqual([]); expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.api).toHaveBeenCalledTimes(1);
});

test.each([
  { label: 'a different camera', metadata: { view: 'side' } },
  { label: 'a different skeleton model', metadata: { template_id: 'bear' } },
  { label: 'an unknown camera', metadata: { view: null } },
  { label: 'an unknown skeleton model', metadata: { template_id: undefined } },
])('server metadata with $label blocks paid work even when its image URLs match', async ({ metadata }) => {
  await prepareStarter(source.rec.id);
  mocks.api.mockResolvedValue({ ...serverCharacter(), ...metadata });
  await expect(submitStarter('walk', PILOT)).rejects.toThrow('server camera or humanoid model differs');
  expect(readStarter().calls).toEqual([]); expect(mocks.enqueue).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});

test('an enqueue failure retains its hold and error; subsequent preparation or submit never resends it', async () => {
  const initial = await prepareStarter(source.rec.id);
  mocks.enqueue.mockRejectedValue(new Error('Simulated connection failure after reservation'));
  await expect(submitStarter('slash', PILOT)).rejects.toThrow('Simulated connection failure');
  const retained = readStarter(); expect(retained.calls).toHaveLength(1); expect(retained.calls[0]).toMatchObject({ units: 8, error: 'Simulated connection failure after reservation' });
  expect(retained.calls[0].recordId).toBeUndefined();
  expect(bindings(await prepareStarter(source.rec.id))).toEqual(bindings(initial));
  await expect(submitStarter('slash', PILOT)).rejects.toThrow('unfinished');
  expect(mocks.enqueue).toHaveBeenCalledTimes(1); expect(mocks.api).toHaveBeenCalledTimes(1);
});

test('starter allocation counts the greater of retained holds and reported charges before another request', async () => {
  const session = await prepareStarter(source.rec.id);
  session.calls.push({ id: 'prior-bill', plan: session.plans.idle!, directions: [...PILOT], units: 8, recordId: 'prior-bill' }); persist(session);
  records.set('prior-bill', job('prior-bill', { state: 'done', gens: STARTER_CAP - 5 }));
  expect(starterHeld(session, records)).toBe(145);
  await expect(submitStarter('walk', PILOT)).rejects.toThrow('allocation is exhausted');
  expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.api).not.toHaveBeenCalled();
  records.get('prior-bill')!.gens = 3; expect(starterHeld(session, records)).toBe(8);
});

test.each([
  { label: 'NaN generation usage', billing: { gens: Number.NaN } },
  { label: 'negative generation usage', billing: { gens: -1 } },
  { label: 'infinite generation usage', billing: { gens: Number.POSITIVE_INFINITY } },
  { label: 'NaN dollar usage', billing: { usd: Number.NaN } },
  { label: 'negative dollar usage', billing: { usd: -0.01 } },
])('$label cannot bypass the starter spending gate', async ({ billing }) => {
  const session = await prepareStarter(source.rec.id);
  session.calls.push({ id: 'invalid-bill', plan: session.plans.idle!, directions: [...PILOT], units: 8, recordId: 'invalid-bill' }); persist(session);
  records.set('invalid-bill', job('invalid-bill', { state: 'done', ...billing }));
  expect(() => starterHeld(session, records)).toThrow('billing is invalid or unverified');
  await expect(submitStarter('walk', PILOT)).rejects.toThrow('billing is invalid or unverified');
  expect(readStarter().calls).toHaveLength(1); expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.api).not.toHaveBeenCalled();
});

test('overflowing otherwise finite usage cannot produce an unpriceable follow-up request', async () => {
  const session = await prepareStarter(source.rec.id);
  for (const id of ['large-bill-a', 'large-bill-b']) {
    session.calls.push({ id, plan: session.plans.idle!, directions: [...PILOT], units: 8, recordId: id });
    records.set(id, job(id, { state: 'done', gens: Number.MAX_VALUE }));
  }
  persist(session);
  await expect(submitStarter('walk', PILOT)).rejects.toThrow('supported numeric range');
  expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.api).not.toHaveBeenCalled();
});

test('a continuation uses its existing group and durably retains the exact reviewed native-frame identities', async () => {
  const session = await prepareStarter(source.rec.id); await completedPilot(session, 'slash');
  const clip = await starterFrames(session, 'slash', await starterJobs(session), false);
  const review = { ...await describeStarterPilot(clip), notes: 'Reviewed this exact south/east native pilot, layout and transitions.' };
  await submitStarter('slash', MORE, review);
  expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  expect(mocks.enqueue.mock.calls[0][0]).toMatchObject({ method: 'POST', path: '/characters/animations', body: { animation_group_id: 'group-slash', directions: MORE } });
  expect(mocks.enqueue.mock.calls[0][1]).toMatchObject({ playerRequested: true, resumeSafe: true });
  expect(readStarter().calls.at(-1)?.pilotReview).toEqual(review);
  expect(readStarter().calls.at(-1)?.recordId).toBe('queued-continuation');
});

test.each(['another action', 'another group', 'changed native pixels'] as const)('a review for %s cannot authorize a continuation', async (change) => {
  const session = await prepareStarter(source.rec.id); await completedPilot(session, 'slash');
  const clip = await starterFrames(session, 'slash', await starterJobs(session), false);
  const review = { ...await describeStarterPilot(clip), notes: 'Review bound to the original pilot.' };
  if (change === 'another action') review.binding = session.plans.walk!.binding;
  if (change === 'another group') review.animationGroupId = 'other-motion';
  if (change === 'changed native pixels') {
    const target = records.get('local-slash')!.jobs[0].results[0].sha, image = makeImg(48, 48); image.data.set([200, 50, 90, 255], (20 * 48 + 20) * 4);
    blobs.set(target, new Blob([await encodePngBytes(image) as Uint8Array<ArrayBuffer>]));
  }
  await expect(submitStarter('slash', MORE, review)).rejects.toThrow('reviewed pilot source, group or native pixels changed');
  expect(readStarter().calls).toHaveLength(1); expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.api).not.toHaveBeenCalled();
});

test('a missing bound pilot review and corrupted local source both block paid work before transport', async () => {
  const session = await prepareStarter(source.rec.id); await completedPilot(session, 'slash');
  await expect(submitStarter('slash', MORE)).rejects.toThrow('Record a visual review');
  expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.api).not.toHaveBeenCalled();
  const hash = source.rec.manifest.rig.rest!.south!.image;
  source.project.images.get(hash)!.data[0] = 255;
  await expect(submitStarter('walk', PILOT)).rejects.toThrow('Stored standing pixels differ');
  expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.api).not.toHaveBeenCalled();
});
