import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { makeImg, bytesToBase64 } from '../../src/lib/image/png.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import type { Rig } from '../../src/lib/rig/rig.ts';

const controls = vi.hoisted(() => ({
	key: 'synthetic-agent-only',
	block: null as string | null | ((path: string) => string | null),
	jobs: [] as { id: string; requestHash: string }[],
	blobs: new Map<string, Blob>(),
	enqueue: vi.fn(),
	persist: vi.fn()
}));
vi.mock('../../src/lib/pixellab/queue.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/pixellab/queue.ts')>()),
	Queue: class {
		get key() {
			return controls.key;
		}
		planBlocks(request: { path: string }) {
			return typeof controls.block === 'function' ? controls.block(request.path) : controls.block;
		}
		enqueue(...args: unknown[]) {
			return controls.enqueue(...args);
		}
	}
}));
vi.mock('../../src/lib/store/db.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/store/db.ts')>()),
	all: async () => controls.jobs,
	getBlob: async (hash: string) => controls.blobs.get(hash),
	updateCharacter: (...args: unknown[]) => controls.persist(...args)
}));
import {
	parseTrialPacket,
	persistPreparedTrialPlan,
	prepareTrial,
	prepareTrialPlan,
	readTrials,
	restorePreparedTrialPlan,
	submitTrial,
	submitTrialPlan,
	type TrialPacket,
	type TrialPlan
} from '../../src/ui/item-trial/trial.ts';

let values: Map<string, string>;
beforeEach(() => {
	controls.key = 'synthetic-agent-only';
	controls.block = null;
	controls.jobs = [];
	controls.enqueue.mockReset().mockResolvedValue({ id: 'synthetic-saved-job' });
	controls.blobs.clear();
	controls.persist.mockReset().mockImplementation(async (_id: string, blobs: Map<string, Blob>) => {
		for (const [hash, blob] of blobs) controls.blobs.set(hash, blob);
	});
	values = new Map([['pixeldoll.motionLab.2026-10-28', 'historical motion journal']]);
	const tails = new Map<string, Promise<unknown>>();
	vi.stubEnv('MODE', 'agent');
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value)
	});
	vi.stubGlobal('navigator', {
		locks: {
			request: <T>(key: string, work: () => T) => {
				const next = (tails.get(key) ?? Promise.resolve()).catch(() => undefined).then(work);
				tails.set(key, next);
				return next;
			}
		}
	});
	const window = {} as { top: unknown };
	window.top = window;
	vi.stubGlobal('window', window);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

async function packet(): Promise<TrialPacket> {
	const body = makeImg(32, 32);
	for (let y = 8; y < 28; y++)
		for (let x = 12; x < 20; x++) body.data.set([180, 100, 60, 255], (y * 32 + x) * 4);
	const png = bytesToBase64(await encodePngBytes(body));
	return {
		version: 1,
		id: 'synthetic-trial-1',
		label: 'Synthetic garment trial',
		caseId: 'synthetic-fixture',
		direction: 'south',
		anim: 'walk',
		seed: 123,
		prompt: 'a red tunic',
		slot: 'body',
		key: 'green',
		cell: { w: 32, h: 32 },
		rig: { cell: { w: 32, h: 32 } } as Rig,
		reference: { base: png, raw: png, layer: png },
		targets: [0, 1].map((i) => ({ key: `walk/south/${i}`, base: png, expectedLayer: png }))
	};
}

test('paired edit and transfer use the same conditioned source and exact keyed targets', async () => {
	const p = await packet();
	p.reference.conditioned = p.reference.raw;
	p.targets[0].keyed = p.targets[0].base;
	const edit = await prepareTrial(p, 'edit'),
		transfer = await prepareTrial(p, 'transfer');
	const a = edit.request.body as { frames: { image: { base64: string } }[]; description: string };
	const b = transfer.request.body as {
		reference_image: { image: { base64: string } };
		frames: { image: { base64: string } }[];
	};
	expect(a.frames[0]).toEqual(b.reference_image);
	expect(a.frames.slice(1)).toEqual(b.frames);
	expect(a.description).toContain('frame 1 = reference');
	expect(a.description).toContain('2 cells walk');
	expect(edit.expectedResults).toBe(3);
	expect(transfer.expectedResults).toBe(2);
	expect(edit.inputs).toHaveLength(3);
	expect(edit.packetHash).toBe(transfer.packetHash);
});

