// Contracts for one managed custom Skeleton V3 motion shared by native directional views.
// These helpers never submit work, transform pixels or certify artistic quality.
import {
	routes,
	type CharacterAnimation,
	type Req,
	type SubmitResponse
} from '../pixellab/routes.ts';
import { stableStringify } from '../image/hash.ts';
import type { Img } from '../image/png.ts';
import { DIRECTIONS, type DirectionName, type Rig, type Sha256 } from './rig.ts';
import { hasAll } from './poses.ts';

export const STARTER_PRESETS = Object.freeze({
	idle: Object.freeze({
		frames: 4,
		loop: true,
		action:
			'Standing breathing idle, relaxed upright posture, subtle chest and shoulder breathing, both feet planted in place, empty hands, no weapon, no props, no effects, no turning.'
	}),
	walk: Object.freeze({
		frames: 8,
		loop: true,
		action:
			'Walking in place with a natural alternating heel-to-toe gait, coordinated hips and opposite arm swing, consistent facing, empty hands, no weapon, no props, no effects, no turning.'
	}),
	slash: Object.freeze({
		frames: 8,
		loop: false,
		action:
			'One right-handed overhead striking motion: stable stance, raise the closed right fist, brief anticipation, strike forward and down, controlled full-body follow-through and return to the ready stance. Keep the right fist closed as a grip reference; the left hand counterbalances. Empty hands, no weapon, no props, no effects, no turning.'
	})
});
export type StarterPresetId = keyof typeof STARTER_PRESETS;
export interface StarterSource {
	readonly cell: Readonly<Rig['cell']>;
	readonly pivot: Readonly<Rig['pivot']>;
	readonly view: NonNullable<Rig['view']>;
	readonly template: 'mannequin';
	readonly rest: readonly Readonly<{ direction: DirectionName; image: Sha256 }>[];
}
export interface StarterPlan {
	readonly version: 1;
	readonly characterId: string;
	readonly preset: StarterPresetId;
	readonly frames: number;
	readonly action: string;
	readonly loop: boolean;
	readonly directions: readonly DirectionName[];
	readonly seed?: number;
	readonly source: StarterSource;
	/** Canonical local binding, not a provider signature or evidence of independently drawn art. */
	readonly binding: string;
}
export interface StarterReceipt {
	readonly binding: string;
	readonly animationGroupId: string;
	readonly jobs: readonly Readonly<{ direction: DirectionName; jobId: string }>[];
}
export interface StarterNativeFrame {
	direction: DirectionName;
	index: number;
	image: Img;
}

const textId = (value: unknown): value is string =>
	typeof value === 'string' && value.length > 0 && value.trim() === value;
const sha = (value: unknown): value is Sha256 =>
	typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const presetOf = (id: unknown) => {
	if (typeof id !== 'string' || !Object.hasOwn(STARTER_PRESETS, id))
		throw new Error('Choose idle, walk or the right-handed overhead attack.');
	return STARTER_PRESETS[id as StarterPresetId];
};
function checkedDirections(
	value: readonly DirectionName[],
	allowed: readonly DirectionName[] = DIRECTIONS
): DirectionName[] {
	if (
		!Array.isArray(value) ||
		!value.length ||
		new Set(value).size !== value.length ||
		value.some((d) => !DIRECTIONS.includes(d) || !allowed.includes(d))
	)
		throw new Error(
			'Choose a nonempty set of distinct native directions belonging to this starter plan.'
		);
	return DIRECTIONS.filter((d) => value.includes(d));
}
function planBinding(plan: Omit<StarterPlan, 'binding'>): string {
	return stableStringify(plan);
}
function checkedPlan(plan: StarterPlan): void {
	const preset = presetOf(plan?.preset);
	const { binding, ...unsigned } = plan;
	const source = plan.source;
	if (
		plan.version !== 1 ||
		!textId(plan.characterId) ||
		plan.frames !== preset.frames ||
		plan.action !== preset.action ||
		plan.loop !== preset.loop ||
		binding !== planBinding(unsigned)
	)
		throw new Error(
			'The starter motion or source binding changed. Prepare a new explicitly reviewed plan.'
		);
	const dirs = checkedDirections(plan.directions);
	if (
		dirs.join() !== plan.directions.join() ||
		!source ||
		source.template !== 'mannequin' ||
		!['low top-down', 'high top-down', 'side'].includes(source.view) ||
		![source.cell?.w, source.cell?.h].every((v) => Number.isSafeInteger(v) && v > 0 && v <= 256) ||
		!Number.isFinite(source.pivot?.x) ||
		!Number.isFinite(source.pivot?.y) ||
		source.pivot.x < 0 ||
		source.pivot.y < 0 ||
		source.pivot.x > source.cell.w ||
		source.pivot.y > source.cell.h ||
		!Array.isArray(source.rest) ||
		source.rest.length !== dirs.length ||
		source.rest.some((r, i) => r.direction !== dirs[i] || !sha(r.image)) ||
		(plan.seed !== undefined && (!Number.isSafeInteger(plan.seed) || plan.seed < 0))
	)
		throw new Error('The starter source canvas, pivot, view or native references are invalid.');
}

