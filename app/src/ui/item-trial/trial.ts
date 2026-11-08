import { get } from 'svelte/store';
import { sha256, stableStringify } from '../../lib/image/hash.ts';
import { base64ToBytes, bytesToBase64, type Img } from '../../lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../../lib/image/pngraw.ts';
import { hardMaskBits } from '../../lib/image/hard-mask.ts';
import { KEYS, KEY_NAME, type Key } from '../../lib/image/chroma.ts';
import { editGens, inputCell, itemPrompt, itemRoute } from '../../lib/items/items.ts';
import { editFrameCap, png, routes, type Req } from '../../lib/pixellab/routes.ts';
import { ITEM_TRIAL_TAG, Queue, requestIdentity, type JobRec } from '../../lib/pixellab/queue.ts';
import { poseCallGens } from '../../lib/rig/clips.ts';
import { DIRECTIONS, type DirectionName, type Keypoint, type Rig } from '../../lib/rig/rig.ts';
import { hasAll } from '../../lib/rig/poses.ts';
import * as db from '../../lib/store/db.ts';

export const trialQueue = new Queue({
	recordTag: ITEM_TRIAL_TAG,
	channel: ITEM_TRIAL_TAG,
	lockName: ITEM_TRIAL_TAG
});
if (import.meta.hot) import.meta.hot.dispose(() => trialQueue.disconnect());

export type TrialArm = 'edit' | 'transfer' | 'pose' | 'grid';
export interface TrialPacket {
	version: 1;
	id: string;
	label: string;
	caseId: string;
	conditioning?: string;
	direction: DirectionName;
	anim: string;
	seed: number;
	prompt: string;
	slot: string;
	key: Key;
	cell: { w: number; h: number };
	rig: Rig;
	reference: { base: string; raw: string; layer: string; cut?: number[]; conditioned?: string };
	targets: {
		key: string;
		base: string;
		expectedLayer: string;
		expectedCut?: number[];
		keyed?: string;
		poses?: Keypoint[];
	}[];
	grid?: { image: string; mask: string; cols: number; description?: string };
	targetPalette?: { colors: string[] };
}
export interface PreparedTrial {
	packet: TrialPacket;
	packetHash: string;
	arm: TrialArm;
	request: Req;
	requestHash: string;
	inputs: string[];
	expectedResults: number;
	estimatedGenerations: number;
	sourcePng: string;
	targetPngs: string[];
}
export interface TrialRecord {
	version: 1;
	packet: Pick<TrialPacket, 'id' | 'label' | 'caseId' | 'conditioning' | 'seed'>;
	packetHash: string;
	arm: TrialArm;
	requestHash: string;
	inputHashes: string[];
	estimatedGenerations: number;
	expectedResults: number;
	claimedAt: string;
	jobId?: string;
	error?: string;
}
export interface TrialPlan {
	version: 1;
	kind: 'pixeldoll-item-trial-plan';
	id: string;
	label: string;
	trials: { packet: TrialPacket; arm: TrialArm }[];
}
export interface PreparedTrialPlan {
	plan: TrialPlan;
	planHash: string;
	trials: PreparedTrial[];
}
const JOURNAL = 'pixeldoll.itemTrials.2026-11-06';
const PREPARED_PLAN = JOURNAL + '.preparedPlan';
const LOCK = JOURNAL + '.claim';
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const arms: TrialArm[] = ['edit', 'transfer', 'pose', 'grid'];