test('target palette preparation normalizes exact hex colors and rejects unsupported or ambiguous palettes', async () => {
	const p = await packet();
	const source = { ...p, targetPalette: { colors: ['#00FFFF', '#AA2200'] } };
	expect((await parseTrialPacket(source)).targetPalette).toEqual({
		colors: ['#00ffff', '#aa2200']
	});
	expect(source.targetPalette.colors).toEqual(['#00FFFF', '#AA2200']);
	for (const targetPalette of [
		null,
		{},
		{ colors: [] },
		{ colors: ['#112233'] },
		{ colors: ['#aabbcc', '#AABBCC'] },
		{ colors: ['#123', '#123456'] },
		{ colors: ['red', '#123456'] },
		{ colors: ['#112233', 0] },
		{ colors: ['#112233', '#445566'], max_colors: 2 },
		{ colors: Array.from({ length: 257 }, (_, i) => `#${i.toString(16).padStart(6, '0')}`) }
	]) {
		await expect(parseTrialPacket({ ...p, targetPalette })).rejects.toThrow(
			'2–256 distinct six-digit hex colors'
		);
	}
	expect(
		(
			await parseTrialPacket({
				...p,
				targetPalette: {
					colors: Array.from({ length: 256 }, (_, i) => `#${i.toString(16).padStart(6, '0')}`)
				}
			})
		).targetPalette!.colors
	).toHaveLength(256);
	expect(readTrials()).toEqual([]);
	expect(controls.enqueue).not.toHaveBeenCalled();
});

test('target palettes change only the edit or transfer palette condition and preserve source image identities', async () => {
	const p = await packet(),
		targetPalette = { colors: ['#00ffff', '#aa2200'] };
	for (const arm of ['edit', 'transfer'] as const) {
		const control = await prepareTrial(p, arm),
			variant = await prepareTrial({ ...p, targetPalette }, arm);
		const { target_palette, ...body } = variant.request.body as Record<string, unknown>;
		expect(target_palette).toEqual(targetPalette);
		expect(body).toEqual(control.request.body);
		expect(variant.request.path).toBe(control.request.path);
		expect(variant.requestHash).not.toBe(control.requestHash);
		expect(variant.packetHash).not.toBe(control.packetHash);
		expect(variant.inputs).toEqual(control.inputs);
		expect(variant.sourcePng).toBe(control.sourcePng);
		expect(variant.targetPngs).toEqual(control.targetPngs);
		expect(variant.estimatedGenerations).toBe(control.estimatedGenerations);
		const omitted = await prepareTrial({ ...p, targetPalette: undefined }, arm);
		expect(omitted.packetHash).toBe(control.packetHash);
		expect(omitted.requestHash).toBe(control.requestHash);
		expect(omitted.request.body).not.toHaveProperty('target_palette');
	}
});

test('a changed prepared palette refuses a new claim and unsupported arms cannot silently ignore it', async () => {
	const p = { ...(await packet()), targetPalette: { colors: ['#00ffff', '#aa2200'] } };
	const prepared = await prepareTrial(p, 'edit');
	prepared.packet.targetPalette!.colors[1] = '#aa3300';
	await expect(submitTrial(prepared)).rejects.toThrow('changed after preparation');
	for (const arm of ['pose', 'grid'] as const)
		await expect(prepareTrial(p, arm)).rejects.toThrow('supported only by the edit and transfer');
	expect(readTrials()).toEqual([]);
	expect(controls.enqueue).not.toHaveBeenCalled();
});

test('validation rejects duplicate or mismatched cells and unsupported route packing before any submission', async () => {
	const duplicate = await packet();
	duplicate.targets[1].key = duplicate.targets[0].key;
	await expect(parseTrialPacket(duplicate)).rejects.toThrow('distinct cells');
	const wrongSize = await packet();
	wrongSize.cell = { w: 80, h: 80 };
	wrongSize.rig.cell = wrongSize.cell;
	await expect(parseTrialPacket(wrongSize)).rejects.toThrow('native canvas');
	await expect(prepareTrial(await packet(), 'pose')).rejects.toThrow('3–15 target poses');
	expect(controls.enqueue).not.toHaveBeenCalled();
});

test('concurrent identical submissions create exactly one durable claim and one queue request', async () => {
	const prepared = await prepareTrial(await packet(), 'edit');
	const results = await Promise.allSettled([submitTrial(prepared), submitTrial(prepared)]);
	expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
	expect(controls.enqueue).toHaveBeenCalledTimes(1);
	expect(readTrials()).toMatchObject([
		{ requestHash: prepared.requestHash, jobId: 'synthetic-saved-job' }
	]);
	expect(readTrials()[0].packet).not.toHaveProperty('targets');
	const stored = controls.persist.mock.calls[0];
	expect(stored[0]).toBe(`item-trial-packet:${prepared.packetHash}`);
	const blob = (stored[1] as Map<string, Blob>).get(prepared.packetHash)!;
	expect(JSON.parse(await blob.text()).targets).toHaveLength(2);
	expect(values.get('pixeldoll.motionLab.2026-10-28')).toBe('historical motion journal');
});

