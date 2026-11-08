import { afterEach, expect, test, vi } from 'vitest';
import { makeImg, bytesToBase64, type Img } from '../../src/lib/image/png.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { sha256, stableStringify } from '../../src/lib/image/hash.ts';
import { toChroma } from '../../src/lib/image/chroma.ts';
import { padImg } from '../../src/lib/items/items.ts';

const controls = vi.hoisted(() => ({
	pilot: null as unknown,
	existing: undefined as { id: string } | undefined,
	enqueue: vi.fn(),
	reconcile: vi.fn(async () => {}),
	approvedCanonical: '',
	approvedHash: ''
}));
// Only the synthetic reviewed packet substitutes for the production pin. PNG and request hashes remain real.
vi.mock('../../src/lib/image/hash.ts', async (original) => {
	const real = await original<typeof import('../../src/lib/image/hash.ts')>();
	return {
		...real,
		sha256: (data: Uint8Array | ArrayBuffer | string) =>
			typeof data === 'string' && data === controls.approvedCanonical
				? Promise.resolve(controls.approvedHash)
				: real.sha256(data)
	};
});
vi.mock('../../src/ui/motion-lab/pilot.ts', () => ({ readPilot: () => controls.pilot }));
vi.mock('../../src/ui/motion-lab/run.ts', () => ({
	labQueue: {
		key: 'synthetic-test-session',
		enqueue: (...args: unknown[]) => controls.enqueue(...args),
		subscribe: (read: (value: { jobs: unknown[] }) => void) => {
			read({ jobs: [] });
			return () => {};
		}
	},
	LAB_TAG: 'synthetic-managed-probe',
	reconcileResearchJobs: controls.reconcile,
	existingLabRequest: () => controls.existing
}));
import {
	MANAGED_PROBE_SHA256,
	ARMED_COMPLETION_SHA256,
	parseManagedEquipment,
	readManagedEquipment,
	readArmedCompletion,
	submitManagedEquipment,
	type ManagedEquipmentProbe
} from '../../src/ui/motion-lab/managed-equipment.ts';
import {
	readResearchBudget,
	recordResearchGate,
	recordResearchOutcome,
	reserveResearchCall,
	researchBudgetUsage
} from '../../src/ui/motion-lab/research-budget.ts';