function text(value: unknown, name: string, max = 2000): string {
	if (typeof value !== 'string' || !value.trim() || value.length > max)
		throw new Error(`${name} is missing or too long.`);
	return value;
}
function cuts(value: unknown, pixels: number): number[] | undefined {
	if (value === undefined) return undefined;
	if (
		!Array.isArray(value) ||
		value.some((p) => !Number.isInteger(p) || p < 0 || p >= pixels) ||
		new Set(value).size !== value.length
	)
		throw new Error('Body cuts must be distinct native pixel indices.');
	return [...value];
}
async function image(
	value: unknown,
	name: string,
	size: { w: number; h: number }
): Promise<string> {
	const encoded = text(value, name, 2_000_000);
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
		throw new Error(`${name} must contain plain PNG base64.`);
	const decoded = await decodePngBytes(base64ToBytes(encoded));
	if (decoded.w !== size.w || decoded.h !== size.h)
		throw new Error(`${name} does not match its native canvas.`);
	return encoded;
}
/** Normalize imported fields before hashing, keeping external packet extras out of receipts. */
export async function parseTrialPacket(value: unknown): Promise<TrialPacket> {
	if (!value || typeof value !== 'object') throw new Error('Import an item trial packet.');
	const p = value as TrialPacket;
	if (
		p.version !== 1 ||
		!idPattern.test(p.id) ||
		!idPattern.test(p.caseId) ||
		!idPattern.test(p.anim)
	)
		throw new Error('Unsupported trial version or identifiers.');
	if (!Number.isSafeInteger(p.seed) || p.seed < 1 || p.seed > 2_147_483_647)
		throw new Error('Use a positive 32-bit seed.');
	if (!DIRECTIONS.includes(p.direction) || !KEYS.includes(p.key))
		throw new Error('The trial direction or color key is unsupported.');
	const size = p.cell;
	if (
		!size ||
		!Number.isInteger(size.w) ||
		!Number.isInteger(size.h) ||
		size.w !== size.h ||
		size.w < 32 ||
		size.w > 256
	)
		throw new Error('Item trials require a square native 32–256 px cell.');
	if (
		!p.rig ||
		p.rig.cell?.w !== size.w ||
		p.rig.cell?.h !== size.h ||
		!p.reference ||
		!Array.isArray(p.targets) ||
		p.targets.length < 2 ||
		p.targets.length > 15
	)
		throw new Error('The frozen rig, reference, or target frames are incomplete.');
	let targetPalette: TrialPacket['targetPalette'];
	if (p.targetPalette !== undefined) {
		const palette = p.targetPalette;
		if (
			!palette ||
			typeof palette !== 'object' ||
			Object.keys(palette).some((key) => key !== 'colors') ||
			!Array.isArray(palette.colors) ||
			palette.colors.length < 2 ||
			palette.colors.length > 256 ||
			palette.colors.some((color) => typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))
		)
			throw new Error('Target palettes need only 2–256 distinct six-digit hex colors.');
		const colors = palette.colors.map((color) => color.toLowerCase());
		if (new Set(colors).size !== colors.length)
			throw new Error('Target palettes need only 2–256 distinct six-digit hex colors.');
		targetPalette = { colors };
	}
	const pixels = size.w * size.h;
	const reference = {
		base: await image(p.reference.base, 'Standing body', size),
		raw: await image(p.reference.raw, 'Approved dressed reference', size),
		layer: await image(p.reference.layer, 'Approved standing equipment', size),
		cut: cuts(p.reference.cut, pixels),
		...(p.reference.conditioned
			? { conditioned: await image(p.reference.conditioned, 'Conditioned reference', size) }
			: {})
	};
	const targetKeys = new Set<string>();
	const targets: TrialPacket['targets'] = [];
	for (const target of p.targets) {
		const key = text(target?.key, 'Target cell key', 180);
		const parts = key.split('/');
		if (
			parts.length !== 3 ||
			parts[0] !== p.anim ||
			parts[1] !== p.direction ||
			!/^(0|[1-9][0-9]*)$/.test(parts[2]) ||
			targetKeys.has(key)
		)
			throw new Error('Target keys must be distinct cells in the recorded move and direction.');
		targetKeys.add(key);
		if (target.poses !== undefined && !hasAll(target.poses))
			throw new Error('Target joints must contain all 18 finite native-frame labels.');
		targets.push({
			key,
			base: await image(target.base, `${key} body`, size),
			expectedLayer: await image(target.expectedLayer, `${key} retained equipment`, size),
			expectedCut: cuts(target.expectedCut, pixels),
			...(target.keyed
				? { keyed: await image(target.keyed, `${key} conditioned body`, size) }
				: {}),
			...(target.poses ? { poses: structuredClone(target.poses) } : {})
		});
	}
	let grid: TrialPacket['grid'];
	if (p.grid) {
		if (!Number.isInteger(p.grid.cols) || p.grid.cols < 1 || p.grid.cols > 16)
			throw new Error('The inpaint grid needs a valid column count.');
		const gridSize = {
			w: p.grid.cols * size.w,
			h: Math.ceil((targets.length + 1) / p.grid.cols) * size.h
		};
		if (gridSize.w > 512 || gridSize.h > 512)
			throw new Error('The inpaint grid exceeds the provider canvas.');
		grid = {
			image: await image(p.grid.image, 'Grid input', gridSize),
			mask: await image(p.grid.mask, 'Grid mask', gridSize),
			cols: p.grid.cols,
			...(p.grid.description
				? { description: text(p.grid.description, 'Grid description', 8000) }
				: {})
		};
		hardMaskBits(await decodePngBytes(base64ToBytes(grid.mask)));
	}
	return {
		version: 1,
		id: p.id,
		label: text(p.label, 'Trial label', 160),
		caseId: p.caseId,
		...(p.conditioning ? { conditioning: text(p.conditioning, 'Conditioning label', 160) } : {}),
		direction: p.direction,
		anim: p.anim,
		seed: p.seed,
		prompt: text(p.prompt, 'Equipment description'),
		slot: text(p.slot, 'Equipment slot', 80),
		key: p.key,
		cell: { ...size },
		rig: structuredClone(p.rig),
		reference,
		targets,
		...(grid ? { grid } : {}),
		...(targetPalette ? { targetPalette } : {})
	};
}