test('unknown submission outcomes retain their claim and cannot be sent again', async () => {
	const prepared = await prepareTrial(await packet(), 'transfer');
	controls.enqueue.mockRejectedValue(new Error('Synthetic transport interruption.'));
	await expect(submitTrial(prepared)).rejects.toThrow('transport interruption');
	expect(readTrials()[0]).toMatchObject({
		requestHash: prepared.requestHash,
		error: 'Synthetic transport interruption.'
	});
	await expect(submitTrial(prepared)).rejects.toThrow('already has a claim');
	expect(controls.enqueue).toHaveBeenCalledTimes(1);
});

test('changed input, an existing queue receipt, and a plan restriction all refuse a new claim', async () => {
	const prepared = await prepareTrial(await packet(), 'edit');
	prepared.packet.prompt = 'a different outfit';
	await expect(submitTrial(prepared)).rejects.toThrow('changed after preparation');
	const current = await prepareTrial(await packet(), 'edit');
	controls.jobs = [{ id: 'synthetic-prior-job', requestHash: current.requestHash }];
	await expect(submitTrial(current)).rejects.toThrow('already has queue receipt');
	controls.jobs = [];
	controls.block = 'Needs PixelLab Tier 1 or higher.';
	await expect(submitTrial(current)).rejects.toThrow('Tier 1');
	expect(readTrials()).toEqual([]);
	expect(controls.enqueue).not.toHaveBeenCalled();
});

test('failure to persist the immutable packet prevents the claim and provider dispatch', async () => {
	controls.persist.mockRejectedValue(new Error('Synthetic packet storage failure.'));
	const prepared = await prepareTrial(await packet(), 'edit');
	await expect(submitTrial(prepared)).rejects.toThrow('packet storage failure');
	expect(readTrials()).toEqual([]);
	expect(controls.enqueue).not.toHaveBeenCalled();
});

async function plan(): Promise<TrialPlan> {
	const source = await packet();
	return {
		version: 1,
		kind: 'pixeldoll-item-trial-plan',
		id: 'synthetic-plan',
		label: 'Two matched routes',
		trials: [
			{ packet: source, arm: 'edit' },
			{ packet: structuredClone(source), arm: 'transfer' }
		]
	};
}

test('preparing a plan is free and permits different routes for the same immutable packet', async () => {
	const prepared = await prepareTrialPlan(await plan());
	expect(prepared.trials).toHaveLength(2);
	expect(prepared.trials[0].packetHash).toBe(prepared.trials[1].packetHash);
	expect(prepared.trials[0].requestHash).not.toBe(prepared.trials[1].requestHash);
	expect(readTrials()).toEqual([]);
	expect(controls.persist).not.toHaveBeenCalled();
	expect(controls.enqueue).not.toHaveBeenCalled();
});

test('duplicate requests within a plan are rejected before any claim', async () => {
	const duplicate = await plan();
	duplicate.trials[1].arm = 'edit';
	await expect(prepareTrialPlan(duplicate)).rejects.toThrow('duplicate paid request identities');
	expect(readTrials()).toEqual([]);
	expect(controls.enqueue).not.toHaveBeenCalled();
});

test('a prepared plan refuses stale source data before enqueueing any of its requests', async () => {
	const prepared = await prepareTrialPlan(await plan());
	prepared.plan.trials[1].packet.prompt = 'a different garment';
	await expect(submitTrialPlan(prepared)).rejects.toThrow('plan changed after preparation');
	expect(readTrials()).toEqual([]);
	expect(controls.enqueue).not.toHaveBeenCalled();
});

test('a blocked later route prevents the entire paid plan from starting', async () => {
	const prepared = await prepareTrialPlan(await plan());
	controls.block = (path) =>
		path === '/transfer-outfit-v2' ? 'Synthetic unsupported later route.' : null;
	await expect(submitTrialPlan(prepared)).rejects.toThrow('unsupported later route');
	expect(readTrials()).toEqual([]);
	expect(controls.enqueue).not.toHaveBeenCalled();
});

test('a nonbinary repair mask is rejected during free preparation', async () => {
	const p = await packet(),
		grid = makeImg(96, 32),
		mask = makeImg(96, 32);
	for (let i = 0; i < mask.data.length; i += 4) mask.data.set([0, 0, 0, 255], i);
	mask.data.set([128, 128, 128, 255], 0);
	p.grid = {
		image: bytesToBase64(await encodePngBytes(grid)),
		mask: bytesToBase64(await encodePngBytes(mask)),
		cols: 3
	};
	await expect(prepareTrial(p, 'grid')).rejects.toThrow('opaque binary hard masks');
	expect(readTrials()).toEqual([]);
	expect(controls.enqueue).not.toHaveBeenCalled();
});