afterEach(() => {
	controls.pilot = null;
	controls.existing = undefined;
	controls.enqueue.mockReset();
	controls.reconcile.mockClear();
	controls.approvedCanonical = '';
	controls.approvedHash = '';
	vi.unstubAllGlobals();
});
async function fixture(gated = true, seed: 731 | 734 = 731) {
	const saved = new Map<string, string>(),
		tails = new Map<string, Promise<unknown>>();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => saved.get(key) ?? null,
		setItem: (key: string, value: string) => saved.set(key, value)
	});
	vi.stubGlobal('navigator', {
		locks: {
			request: <T>(key: string, run: () => T) => {
				const next = (tails.get(key) ?? Promise.resolve()).then(run);
				tails.set(
					key,
					next.catch(() => undefined)
				);
				return next;
			}
		}
	});
	const grid = makeImg(432, 288),
		mask = makeImg(432, 288),
		assets = new Map<string, Uint8Array>(),
		frames: ManagedEquipmentProbe['frames'] = [];
	for (let i = 0; i < mask.data.length; i += 4) mask.data.set([0, 0, 0, 255], i);
	mask.data.set([255, 255, 255, 255], (20 * 432 + 20) * 4);
	const indices = seed === 734 ? [0, 2, 5, 7] : [1, 3, 4, 6];
	for (const [cell, index] of indices.entries()) {
		const native = makeImg(112, 112);
		for (let y = 30; y < 85; y++)
			for (let x = 40; x < 70; x++)
				native.data.set([70 + cell * 20, 40 + y, 25 + x, 255], (y * 112 + x) * 4);
		const bytes = await encodePngBytes(native),
			url = `https://backblaze.pixellab.ai/synthetic/frame-${index}.png`;
		assets.set(url, bytes);
		frames.push({ index, sha256: await sha256(bytes) });
		const chroma = padImg(toChroma(native, 'green'), 16);
		for (let y = 0; y < 144; y++)
			grid.data.set(
				chroma.data.subarray(y * 144 * 4, (y + 1) * 144 * 4),
				((Math.floor(cell / 3) * 144 + y) * 432 + (cell % 3) * 144) * 4
			);
	}
	const fetchMock = vi.fn(async (url: string) => {
		const bytes = assets.get(url);
		if (!bytes) throw new Error('Unexpected synthetic asset request.');
		return new Response(bytes as Uint8Array<ArrayBuffer>);
	});
	vi.stubGlobal('fetch', fetchMock);
	controls.pilot = {
		characterId: 'synthetic-character',
		verification: [0, 1, 2, 3].map(() => ({ changedPixels: 0 })),
		character: {
			animations: [
				{
					animation_group_id: 'synthetic-group',
					directions: [
						{
							direction: 'east',
							frames: Array.from(
								{ length: 8 },
								(_, i) => `https://backblaze.pixellab.ai/synthetic/frame-${i}.png`
							)
						}
					]
				}
			]
		}
	};
	const packet: ManagedEquipmentProbe = {
		version: 1,
		kind: 'managed-equipment-probe',
		characterId: 'synthetic-character',
		animationGroupId: 'synthetic-group',
		direction: 'east',
		cell: 144,
		cols: 3,
		indices,
		frames,
		request: {
			description: 'One synthetic sword diagnostic.',
			seed,
			no_background: true,
			inpainting_image: await image(grid),
			mask_image: await image(mask)
		}
	};
	controls.enqueue.mockImplementation(async () => {
		expect(readResearchBudget().calls).toMatchObject([
			{ stage: 'equipment', units: 25, status: 'reserved' }
		]);
		expect((seed === 734 ? readArmedCompletion() : readManagedEquipment())?.callId).toBeTruthy();
		return { id: 'synthetic-queue-receipt' };
	});
	if (gated)
		await recordResearchGate('body', {
			passed: true,
			notes: 'Synthetic reviewer approved body evidence.',
			evidence: ['synthetic/body-review.json']
		});
	function review() {
		controls.approvedCanonical = stableStringify(packet);
		controls.approvedHash = seed === 734 ? ARMED_COMPLETION_SHA256 : MANAGED_PROBE_SHA256;
	}
	review();
	return { packet, grid, mask, assets, fetchMock, saved, review };
}
async function image(img: Img) {
	return {
		image: {
			type: 'base64' as const,
			base64: bytesToBase64(await encodePngBytes(img)),
			format: 'png' as const
		},
		size: { width: img.w, height: img.h }
	};
}
function noSpend() {
	expect(controls.enqueue).not.toHaveBeenCalled();
	expect(readResearchBudget().calls).toHaveLength(0);
	expect(readManagedEquipment()).toBeNull();
	expect(readArmedCompletion()).toBeNull();
}

test('the fixed probe reserves equipment units and saves its receipt before dispatching the reconstructed allowed request', async () => {
	const { packet, fetchMock } = await fixture();
	const result = await submitManagedEquipment(packet);
	expect(fetchMock).toHaveBeenCalledTimes(4);
	expect(controls.enqueue).toHaveBeenCalledTimes(1);
	expect(controls.enqueue.mock.calls[0][0]).toMatchObject({
		method: 'POST',
		path: '/inpaint-v3',
		body: { seed: 731, no_background: true, description: packet.request.description }
	});
	expect(result.jobId).toBe('synthetic-queue-receipt');
	expect(readResearchBudget().calls[0]).toMatchObject({
		status: 'accepted',
		units: 25,
		jobIds: ['synthetic-queue-receipt']
	});
});