const b64 = async (im: Img) => bytesToBase64(await encodePngBytes(im));
export async function prepareTrial(value: unknown, arm: TrialArm): Promise<PreparedTrial> {
	if (!arms.includes(arm)) throw new Error('Choose a supported trial arm.');
	const packet = await parseTrialPacket(value),
		{ cell, seed, reference, targets } = packet;
	if (packet.targetPalette && arm !== 'edit' && arm !== 'transfer')
		throw new Error('Target palettes are supported only by the edit and transfer trial arms.');
	const source = reference.conditioned ?? reference.raw;
	const frames = await Promise.all(
		targets.map(
			async (target) =>
				target.keyed ?? b64(inputCell(await decodePngBytes(base64ToBytes(target.base)), packet.key))
		)
	);
	let request: Req,
		estimatedGenerations: number,
		expectedResults = targets.length;
	if (arm === 'edit' || arm === 'transfer') {
		if (targets.length + 1 > editFrameCap(cell.w))
			throw new Error('This reference and target count exceeds the editing route frame limit.');
		const size = { width: cell.w, height: cell.h };
		estimatedGenerations = editGens(cell);
		if (arm === 'edit') {
			request = itemRoute.edit(
				[source, ...frames],
				itemPrompt(
					packet.prompt,
					packet.key,
					targets.map((t) => t.key),
					`rest/${packet.direction}/0`
				),
				seed,
				cell
			);
			expectedResults++;
		} else {
			request = {
				method: 'POST',
				path: '/transfer-outfit-v2',
				body: {
					reference_image: { image: png(source), size },
					frames: frames.map((frame) => ({ image: png(frame), size })),
					image_size: size,
					seed,
					no_background: true,
					additional_instructions: `Transfer ONLY the identical ${packet.prompt} from the reference onto each ${KEY_NAME[packet.key]} mannequin. All targets face ${packet.direction}, in their supplied order. Preserve the target poses, body silhouette, ${KEY_NAME[packet.key]} skin ramp and transparent background exactly. Copy the reference equipment colors and details. Do not transfer the reference body shape or pose. Empty hands and no additional equipment.`
				}
			};
		}
	} else if (arm === 'pose') {
		const rest = packet.rig.rest?.[packet.direction]?.keypoints;
		if (targets.length < 3 || !hasAll(rest) || !targets.every((t) => hasAll(t.poses)))
			throw new Error('Skeleton comparison needs complete standing joints and 3–15 target poses.');
		request = itemRoute.pose({
			keyframePngB64: source,
			rest: rest!,
			poses: targets.map((t) => t.poses!),
			item: packet.prompt,
			slot: packet.slot,
			key: packet.key,
			anim: packet.anim,
			dir: packet.direction,
			seed,
			cell,
			view: packet.rig.view
		});
		estimatedGenerations = poseCallGens(targets.length);
	} else {
		if (!packet.grid) throw new Error('This packet has no frozen inpaint image and mask.');
		const gridSize = {
			width: packet.grid.cols * cell.w,
			height: Math.ceil((targets.length + 1) / packet.grid.cols) * cell.h
		};
		request = routes.inpaintV3({
			description:
				packet.grid.description ??
				itemPrompt(
					packet.prompt,
					packet.key,
					targets.map((t) => t.key),
					`rest/${packet.direction}/0`
				),
			inpainting_image: { image: png(packet.grid.image), size: gridSize },
			mask_image: { image: png(packet.grid.mask), size: gridSize },
			seed,
			no_background: true
		});
		estimatedGenerations = 25;
		expectedResults = 1;
	}
	if (packet.targetPalette)
		request = {
			...request,
			body: { ...(request.body as object), target_palette: packet.targetPalette }
		};
	const identity = await requestIdentity(request);
	return {
		packet,
		packetHash: await sha256(stableStringify(packet)),
		arm,
		request,
		requestHash: identity.requestHash,
		inputs: identity.inputs,
		expectedResults,
		estimatedGenerations,
		sourcePng: source,
		targetPngs: frames
	};
}