test('explicit plan submission skips existing claims and cannot send the same plan twice', async () => {
	const prepared = await prepareTrialPlan(await plan());
	await submitTrial(prepared.trials[0]);
	expect(await submitTrialPlan(prepared)).toEqual({ submitted: 1, skipped: 1 });
	expect(await submitTrialPlan(prepared)).toEqual({ submitted: 0, skipped: 2 });
	expect(controls.enqueue).toHaveBeenCalledTimes(2);
	expect(readTrials()).toHaveLength(2);
});

test('a failed plan enqueue stops the remaining requests and retains the unknown claim', async () => {
	const prepared = await prepareTrialPlan(await plan());
	controls.enqueue.mockRejectedValue(new Error('Synthetic unresolved dispatch.'));
	await expect(submitTrialPlan(prepared)).rejects.toThrow('unresolved dispatch');
	expect(controls.enqueue).toHaveBeenCalledTimes(1);
	expect(readTrials()).toMatchObject([
		{ requestHash: prepared.trials[0].requestHash, error: 'Synthetic unresolved dispatch.' }
	]);
});

test('a prepared plan survives a reload through a compact pointer and immutable pinned blob without dispatch', async () => {
	const prepared = await prepareTrialPlan(await plan());
	await submitTrial(prepared.trials[0]);
	const claims = JSON.stringify(readTrials()),
		dispatched = controls.enqueue.mock.calls.length;
	await persistPreparedTrialPlan(prepared);
	const restored = await restorePreparedTrialPlan();
	expect(restored?.planHash).toBe(prepared.planHash);
	expect(restored?.trials.map((trial) => trial.requestHash)).toEqual(
		prepared.trials.map((trial) => trial.requestHash)
	);
	const pointer = values.get('pixeldoll.itemTrials.2026-11-06.preparedPlan')!;
	expect(JSON.parse(pointer)).toEqual({ version: 1, planHash: prepared.planHash });
	expect(pointer.length).toBeLessThan(150);
	const pin = controls.persist.mock.calls.find(
		([id]) => id === `item-trial-plan:${prepared.planHash}`
	)!;
	expect((pin[2] as () => unknown)()).toEqual({
		id: `item-trial-plan:${prepared.planHash}`,
		kind: 'item-trial-plan',
		planHash: prepared.planHash
	});
	expect(JSON.stringify(readTrials())).toBe(claims);
	expect(controls.enqueue).toHaveBeenCalledTimes(dispatched);
});

test('plan restoration refuses corrupted pointers, missing blobs and changed source bytes without changing claims', async () => {
	const prepared = await prepareTrialPlan(await plan());
	await persistPreparedTrialPlan(prepared);
	values.set(
		'pixeldoll.itemTrials.2026-11-06.preparedPlan',
		JSON.stringify({ version: 1, planHash: 'bad' })
	);
	await expect(restorePreparedTrialPlan()).rejects.toThrow('pointer is invalid');
	values.set(
		'pixeldoll.itemTrials.2026-11-06.preparedPlan',
		JSON.stringify({ version: 1, planHash: prepared.planHash })
	);
	controls.blobs.clear();
	await expect(restorePreparedTrialPlan()).rejects.toThrow('missing from storage');
	controls.blobs.set(prepared.planHash, new Blob(['changed bytes']));
	await expect(restorePreparedTrialPlan()).rejects.toThrow('hash changed');
	expect(readTrials()).toEqual([]);
	expect(controls.enqueue).not.toHaveBeenCalled();
});

test('a plan persistence failure preserves the prior pointer and refuses stale prepared data', async () => {
	const prepared = await prepareTrialPlan(await plan());
	await persistPreparedTrialPlan(prepared);
	const pointer = values.get('pixeldoll.itemTrials.2026-11-06.preparedPlan');
	controls.persist.mockRejectedValue(new Error('Synthetic plan storage failure.'));
	await expect(persistPreparedTrialPlan(prepared)).rejects.toThrow('plan storage failure');
	expect(values.get('pixeldoll.itemTrials.2026-11-06.preparedPlan')).toBe(pointer);
	prepared.plan.trials[0].packet.prompt = 'unreviewed replacement';
	await expect(persistPreparedTrialPlan(prepared)).rejects.toThrow(
		'changed before it could be retained'
	);
	expect(values.get('pixeldoll.itemTrials.2026-11-06.preparedPlan')).toBe(pointer);
	expect(controls.enqueue).not.toHaveBeenCalled();
});