test('a missing or failed body review blocks the probe before any paid reservation', async () => {
	const { packet } = await fixture(false);
	await expect(submitManagedEquipment(packet)).rejects.toThrow('body qualification gate');
	noSpend();
	await recordResearchGate('body', {
		passed: false,
		notes: 'Synthetic feet are unstable.',
		evidence: ['synthetic/rejected-body.json']
	});
	await expect(submitManagedEquipment(packet)).rejects.toThrow('body qualification gate');
	noSpend();
});

test.each(['queued', 'failed', 'done', 'lost'])(
	'a matching existing %s queue receipt prevents a second reservation or request',
	async (state) => {
		const { packet } = await fixture();
		controls.existing = { id: `synthetic-${state}` };
		await expect(submitManagedEquipment(packet)).rejects.toThrow(`receipt synthetic-${state}`);
		noSpend();
	}
);

test('concurrent submits dispatch only once and never resend a saved diagnostic', async () => {
	const { packet } = await fixture();
	const results = await Promise.allSettled([
		submitManagedEquipment(packet),
		submitManagedEquipment(packet)
	]);
	expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
	expect(controls.enqueue).toHaveBeenCalledTimes(1);
	expect(readResearchBudget().calls).toHaveLength(1);
	await expect(submitManagedEquipment(packet)).rejects.toThrow('will not be resent');
	expect(controls.enqueue).toHaveBeenCalledTimes(1);
});

test('an uncertain enqueue outcome retains its full reservation and prevents an automatic resend', async () => {
	const { packet } = await fixture();
	controls.enqueue.mockRejectedValue(new Error('Synthetic interrupted submission.'));
	await expect(submitManagedEquipment(packet)).rejects.toThrow('interrupted submission');
	expect(readResearchBudget().calls[0]).toMatchObject({ status: 'unknown', units: 25 });
	expect(researchBudgetUsage().reservedUnits).toBe(25);
	expect(readManagedEquipment()?.error).toContain('interrupted');
	await expect(submitManagedEquipment(packet)).rejects.toThrow('will not be resent');
	expect(controls.enqueue).toHaveBeenCalledTimes(1);
});

test('a changed managed PNG hash is rejected before a reservation', async () => {
	const { packet, assets } = await fixture();
	assets.set(
		'https://backblaze.pixellab.ai/synthetic/frame-1.png',
		await encodePngBytes(makeImg(112, 112))
	);
	await expect(submitManagedEquipment(packet)).rejects.toThrow(
		'differs from the reviewed frozen input'
	);
	noSpend();
});

test('a grid with changed frozen body pixels is rejected even when the original asset hash is correct', async () => {
	const { packet, grid, review } = await fixture();
	const offset = (46 * 432 + 56) * 4;
	grid.data[offset] ^= 255;
	packet.request.inpainting_image = await image(grid);
	review();
	await expect(submitManagedEquipment(packet)).rejects.toThrow('exact frozen body chroma copy');
	noSpend();
});

test.each(['translucent', 'gray', 'reference', 'empty', 'oversized'] as const)(
	'the %s mask cannot escape the reviewed editable region contract',
	async (mode) => {
		const { packet, mask, review } = await fixture();
		if (mode === 'translucent') mask.data[3] = 0;
		if (mode === 'gray') mask.data.set([1, 1, 1, 255], 0);
		if (mode === 'reference') mask.data.set([255, 255, 255, 255], (145 * 432 + 145) * 4);
		if (mode === 'empty')
			for (let i = 0; i < mask.data.length; i += 4) mask.data.set([0, 0, 0, 255], i);
		if (mode === 'oversized')
			for (let y = 0; y < 288; y++)
				for (let x = 0; x < 432; x++)
					if (Math.floor(y / 144) * 3 + Math.floor(x / 144) < 4)
						mask.data.set([255, 255, 255, 255], (y * 432 + x) * 4);
		packet.request.mask_image = await image(mask);
		review();
		await expect(submitManagedEquipment(packet)).rejects.toThrow(
			mode === 'translucent' || mode === 'gray'
				? 'opaque binary'
				: mode === 'reference'
					? 'reference cells'
					: 'edit region'
		);
		noSpend();
	}
);