export function readTrials(): TrialRecord[] {
	const stored = localStorage.getItem(JOURNAL);
	if (!stored) return [];
	const records = JSON.parse(stored) as TrialRecord[];
	if (
		!Array.isArray(records) ||
		records.some((r) => r.version !== 1 || typeof r.requestHash !== 'string')
	)
		throw new Error('The item trial journal cannot be read. Export it before making new claims.');
	return records;
}
const saveTrials = (records: TrialRecord[]) =>
	localStorage.setItem(JOURNAL, JSON.stringify(records));

export async function submitTrial(prepared: PreparedTrial): Promise<TrialRecord> {
	if (
		!import.meta.env.DEV ||
		import.meta.env.MODE !== 'agent' ||
		window.top !== window ||
		!trialQueue.key
	)
		throw new Error('Connect the localhost Agent mode session before submitting.');
	if (!navigator.locks) throw new Error('One-shot item trials require browser Web Locks.');
	const checked = await prepareTrial(prepared.packet, prepared.arm);
	if (checked.packetHash !== prepared.packetHash || checked.requestHash !== prepared.requestHash)
		throw new Error('The trial changed after preparation. Prepare it again before submitting.');
	const restricted = trialQueue.planBlocks(checked.request, 1);
	if (restricted) throw new Error(restricted);
	return navigator.locks.request(LOCK, async () => {
		const records = readTrials();
		if (records.some((r) => r.requestHash === checked.requestHash))
			throw new Error('This request already has a claim. Inspect or export its receipt.');
		const existing = (await db.all<JobRec>('jobs')).find(
			(job) => job.requestHash === checked.requestHash
		);
		if (existing)
			throw new Error(
				`This request already has queue receipt ${existing.id}. Inspect its saved result.`
			);
		// The project-store pin keeps GC from sweeping the immutable packet while the compact journal lives in localStorage.
		const packetId = `item-trial-packet:${checked.packetHash}`;
		const bytes = new TextEncoder().encode(stableStringify(checked.packet));
		await db.updateCharacter(
			packetId,
			new Map([[checked.packetHash, new Blob([bytes], { type: 'application/json' })]]),
			() => ({ id: packetId, kind: 'item-trial-packet', packetHash: checked.packetHash })
		);
		const { id, label, caseId, conditioning, seed } = checked.packet;
		const record: TrialRecord = {
			version: 1,
			packet: { id, label, caseId, conditioning, seed },
			packetHash: checked.packetHash,
			arm: checked.arm,
			requestHash: checked.requestHash,
			inputHashes: checked.inputs,
			estimatedGenerations: checked.estimatedGenerations,
			expectedResults: checked.expectedResults,
			claimedAt: new Date().toISOString()
		};
		records.push(record);
		saveTrials(records);
		try {
			const job = await trialQueue.enqueue(checked.request, {
				label: `Item trial ${checked.packet.label} / ${checked.arm} / ${checked.packet.seed}`,
				tag: ITEM_TRIAL_TAG,
				activityScope: ITEM_TRIAL_TAG,
				playerRequested: true,
				minimumTier: 1
			});
			record.jobId = job.id;
			saveTrials(records);
		} catch (error) {
			record.error = error instanceof Error ? error.message : String(error);
			saveTrials(records);
			throw error;
		}
		return record;
	});
}