/** Captures ordered exact artwork identities. The caller must also verify the server rotations against these images. */
export function createStarterPlan(
	characterId: string,
	rig: Rig,
	preset: StarterPresetId,
	directions: readonly DirectionName[] = DIRECTIONS,
	seed?: number
): StarterPlan {
	const definition = presetOf(preset),
		dirs = checkedDirections(directions);
	if (rig?.template !== 'mannequin')
		throw new Error(
			'Shared starter motions require an explicitly identified humanoid mannequin source.'
		);
	if (
		!Array.isArray(rig.directions) ||
		new Set(rig.directions.map((d) => d.id)).size !== rig.directions.length
	)
		throw new Error('The source rig has invalid or duplicate directions.');
	for (const dir of dirs) {
		const source = rig.directions.find((d) => d.id === dir),
			rest = rig.rest?.[dir];
		if (!source || source.mirrorOf)
			throw new Error(
				`${dir}: an independently authored native standing view is required; mirrored views cannot qualify this pack.`
			);
		if (!rest || !sha(rest.image) || !hasAll(rest.keypoints))
			throw new Error(
				`${dir}: exact standing artwork and complete valid reference joints are required.`
			);
	}
	const source: StarterSource = Object.freeze({
		cell: Object.freeze({ ...rig.cell }),
		pivot: Object.freeze({ ...rig.pivot }),
		view: rig.view!,
		template: 'mannequin',
		rest: Object.freeze(
			dirs.map((direction) => Object.freeze({ direction, image: rig.rest![direction]!.image }))
		)
	});
	const unsigned = {
		version: 1 as const,
		characterId,
		preset,
		frames: definition.frames,
		action: definition.action,
		loop: definition.loop,
		directions: Object.freeze(dirs),
		...(seed !== undefined ? { seed } : {}),
		source
	};
	const plan = Object.freeze({ ...unsigned, binding: planBinding(unsigned) });
	checkedPlan(plan);
	return plan;
}

function receiptHistory(
	plan: StarterPlan,
	receipts: readonly StarterReceipt[]
): { group?: string; directions: Set<DirectionName>; jobs: Set<string> } {
	const directions = new Set<DirectionName>(),
		jobs = new Set<string>();
	let group: string | undefined;
	for (const receipt of receipts) {
		if (
			!receipt ||
			receipt.binding !== plan.binding ||
			!textId(receipt.animationGroupId) ||
			!Array.isArray(receipt.jobs) ||
			!receipt.jobs.length ||
			(group && group !== receipt.animationGroupId)
		)
			throw new Error(
				'Existing receipts do not belong to this exact starter motion and source group.'
			);
		group = receipt.animationGroupId;
		for (const job of receipt.jobs) {
			if (
				!job ||
				!plan.directions.includes(job.direction) ||
				directions.has(job.direction) ||
				!textId(job.jobId) ||
				jobs.has(job.jobId)
			)
				throw new Error(
					'Existing starter receipts contain repeated directions or invalid job identities.'
				);
			directions.add(job.direction);
			jobs.add(job.jobId);
		}
	}
	return { group, directions, jobs };
}

/** One group for this action. A continuation is explicit and can request only unsubmitted directions of that group. */
export function starterRequest(
	plan: StarterPlan,
	directions: readonly DirectionName[] = plan.directions,
	receipts: readonly StarterReceipt[] = []
): Req {
	checkedPlan(plan);
	const dirs = checkedDirections(directions, plan.directions),
		history = receiptHistory(plan, receipts);
	if (dirs.some((d) => history.directions.has(d)))
		throw new Error(
			'A starter direction already has a paid receipt. Inspect its existing job; do not submit it again.'
		);
	const body: CharacterAnimation = {
		character_id: plan.characterId,
		mode: 'skeleton-v3',
		action_description: plan.action,
		animation_name: plan.preset,
		frame_count: plan.frames,
		directions: dirs,
		...(plan.seed !== undefined ? { seed: plan.seed } : {}),
		...(history.group ? { animation_group_id: history.group } : {})
	};
	return routes.animateCharacter(body);
}