test.each(['prompt', 'mask', 'metadata'] as const)(
	'a tampered %s changes the whole-packet hash and is rejected before any asset GET or paid mutation',
	async (mode) => {
		const { packet, mask, fetchMock } = await fixture();
		if (mode === 'prompt')
			packet.request.description += ' Changed outside the reviewed diagnostic.';
		if (mode === 'mask') {
			mask.data.set([255, 255, 255, 255], 0);
			packet.request.mask_image = await image(mask);
		}
		if (mode === 'metadata') packet.unreviewedSessionMetadata = 'synthetic-unapproved-field';
		await expect(submitManagedEquipment(packet)).rejects.toThrow(
			'differs from the one reviewed equipment diagnostic'
		);
		expect(fetchMock).not.toHaveBeenCalled();
		noSpend();
	}
);

test('the PNG dimensions and exact frame selection are checked before fetching or spending', async () => {
	const { packet, fetchMock } = await fixture();
	packet.request.mask_image.image.base64 = bytesToBase64(await encodePngBytes(makeImg(1, 1)));
	expect(() => parseManagedEquipment(packet)).toThrow('PNG dimensions');
	packet.indices = [0, 1, 2, 3];
	await expect(submitManagedEquipment(packet)).rejects.toThrow('reviewed four-frame');
	expect(fetchMock).not.toHaveBeenCalled();
	noSpend();
});

test('the completion profile verifies exactly the four missing native frames and reserves25 before its own one-shot dispatch', async () => {
	const { packet, fetchMock } = await fixture(true, 734);
	const receipt = await submitManagedEquipment(packet);
	expect(packet.indices).toEqual([0, 2, 5, 7]);
	expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
		[0, 2, 5, 7].map((index) => `https://backblaze.pixellab.ai/synthetic/frame-${index}.png`)
	);
	expect(controls.enqueue.mock.calls[0][0]).toMatchObject({
		method: 'POST',
		path: '/inpaint-v3',
		body: {
			seed: 734,
			inpainting_image: { size: { width: 432, height: 288 } },
			mask_image: { size: { width: 432, height: 288 } }
		}
	});
	expect(readArmedCompletion()).toEqual(receipt);
	expect(readManagedEquipment()).toBeNull();
	expect(readResearchBudget().calls[0]).toMatchObject({
		stage: 'equipment',
		units: 25,
		status: 'accepted'
	});
	await expect(submitManagedEquipment(packet)).rejects.toThrow('will not be resent');
	expect(controls.enqueue).toHaveBeenCalledTimes(1);
	expect(readResearchBudget().calls).toHaveLength(1);
});