export async function exportTrial(record: TrialRecord) {
	const packetBlob = await db.getBlob(record.packetHash);
	if (!packetBlob) throw new Error('The immutable trial packet is missing from storage.');
	const bytes = new Uint8Array(await packetBlob.arrayBuffer());
	if ((await sha256(bytes)) !== record.packetHash)
		throw new Error('The immutable trial packet hash changed.');
	const packet = await parseTrialPacket(JSON.parse(new TextDecoder().decode(bytes)));
	const job = record.jobId
		? await db.get<JobRec>('jobs', record.jobId)
		: (await db.all<JobRec>('jobs')).find((j) => j.requestHash === record.requestHash);
	const images = await Promise.all(
		(job?.jobs.flatMap((part) => part.results) ?? []).map(async (result) => {
			const blob = await db.getBlob(result.sha);
			if (!blob) throw new Error('A retained trial output is missing from storage.');
			return { ...result, png: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
		})
	);
	return {
		version: 1,
		record: { ...record, packet },
		job,
		images,
		queueState: get(trialQueue).jobs.find((j) => j.id === job?.id)?.state ?? null
	};
}

/** Preparation constructs each fixed request but never connects or enqueues. */
export async function prepareTrialPlan(value: unknown): Promise<PreparedTrialPlan> {
	if (!value || typeof value !== 'object') throw new Error('Import a frozen item trial plan.');
	const input = value as TrialPlan;
	if (
		input.version !== 1 ||
		input.kind !== 'pixeldoll-item-trial-plan' ||
		!idPattern.test(input.id) ||
		!Array.isArray(input.trials) ||
		!input.trials.length ||
		input.trials.length > 64
	)
		throw new Error('A trial plan needs a valid ID and 1–64 fixed trials.');
	const label = text(input.label, 'Plan label', 160),
		trials: PreparedTrial[] = [];
	const identities = new Set<string>();
	for (const trial of input.trials) {
		const prepared = await prepareTrial(trial?.packet, trial?.arm);
		if (identities.has(prepared.requestHash))
			throw new Error(
				'The plan contains duplicate paid request identities. Keep each request once.'
			);
		identities.add(prepared.requestHash);
		trials.push(prepared);
	}
	const plan: TrialPlan = {
		version: 1,
		kind: 'pixeldoll-item-trial-plan',
		id: input.id,
		label,
		trials: trials.map((trial) => ({ packet: trial.packet, arm: trial.arm }))
	};
	return { plan, planHash: await sha256(stableStringify(plan)), trials };
}

/** Retain the reviewed plan independently from its claims so reload can restore a free preview. */
export async function persistPreparedTrialPlan(prepared: PreparedTrialPlan): Promise<void> {
	const serialized = stableStringify(prepared.plan);
	if ((await sha256(serialized)) !== prepared.planHash)
		throw new Error('The trial plan changed before it could be retained. Prepare it again.');
	const id = `item-trial-plan:${prepared.planHash}`;
	const blob = new Blob([new TextEncoder().encode(serialized)], { type: 'application/json' });
	await db.updateCharacter(id, new Map([[prepared.planHash, blob]]), () => ({
		id,
		kind: 'item-trial-plan',
		planHash: prepared.planHash
	}));
	localStorage.setItem(PREPARED_PLAN, JSON.stringify({ version: 1, planHash: prepared.planHash }));
}

export async function restorePreparedTrialPlan(): Promise<PreparedTrialPlan | null> {
	const stored = localStorage.getItem(PREPARED_PLAN);
	if (!stored) return null;
	const pointer = JSON.parse(stored) as { version?: unknown; planHash?: unknown };
	if (
		pointer?.version !== 1 ||
		typeof pointer.planHash !== 'string' ||
		!/^[0-9a-f]{64}$/.test(pointer.planHash)
	)
		throw new Error('The retained trial plan pointer is invalid. Import the original plan again.');
	const blob = await db.getBlob(pointer.planHash);
	if (!blob)
		throw new Error(
			'The retained trial plan is missing from storage. Import the original plan again.'
		);
	const bytes = new Uint8Array(await blob.arrayBuffer());
	if ((await sha256(bytes)) !== pointer.planHash)
		throw new Error('The retained trial plan hash changed. Import the original plan again.');
	const prepared = await prepareTrialPlan(JSON.parse(new TextDecoder().decode(bytes)));
	if (prepared.planHash !== pointer.planHash)
		throw new Error(
			'The retained trial plan no longer matches its normalized inputs. Import the original plan again.'
		);
	return prepared;
}

/** Only a separate explicit user action may call this after all requests have been reviewed. */
export async function submitTrialPlan(
	prepared: PreparedTrialPlan
): Promise<{ submitted: number; skipped: number }> {
	const checked = await prepareTrialPlan(prepared.plan);
	if (
		checked.planHash !== prepared.planHash ||
		checked.trials.length !== prepared.trials.length ||
		checked.trials.some((trial, i) => trial.requestHash !== prepared.trials[i].requestHash)
	)
		throw new Error(
			'The trial plan changed after preparation. Prepare it again before submitting.'
		);
	const existing = readTrials();
	for (const trial of checked.trials) {
		if (existing.some((record) => record.requestHash === trial.requestHash)) continue;
		const restricted = trialQueue.planBlocks(trial.request, 1);
		if (restricted) throw new Error(restricted);
	}
	let submitted = 0,
		skipped = 0;
	for (const trial of checked.trials) {
		if (readTrials().some((record) => record.requestHash === trial.requestHash)) {
			skipped++;
			continue;
		}
		await submitTrial(trial);
		submitted++;
	}
	return { submitted, skipped };
}

export async function exportTrialPlan(prepared: PreparedTrialPlan) {
	const records = readTrials(),
		trials = [];
	for (const trial of prepared.trials) {
		const record = records.find((record) => record.requestHash === trial.requestHash);
		trials.push(
			record
				? await exportTrial(record)
				: {
						version: 1,
						packetHash: trial.packetHash,
						requestHash: trial.requestHash,
						arm: trial.arm,
						state: 'unclaimed'
					}
		);
	}
	return {
		version: 1,
		kind: 'pixeldoll-item-trial-evidence',
		planId: prepared.plan.id,
		label: prepared.plan.label,
		planHash: prepared.planHash,
		trials
	};
}