/** Reject partial/ambiguous receipts. The paid queue must retain the original response even when this check fails. */
export function validateStarterReceipt(
	plan: StarterPlan,
	directions: readonly DirectionName[],
	response: unknown,
	receipts: readonly StarterReceipt[] = []
): StarterReceipt {
	starterRequest(plan, directions, receipts);
	const requested = checkedDirections(directions, plan.directions),
		history = receiptHistory(plan, receipts);
	const r = response as SubmitResponse & { status?: unknown };
	if (
		!r ||
		!textId(r.animation_group_id) ||
		(history.group && r.animation_group_id !== history.group) ||
		!Array.isArray(r.directions) ||
		r.directions.length !== requested.length ||
		new Set(r.directions).size !== requested.length ||
		r.directions.some((d) => !requested.includes(d)) ||
		!Array.isArray(r.background_job_ids) ||
		r.background_job_ids.length !== requested.length ||
		new Set(r.background_job_ids).size !== requested.length ||
		r.background_job_ids.some((id) => !textId(id) || history.jobs.has(id)) ||
		(r.character_id !== undefined && r.character_id !== plan.characterId) ||
		r.status === 'failed'
	)
		throw new Error(
			'PixelLab returned an incomplete or mismatched starter receipt. Keep the response and existing jobs; no automatic resubmission is safe.'
		);
	return Object.freeze({
		binding: plan.binding,
		animationGroupId: r.animation_group_id,
		jobs: Object.freeze(
			r.directions.map((direction, i) =>
				Object.freeze({ direction, jobId: r.background_job_ids![i] })
			)
		)
	});
}

/** Retains native per-view canvases and discrete samples. `cell` is only their maximum extent, not provider alignment. */
export function matchStarterFrames(
	plan: StarterPlan,
	entries: readonly StarterNativeFrame[],
	directions: readonly DirectionName[] = plan.directions
): {
	cell: { w: number; h: number };
	cells: Partial<Record<DirectionName, { w: number; h: number }>>;
	directions: DirectionName[];
	frames: Partial<Record<DirectionName, Img[]>>;
} {
	checkedPlan(plan);
	const dirs = checkedDirections(directions, plan.directions);
	if (!Array.isArray(entries) || entries.length !== dirs.length * plan.frames)
		throw new Error('Starter results are missing frames or contain an unexpected frame count.');
	const nativeEntries: readonly StarterNativeFrame[] = entries;
	const frames: Partial<Record<DirectionName, Img[]>> = {};
	const cells: Partial<Record<DirectionName, { w: number; h: number }>> = {};
	for (const entry of nativeEntries) {
		const im = entry?.image;
		if (
			!entry ||
			!dirs.includes(entry.direction) ||
			!Number.isSafeInteger(entry.index) ||
			entry.index < 0 ||
			entry.index >= plan.frames ||
			!im ||
			![im.w, im.h].every((v) => Number.isSafeInteger(v) && v > 0 && v <= 512) ||
			!(im.data instanceof Uint8ClampedArray) ||
			im.data.length !== im.w * im.h * 4 ||
			!im.data.some((v, i) => i % 4 === 3 && v > 0)
		)
			throw new Error(
				'Starter results need valid indexed native images for every requested direction.'
			);
		const previous = cells[entry.direction];
		if (previous && (previous.w !== im.w || previous.h !== im.h))
			throw new Error(
				`Starter frames change native canvas within ${entry.direction}. Keep the artwork for explicit layout review; never recenter or resize individual frames automatically.`
			);
		cells[entry.direction] ??= { w: im.w, h: im.h };
		const row = (frames[entry.direction] ??= []);
		if (row[entry.index]) throw new Error('Starter results repeat a direction/frame index.');
		row[entry.index] = im;
	}
	for (const dir of dirs)
		for (let i = 0; i < plan.frames; i++)
			if (!frames[dir]?.[i])
				throw new Error('Starter results are missing a native direction/frame.');
	const extents = Object.values(cells);
	return {
		cell: { w: Math.max(...extents.map((c) => c.w)), h: Math.max(...extents.map((c) => c.h)) },
		cells,
		directions: dirs,
		frames
	};
}