test('a failed original profile remains byte-identical and cannot reopen while the separately reviewed completion is allowed', async () => {
	const { packet, assets, saved } = await fixture(true, 734),
		oldPacket = structuredClone(packet);
	oldPacket.indices = [1, 3, 4, 6];
	oldPacket.request.seed = 731;
	oldPacket.frames = oldPacket.frames.map((frame, i) => ({
		...frame,
		index: oldPacket.indices[i]
	}));
	for (const [i, index] of oldPacket.indices.entries())
		assets.set(
			`https://backblaze.pixellab.ai/synthetic/frame-${index}.png`,
			assets.get(`https://backblaze.pixellab.ai/synthetic/frame-${packet.indices[i]}.png`)!
		);
	const originalKey = 'pixeldoll.motionPilot.equipment.2026-11-01',
		old = {
			version: 1,
			packet: oldPacket,
			callId: 'retained-original-call',
			jobId: 'retained-original-job',
			error: 'Prior grip qualification failed.'
		},
		oldBytes = JSON.stringify(old);
	saved.set(originalKey, oldBytes);
	await reserveResearchCall({
		id: old.callId,
		label: 'Prior failed diagnostic',
		stage: 'equipment',
		units: 25
	});
	await recordResearchOutcome(old.callId, {
		status: 'completed',
		billedUnits: 25,
		jobIds: [old.jobId]
	});
	await recordResearchGate('equipment', {
		passed: false,
		notes: 'Original grip qualification failed.',
		evidence: ['synthetic/original-failure.json']
	});
	const failed = structuredClone(readResearchBudget().gates.equipment);
	controls.enqueue.mockResolvedValue({ id: 'completion-receipt' });
	await submitManagedEquipment(packet);
	expect(saved.get(originalKey)).toBe(oldBytes);
	expect(readManagedEquipment()).toEqual(old);
	expect(readArmedCompletion()?.jobId).toBe('completion-receipt');
	expect(readResearchBudget().gates.equipment).toEqual(failed);
	expect(researchBudgetUsage().stageUnits.equipment).toBe(50);
	controls.approvedCanonical = stableStringify(oldPacket);
	controls.approvedHash = MANAGED_PROBE_SHA256;
	await expect(submitManagedEquipment(oldPacket)).rejects.toThrow('will not be resent');
	expect(saved.get(originalKey)).toBe(oldBytes);
	expect(controls.enqueue).toHaveBeenCalledTimes(1);
});

test.each(['seed', 'indices', 'frame-indices', 'wrong-pin'] as const)(
	'completion cross-profile %s mismatch rejects before source GET or paid reservation',
	async (mode) => {
		const { packet, fetchMock } = await fixture(true, 734);
		if (mode === 'seed') packet.request.seed = 731;
		if (mode === 'indices') packet.indices = [1, 3, 4, 6];
		if (mode === 'frame-indices') packet.frames[0].index = 1;
		if (mode === 'wrong-pin') controls.approvedHash = MANAGED_PROBE_SHA256;
		await expect(submitManagedEquipment(packet)).rejects.toThrow(
			mode === 'wrong-pin' ? 'differs from the one reviewed' : 'reviewed four-frame'
		);
		expect(fetchMock).not.toHaveBeenCalled();
		noSpend();
	}
);

test('the original profile cannot use the separately approved completion packet pin', async () => {
	const { packet, fetchMock } = await fixture();
	controls.approvedHash = ARMED_COMPLETION_SHA256;
	await expect(submitManagedEquipment(packet)).rejects.toThrow('differs from the one reviewed');
	expect(fetchMock).not.toHaveBeenCalled();
	noSpend();
});

test.each(['origin', 'source-hash', 'grid-pixels'] as const)(
	'the completion rejects changed %s before reservation',
	async (mode) => {
		const { packet, assets, grid, fetchMock, review } = await fixture(true, 734);
		if (mode === 'origin')
			(
				controls.pilot as { character: { animations: { directions: { frames: string[] }[] }[] } }
			).character.animations[0].directions[0].frames[0] = 'https://unapproved.invalid/frame.png';
		if (mode === 'source-hash')
			assets.set(
				'https://backblaze.pixellab.ai/synthetic/frame-0.png',
				await encodePngBytes(makeImg(112, 112))
			);
		if (mode === 'grid-pixels') {
			grid.data[(46 * 432 + 56) * 4] ^= 255;
			packet.request.inpainting_image = await image(grid);
			review();
		}
		await expect(submitManagedEquipment(packet)).rejects.toThrow(
			mode === 'origin'
				? 'Unexpected managed asset origin'
				: mode === 'source-hash'
					? 'differs from the reviewed frozen input'
					: 'exact frozen body chroma copy'
		);
		if (mode === 'origin') expect(fetchMock).not.toHaveBeenCalled();
		noSpend();
	}
);

test('the completion still requires a reviewed body gate before spending', async () => {
	const { packet } = await fixture(false, 734);
	await expect(submitManagedEquipment(packet)).rejects.toThrow('body qualification gate');
	noSpend();
});
