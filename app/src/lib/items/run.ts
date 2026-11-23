import { handOf, requireSlot, specSlot } from './slots.ts';
// Item runner (architecture §3): drafts -> calls through the queue -> extraction + QA from the ledger -> player review or accept.
// UI-free; ui/M3.svelte and the Studio use this. A Draft is mutated in place (pass a Svelte $state proxy to get reactivity)
// and persisted through the `persist` hook. Everything is re-derived from the job ledger, so reloads resume.
import { queue, requestIdentity, type JobRec } from '../pixellab/queue.ts';
import { reportedUsage } from '../pixellab/activity.ts';
import { base64ToBytes, binaryAlpha, bytesToBase64, decodePng, type Img } from '../image/png.ts';
import { normalize } from '../rig/normalize.ts';
import { sha256, stableStringify } from '../image/hash.ts';
import { cellHash, cellKey, matchesStanding, rigArtworkVersion, type Sha256 } from '../rig/rig.ts';
import {
	itemPaletteMatcher,
	ITEM_PALETTE_POLICY,
	standingDyeMatcher,
	validPaletteRepairs
} from '../dress/item-palette.ts';
import { colorCounts, fromHex } from '../dress/palette.ts';
import { coverageGaps, deriveMaterials } from '../dress/dress.ts';
import { decodePngBytes, encodePngBytes } from '../image/pngraw.ts';
import { hardMaskBits } from '../image/hard-mask.ts';
import * as db from '../store/db.ts';
import { loadProject, saveItem, type StoredProject } from '../store/project.ts';
import { itemContent, itemExportIdTaken } from '../store/identity.ts';
import type {
	CellKey,
	CellQa,
	Item,
	Manifest,
	Material,
	Project,
	Provenance,
	Slot
} from '../store/manifest.ts';
import { composeCell, dropCut } from '../compose/compose.ts';
import { retainItemMoves } from '../rig/moves.ts';
import { standingMove } from '../equipment/refit.ts';
import type { DirectionName, Keypoint, Rig } from '../rig/rig.ts';
import { fromApi, hasAll } from '../rig/poses.ts';
import { paddedPoses, poseBatches } from '../rig/clips.ts';
import { acceptQa, clipOf, mergeQa } from './qa-summary.ts';
import {
	chromaLayer,
	keyAllowed,
	keyFor,
	keyMatte,
	clearKeyMatte,
	KEY_NAME,
	KEYS,
	keyScore,
	KT,
	nearKeyShare,
	rampDistance,
	type Key
} from '../image/chroma.ts';
import { garmentBand, referenceBodies } from './garment-coverage.ts';
import {
	designConsistency,
	expectsWaistBand,
	type StandingDesignView
} from './design-consistency.ts';
import {
	EDIT_MIN_FRAMES,
	editFrameCap,
	frameOrder,
	png,
	routes,
	type InpaintV3,
	type Req
} from '../pixellab/routes.ts';
import {
	GATES,
	ITEM_GRID_REGISTRATION_NOTICE,
	heldParts,
	heldSkel,
	markHand,
	planAnchoredMove,
	reusesStanding,
	anchored,
	planGens,
	itemPlanMinimumTier,
	itemPosePlan,
	slotLadder,
	putItem,
	gridEstimate,
	repairGridLayout,
	repairGridPlan,
	bandMask,
	cutGrid,
	g2Fails,
	automaticRepairError,
	localizedAutomaticRepairError,
	grayShare,
	smudgedViews,
	sharedDesignColors,
	gridPrompt,
	packGrid,
	bandOf,
	buildItem,
	frozenGrid,
	hiddenViews,
	callAnim,
	callParts,
	canPose,
	cellKeypoints,
	clipKeypoints,
	cutAllow,
	cutRows,
	dirGate,
	extractCell,
	posedTol,
	f0Last,
	dressItem,
	inputCell,
	itemPrompt,
	itemQa,
	itemRoute,
	padImg,
	padOf,
	planItem,
	poseFitIssues,
	suspiciousPoseCells,
	postProcess,
	restKey,
	unrotate,
	type CallKind,
	type CellOut,
	type ItemSpec,
	type QaResult
} from './items.ts';
import {
	LocalizedError,
	errorMessage,
	errorText,
	loggedError,
	loggedMessage,
	message,
	type LoggedMessage,
	type Message
} from '../message.ts';
import { localizedPlanRestriction } from '../pixellab/plans.ts';

/** kind: 'edit' (packed edit-animation-v2, anchor cell after the first), 'dress' (rest keyframes), 'pose' (one clip x dir). */
interface CallState {
	cells: string[];
	seed: number;
	recId?: string;
	rerolls: number;
	old: string[];
	kind?: CallKind;
	frozen?: true;
	reference?: { image: Sha256; cell: CellKey };
	concept?: true;
}
export interface Draft {
	spec: ItemSpec;
	rigId: string;
	calls: CallState[];
	/** Outcomes, oldest first: English text, or a translated error with its English text. */
	log: (string | LoggedMessage)[];
	acceptedAt?: string;
	activityScope?: string;
}
export interface ItemResult {
	cells: CellOut[];
	qa: QaResult | null;
	g1: Map<number, string>;
	preview: Project | null;
	thumbnail?: Img;
	retryKey?: Key;
}
/** G1 is structural; this legacy map also carries ordinary keyframe-art warnings. */
const structuralReason = (why: string) => /(?:^|;\s*)G1\b/.test(why);
export const hasStructuralFailure = (r: Pick<ItemResult, 'g1'>) =>
	[...r.g1.values()].some(structuralReason);
/** The draft's planned cells of these moves without a verified frame, or undefined when the rig lost one of the moves. */
function missingCells(
	d: Draft,
	rig: Rig,
	r: Pick<ItemResult, 'cells'>,
	anims = d.spec.anims
): string[] | undefined {
	const covered = new Set(r.cells.map((c) => c.key)),
		missing: string[] = [];
	for (const anim of anims) {
		const clip = rig.animations.find((a) => a.id === anim);
		if (!clip) return undefined;
		for (const dir of d.spec.clipDirs?.[anim] ?? d.spec.dirs)
			for (let i = 0; i < clip.cells; i++)
				if (!covered.has(`${anim}/${dir}/${i}`)) missing.push(`${anim}/${dir}/${i}`);
	}
	return missing;
}
/** Standing checks may stop before animation: review must not offer to save incomplete coverage. */
export function incompleteCoverage(d: Draft, rig: Rig, r: Pick<ItemResult, 'cells'>): boolean {
	const missing = missingCells(d, rig, r);
	return !missing || missing.length > 0;
}
/** The standing move the draft is designed from (the first move when it names none). */
const draftStanding = (d: Draft) => d.spec.standing ?? d.spec.anims[0];
/** The planned views missing frames when the draft can be kept from its available frames, else undefined: its design call
 *  and every frame of the standing move it is designed from must be intact, since later frames are made from them. */
export function availableGaps(
	d: Draft,
	rig: Rig,
	r: Pick<ItemResult, 'cells' | 'g1' | 'qa'>
): { anim: string; dir: DirectionName; missing: number; total: number }[] | undefined {
	const missing = missingCells(d, rig, r);
	if (
		!r.qa ||
		!missing ||
		structuralReason(r.g1.get(0) ?? '') ||
		recOf(d.calls[0]?.recId)?.state !== 'done' ||
		missingCells(d, rig, r, [draftStanding(d)])?.length !== 0
	)
		return undefined;
	const gaps = new Map<
		string,
		{ anim: string; dir: DirectionName; missing: number; total: number }
	>();
	for (const key of missing) {
		const [anim, dir] = key.split('/') as [string, DirectionName];
		const gap = gaps.get(`${anim}/${dir}`) ?? {
			anim,
			dir,
			missing: 0,
			total: rig.animations.find((a) => a.id === anim)!.cells
		};
		gap.missing++;
		gaps.set(`${anim}/${dir}`, gap);
	}
	return [...gaps.values()];
}
/** A frozen rig opened with store/project.ts loadProject(). */
export interface RigCtx {
	rec: StoredProject;
	project: Project;
}

function draftContext(d: Draft, ctx: RigCtx): RigCtx {
	const slots = ctx.rec.manifest.slots ?? [];
	const slot = specSlot(d.spec, slots);
	if (slots.some((entry) => entry.id === slot.id)) return ctx;
	const slotSnapshot = JSON.parse(JSON.stringify(slot)) as Slot;
	const manifest = { ...ctx.rec.manifest, slots: [...slots, slotSnapshot] };
	return {
		rec: { ...ctx.rec, manifest },
		project: { ...ctx.project, manifest }
	};
}

const seed = () => 1 + Math.floor(Math.random() * 2_000_000);
const slug = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '') || 'item';

/** Default method for a rig: skeleton posing when every needed cell has keypoints (S4 Q4), else the anchor-cell edit route. */
export function defaultMethod(
	ctx: RigCtx,
	spec: Pick<ItemSpec, 'anims' | 'dirs' | 'clipDirs' | 'standing'>
) {
	if (!canPose(ctx.rec.manifest.rig, spec)) return 'anchor';
	return 'skel';
}

/** New draft with a unique id and its call plan (spec.id is derived from name/prompt when empty; method defaults per rig). */
export function newDraft(
	ctx: RigCtx,
	spec: Omit<ItemSpec, 'id'> & { id?: string },
	taken: string[] = []
): Draft {
	let id = spec.id || slug(spec.name || spec.prompt.split(/\s+/).slice(0, 3).join(' '));
	while (
		taken.includes(id) ||
		ctx.rec.manifest.items.some((i) => i.id === id) ||
		itemExportIdTaken(ctx.rec.manifest.items, id, id)
	)
		id += '_2';
	const s: ItemSpec = {
		...spec,
		slotConfig: structuredClone(requireSlot(ctx.rec.manifest, spec.slot)),
		id,
		name: spec.name || id,
		method: spec.method ?? defaultMethod(ctx, spec)
	};
	if (s.method === 'skel' && (s.key === 'none' || !canPose(ctx.rec.manifest.rig, s)))
		s.method = 'anchor';
	return {
		spec: s,
		rigId: ctx.rec.id,
		calls: planItem(ctx.rec.manifest.rig, s).map((c, index) => ({
			...c,
			...(index === 0 && s.reference ? { concept: true as const } : {}),
			...(c.kind === 'grid' ? { frozen: true as const } : {}),
			seed: seed(),
			rerolls: 0,
			old: []
		})),
		log: []
	};
}

export function draftMinimumTier(draft: Draft, rig: Rig): number {
	const pad = padOf(specSlot(draft.spec), draft.spec.method, rig.cell);
	return itemPlanMinimumTier(draft.calls, { w: rig.cell.w + 2 * pad, h: rig.cell.h + 2 * pad });
}

// ---------- ledger access ----------
let jobs: JobRec[] = [];
queue.subscribe((s) => (jobs = s.jobs));
const recIn = (list: JobRec[], id?: string) => (id ? list.find((j) => j.id === id) : undefined);
const recOf = (id?: string) => recIn(jobs, id);
const terminal = (r?: JobRec) => !!r && !['queued', 'submitting', 'running'].includes(r.state);
const settled = (id: string, signal?: AbortSignal) =>
	new Promise<JobRec>((res, reject) => {
		signal?.throwIfAborted();
		let done = false;
		const abort = () => {
			done = true;
			un();
			reject(signal!.reason);
		};
		const un = queue.subscribe((s) => {
			const r = s.jobs.find((j) => j.id === id);
			if (!done && terminal(r)) {
				done = true;
				signal?.removeEventListener('abort', abort);
				res(r!);
				queueMicrotask(() => un());
			}
		});
		if (!done) signal?.addEventListener('abort', abort, { once: true });
	});
const outputsOf = (r: JobRec) => [...(r.jobs[0]?.results ?? [])].sort(frameOrder);
/** Outputs of call k in cell order (an anchored call's first output is the anchor's: dropped). */
const hasAnchor = (k: number, c: CallState) => !!(c.reference || c.concept || anchored(k, c.kind));
const cellOuts = (k: number, c: CallState, r: JobRec) =>
	outputsOf(r).slice(hasAnchor(k, c) ? 1 : 0);
const expectedCellOutputs = (k: number, c: CallState) =>
	c.kind === 'pose'
		? Math.max(3, c.cells.length)
		: Math.max(EDIT_MIN_FRAMES - Number(hasAnchor(k, c)), c.cells.length);

function identifiedOutputs(k: number, c: CallState, r: JobRec) {
	const outputs = outputsOf(r);
	return r.jobs.length === 1 &&
		outputs.length === expectedCellOutputs(k, c) + Number(hasAnchor(k, c)) &&
		outputs.every((frame, index) => frame.label.split('/').at(-1) === String(index))
		? outputs.slice(Number(hasAnchor(k, c)))
		: undefined;
}
/** Dressed keyframe outputs of dress call k, per rest cell (the call must be done). */
function chunkOuts(
	calls: CallState[],
	k: number,
	rec: (id?: string) => JobRec | undefined
): [string, { sha: string }][] {
	const c = calls[k],
		r = rec(c.recId);
	if (r?.state !== 'done') throw new Error('dress call not done');
	return cellOuts(k, c, r).flatMap((o, i) =>
		c.cells[i] ? [[c.cells[i], o] as [string, { sha: string }]] : []
	);
}
/** B16: the dressed keyframe output per rest cell over every dress chunk (all must be done). */
function dressedOf(
	calls: CallState[],
	rec: (id?: string) => JobRec | undefined = recOf
): Map<string, { sha: string }> {
	return new Map(calls.flatMap((c, k) => (c.kind === 'dress' ? chunkOuts(calls, k, rec) : [])));
}
/** One direction's dressed keyframe: only its own dress chunk must be done (the others may still run). */
const keyframeOf = (calls: CallState[], dir: DirectionName) => {
	const k = calls.findIndex((c) => c.kind === 'dress' && c.cells.includes(restKey(dir)));
	return k < 0 ? undefined : new Map(chunkOuts(calls, k, recOf)).get(restKey(dir));
};
/** Call k's outputs by cell when it finished and its labels prove each frame's cell (a pose call's in request order). */
const identifiedCells = (d: Draft, k: number): [string, { sha: string }][] => {
	const c = d.calls[k],
		r = recOf(c.recId),
		o = r?.state === 'done' ? identifiedOutputs(k, c, r) : undefined;
	return o ? c.cells.map((key, i) => [key, o[i]]) : [];
};
/** Generations spent on a draft, re-rolls included. */
const draftRecords = (d: Draft) => [
	...new Set(d.calls.flatMap((c) => [c.recId, ...c.old]).filter((id): id is string => !!id))
];
export const gensOf = (d: Draft, list = jobs) =>
	draftRecords(d).reduce((s, id) => s + (recIn(list, id)?.gens ?? 0), 0);
export const usdOf = (d: Draft, list = jobs) =>
	draftRecords(d).reduce((s, id) => s + (recIn(list, id)?.usd ?? 0), 0);
/** Calls of a draft whose cost PixelLab did not report: shown as unknown beside the reported spend. */
/** Requests whose cost PixelLab never reported, including lost ones that may have run and charged. */
export const unknownCostsOf = (d: Draft, list = jobs) =>
	draftRecords(d).filter((id) => {
		const record = recIn(list, id);
		return !!record && (!!record.costUnknown || record.state === 'lost');
	}).length;
export const callState = (c: CallState, list = jobs) =>
	recIn(list, c.recId)?.state ?? 'not submitted';

/** A frozen base cell, or a rest view for the pseudo key "rest/<dir>/0". */
export function baseCell(ctx: RigCtx, k: string, restView = false): Img {
	const [a, d, i] = k.split('/') as [string, DirectionName, string],
		m = ctx.rec.manifest;
	const h =
		(restView ? m.rig.rest?.[d]?.image : undefined) ??
		m.items.find((x) => x.slot === 'body')!.layers[0].cells?.[a]?.[d]?.[+i] ??
		(a === 'rest' ? m.rig.rest?.[d]?.image : undefined);
	const im = h && ctx.project.images.get(h);
	if (!im) throw new Error(`base cell ${k} not loaded`);
	return im;
}
/** Keypoints of a base cell (measured) or a rest view (px). */
const skelOf = (ctx: RigCtx, k: string, restView = false) => {
	const [a, d] = k.split('/') as [string, DirectionName],
		rest = ctx.rec.manifest.rig.rest?.[d];
	return restView
		? rest && fromApi(rest.keypoints, ctx.rec.manifest.rig.cell)
		: (ctx.rec.skeletons?.[k] ??
				(a === 'rest' && rest ? fromApi(rest.keypoints, ctx.rec.manifest.rig.cell) : undefined));
};
type Cuts = Partial<Record<DirectionName, Uint8Array>>;
/** Round 3 cut options of a cell: dressed keyframes cut on their own, posed frames only inside their keyframe's cut. */
const cutFor = (
	ctx: RigCtx,
	slot: string,
	k: string,
	posed: boolean,
	keyCut: Cuts,
	restView = false
) => {
	const { rig } = ctx.rec.manifest,
		maxY = cutRows(requireSlot(ctx.rec.manifest, slot), skelOf(ctx, k, restView), rig.cell.h);
	if (maxY == null) return undefined;
	if (!posed) return restView ? { maxY } : undefined; // in-place edit cells never cut on their own: untested for drift
	const allow = cutAllow(
		rig,
		k,
		keyCut[k.split('/')[1] as DirectionName],
		rig.cell.w,
		posedTol(rig.cell.w, rig.cell.h)
	);
	return allow && { maxY, allow };
};
/** Dressed keyframe layers (H4, trims) and the body px they hide, per direction, for later moves and grid repairs. Every dressed
 * view, also when only some directions are posed: hidden views are judged over all of them. */
async function dressedKeys(ctx: RigCtx, item: Item, pad: number) {
	const keys: Partial<Record<DirectionName, Img>> = {},
		cuts: Cuts = {},
		H = ctx.rec.manifest.rig.cell.h + 2 * pad,
		cells: CellOut[] = [];
	for (const d of Object.keys(item.dressed ?? {}) as DirectionName[]) {
		const k = restKey(d),
			c = extractCell({
				key: k,
				call: 0,
				base: padImg(baseCell(ctx, k, true), pad),
				out: await img(item.dressed![d]!.slice(7)),
				route: item.key!,
				band: bandOf(
					requireSlot(ctx.rec.manifest, item.slot),
					pad ? undefined : skelOf(ctx, k, true),
					H
				),
				cut: cutFor(ctx, item.slot, k, false, {}, true)
			});
		keys[d] = c.layer;
		if (c.cut) cuts[d] = c.cut;
		cells.push(c);
	}
	return { keys, cuts, hidden: hiddenViews(cells, keys, requireSlot(ctx.rec.manifest, item.slot)) };
}

function standingViews(d: Draft, ctx: RigCtx, refs: { dir: DirectionName; im: Img }[]) {
	const views: Partial<Record<DirectionName, StandingDesignView>> = {};
	if (
		!gridable(d.spec) ||
		requireSlot(ctx.rec.manifest, d.spec.slot).class !== 'worn' ||
		requireSlot(ctx.rec.manifest, d.spec.slot).bgZ != null ||
		padOf(requireSlot(ctx.rec.manifest, d.spec.slot), d.spec.method, ctx.rec.manifest.rig.cell)
	)
		return views;
	for (const { dir, im } of refs) {
		const pose = skelOf(ctx, restKey(dir), true),
			body = baseCell(ctx, restKey(dir), true);
		if (pose) views[dir] = { body, pose, layer: chromaLayer(im, d.spec.key as Key, body).layer };
	}
	return views;
}
// ---------- calls ----------
/** Held repair disc radius around the measured wrist. The fixed 34 px disc predates larger bodies: a 64 px body's sword
 * already reaches about 39 px, and the mask silently cut the blade tip (2026-11-07 cycle, challenge.md C). Use the farthest
 * item pixel from the rest wrist over every dressed view, since one view's own reach underestimates its posed frames, plus
 * max(4 px, 10 %). Never smaller than the historical 34 px. */
export function heldRepairRadius(
	ctx: RigCtx,
	spec: Pick<ItemSpec, 'slot' | 'key'>,
	refs: { dir: DirectionName; im: Img }[],
	pad: number
): number {
	let reach = 0;
	for (const r of refs) {
		const wrist = skelOf(ctx, restKey(r.dir), true)?.[
			handOf(requireSlot(ctx.rec.manifest, spec.slot)) === 'left' ? 'LEFT ARM' : 'RIGHT ARM'
		];
		if (!wrist) continue;
		const body = padImg(baseCell(ctx, restKey(r.dir), true), pad),
			{ mask } = chromaLayer(r.im, spec.key as Key, body);
		// The object's own parts (largest, touching or hidden by the body between them); a fleck in open air must not widen the disc.
		const { comps, keep } = heldParts(mask, body),
			parts = comps.filter((_, i) => keep[i]).flat();
		for (const p of parts)
			reach = Math.max(
				reach,
				Math.hypot((p % r.im.w) + 0.5 - wrist.x - pad, ((p / r.im.w) | 0) + 0.5 - wrist.y - pad)
			);
	}
	return Math.max(34, reach + Math.max(4, 0.1 * reach));
}
/** B14 grid request (S4 inv3 / S5 H3): the clip-direction's chroma cells masked to the slot band, then the dressed keyframes
 *  (kept, black mask) as the reference design. Rig cell only (held items keep their oversize S5 route). */
async function gridReq(
	ctx: RigCtx,
	spec: Pick<ItemSpec, 'slot' | 'slotConfig' | 'prompt' | 'key'>,
	cells: string[],
	refs: { dir: DirectionName; im: Img }[],
	seed: number,
	pad = 0,
	repair = false,
	repairCols?: number
): Promise<Req> {
	const { rig } = ctx.rec.manifest,
		w = rig.cell.w + 2 * pad,
		h = rig.cell.h + 2 * pad,
		[anim, dir] = cells[0].split('/') as [string, DirectionName];
	if (cells.some((k) => k.split('/')[1] !== dir))
		throw new Error('Repair one independently drawn direction at a time.');
	const held = requireSlot(ctx.rec.manifest, spec.slot).class === 'held';
	const radius = held ? heldRepairRadius(ctx, spec, refs, pad) : 0;
	// Keep other views for QA; mixing front and back references can confuse the image editor.
	refs = refs.filter((r) => r.dir === dir);
	if (refs.length !== 1)
		throw new Error(`${dir}: repair needs exactly one matching dressed reference`);
	const cell = { w, h };
	const layout =
		repairCols !== undefined
			? gridEstimate(cell, cells.length, refs.length, repairCols)
			: repair
				? repairGridLayout(cell, cells.length, refs.length)
				: gridEstimate(cell, cells.length, refs.length);
	const cols = layout.w / w;
	if (refs.some((r) => r.im.w !== w || r.im.h !== h))
		throw new Error('Equipment reference dimensions do not match its repair canvas.');
	const designs = new Map(
		refs.map((r) => [
			r.dir,
			chromaLayer(r.im, spec.key as Key, padImg(baseCell(ctx, restKey(r.dir), true), pad)).layer
		])
	);
	const masks = cells.map((k) => {
		if (!held) {
			const direction = k.split('/')[1] as DirectionName,
				design = designs.get(direction);
			if (!design) throw new Error(`${direction}: no dressed garment reference for repair`);
			return bandMask(
				garmentBand(
					bandOf(requireSlot(ctx.rec.manifest, spec.slot), skelOf(ctx, k), h, 'repair'),
					design,
					skelOf(ctx, restKey(direction), true),
					skelOf(ctx, k)
				),
				w,
				h
			);
		}
		const [a, d, i] = k.split('/') as [string, DirectionName, string],
			measured = rig.animations.find((a0) => a0.id === a)?.sources?.[d]?.measured?.[+i];
		const observed =
			skelOf(ctx, k) ?? (hasAll(measured) ? fromApi(measured!, rig.cell) : undefined);
		const point =
			observed?.[
				handOf(requireSlot(ctx.rec.manifest, spec.slot)) === 'left' ? 'LEFT ARM' : 'RIGHT ARM'
			];
		if (
			!point ||
			!Number.isFinite(point.x) ||
			!Number.isFinite(point.y) ||
			point.x < 0 ||
			point.x > rig.cell.w ||
			point.y < 0 ||
			point.y > rig.cell.h
		)
			throw new Error(
				'Held-item repair needs valid measured hand positions on every frozen body frame.'
			);
		const mask = new Uint8Array(w * h);
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++)
				if (Math.hypot(x + 0.5 - point.x - pad, y + 0.5 - point.y - pad) <= radius)
					mask[y * w + x] = 1;
		return mask;
	});
	const g = packGrid(
		[
			...cells.map((k) => inputCell(padImg(baseCell(ctx, k), pad), spec.key)),
			...refs.map((r) => r.im)
		],
		[...masks, ...refs.map(() => null)],
		cols
	);
	const b64 = async (im: Img) => png(bytesToBase64(await encodePngBytes(im)));
	return routes.inpaintV3({
		description: gridPrompt({
			item: spec.prompt,
			slot: requireSlot(ctx.rec.manifest, spec.slot),
			key: spec.key as Key,
			anim,
			dir,
			n: cells.length,
			refs: refs.map((r) => r.dir),
			cell,
			cols,
			parts: callParts(cells)
		}),
		inpainting_image: { image: await b64(g.image), size: { width: g.image.w, height: g.image.h } },
		mask_image: { image: await b64(g.mask), size: { width: g.mask.w, height: g.mask.h } },
		no_background: true,
		seed
	});
}
/** Can a failing pose call fall back to the grid? Worn/rigid items on a chroma key (held items stay on their S5 route). */
const gridable = (spec: { slot: string; slotConfig?: Slot; key?: ItemSpec['key'] }) =>
	!!spec.key && spec.key !== 'none' && specSlot(spec).class !== 'held';

/** A frame this draft saved earlier; a pruned or lost one says so instead of failing on an undefined blob. */
async function storedFrame(sha: string): Promise<Blob> {
	const blob = await db.getBlob(sha);
	if (!blob)
		throw new LocalizedError(
			'A saved frame of this item is missing from storage.',
			'itemRoute.errors.savedFrameMissing'
		);
	return blob;
}
const blobB64 = async (sha: string) =>
	bytesToBase64(new Uint8Array(await (await storedFrame(sha)).arrayBuffer()));
/** Times each call was dropped (re-rolled, or its design or key changed): a request built across a drop is stale. */
const drops = new WeakMap<CallState, number>();
function drop(c: CallState) {
	if (c.recId) c.old.push(c.recId);
	c.recId = undefined;
	drops.set(c, (drops.get(c) ?? 0) + 1);
}
async function callRequest(d: Draft, k: number, ctx: RigCtx): Promise<Req> {
	ctx = draftContext(d, ctx);
	const c = d.calls[k],
		route = d.spec.key,
		{ rig } = ctx.rec.manifest,
		pad = padOf(requireSlot(ctx.rec.manifest, d.spec.slot), d.spec.method, rig.cell);
	let req;
	if (c.kind === 'grid') {
		// A grid only consumes the design for its own view.
		const dir = c.cells[0].split('/')[1] as DirectionName;
		const kf = keyframeOf(d.calls, dir);
		if (!kf) throw new Error(`${dir}: no dressed keyframe`);
		req = await gridReq(ctx, d.spec, c.cells, [{ dir, im: await img(kf.sha) }], c.seed);
		const blocked = queue.planBlocks(req, 1);
		if (blocked) throw automaticRepairError(blocked);
	} else if (c.kind === 'pose') {
		// the direction's dressed keyframe (from the dress call) posed through the base clip's STORED keypoints
		if (route === 'none') throw new Error('posing needs a chroma key');
		const dir = c.cells[0].split('/')[1] as DirectionName,
			anim = callAnim(c.cells),
			kf = keyframeOf(d.calls, dir);
		if (!kf) throw new Error(`${dir}: no dressed keyframe`);
		const poses = c.cells.map((key) => cellKeypoints(rig, key)),
			rest = rig.rest?.[dir]?.keypoints;
		if (poses.some((p) => !p) || !rest)
			throw new Error(`${anim}/${dir}: the rig has no stored keypoints (rig v1.3)`);
		req = itemRoute.pose({
			keyframePngB64: await blobB64(kf.sha),
			rest,
			poses: poses as Keypoint[][],
			item: d.spec.prompt,
			slot: requireSlot(ctx.rec.manifest, d.spec.slot),
			key: route,
			anim,
			dir,
			seed: c.seed,
			cell: rig.cell,
			pad,
			view: rig.view
		});
	} else {
		const frames: string[] = [];
		const cell = { w: rig.cell.w + 2 * pad, h: rig.cell.h + 2 * pad };
		if (c.reference) frames.push(await blobB64(c.reference.image.slice(7)));
		else if (c.concept) {
			if (!d.spec.reference)
				throw new LocalizedError(
					'The item reference is missing.',
					'itemRoute.errors.referenceMissing'
				);
			const image = await decodePng(base64ToBytes(d.spec.reference.base64));
			const prepared = normalize(image, cell.w, cell.h, 128, cell.h);
			if (prepared.cutPx)
				throw new LocalizedError(
					'The item reference does not fit the frame.',
					'itemRoute.errors.referenceNoFit'
				);
			frames.push(bytesToBase64(await encodePngBytes(prepared.img)));
		} else if (anchored(k, c.kind)) {
			// anchor cell: the design call's dressed cell 0 (cross-call design lock, S2; B16: dress chunks too)
			const a = recOf(d.calls[0].recId);
			if (a?.state !== 'done') throw new Error('design call not done');
			const dressed = identifiedOutputs(0, d.calls[0], a)?.[0];
			if (!dressed)
				throw new LocalizedError(
					'The design call returned no dressed frame.',
					'itemRoute.errors.designFrameMissing'
				);
			frames.push(await blobB64(dressed.sha));
		}
		const mark =
			c.kind === 'dress' && heldSkel(requireSlot(ctx.rec.manifest, d.spec.slot), d.spec.method);
		for (const key of c.cells) {
			const im = padImg(inputCell(baseCell(ctx, key, c.kind === 'dress'), route), pad),
				rest = rig.rest?.[key.split('/')[1] as DirectionName]?.keypoints;
			if (mark && !rest) throw new Error(`${key}: no rest pose to mark the held hand`);
			frames.push(
				bytesToBase64(
					await encodePngBytes(
						mark
							? markHand(im, rest!, requireSlot(ctx.rec.manifest, d.spec.slot), rig.cell, pad)
							: im
					)
				)
			);
		}
		// held (S5): dress the marked rest views on the padded canvas, held naturally, one held item
		req = itemRoute.edit(
			frames,
			itemPrompt(
				dressItem({ ...d.spec, slotConfig: requireSlot(ctx.rec.manifest, d.spec.slot) }),
				route,
				c.cells,
				c.reference?.cell ?? (anchored(k, c.kind) ? d.calls[0].cells[0] : undefined),
				c.concept
			),
			c.seed,
			cell
		);
	}
	return req;
}

/** The Activity title of an item request for one view of a move, in the user's words; the Studio names moves and views. */
export type ItemViewTitle = (anim: string, dir: DirectionName) => Message;
/** A dropped call keeps its paid record in `old` so its previous design or key never lands in the current draft. */
async function submit(d: Draft, k: number, ctx: RigCtx, signal?: AbortSignal): Promise<string> {
	const c = d.calls[k],
		dropped = drops.get(c),
		route = d.spec.key;
	const label = `M3 ${d.spec.id} call ${k + 1}/${d.calls.length} (${route}${
		c.kind === 'pose'
			? `, pose ${callParts(c.cells)
					.map((p) => p.anim)
					.join(' + ')}/${c.cells[0].split('/')[1]}`
			: ''
	})`;
	const req = await callRequest(d, k, ctx);
	signal?.throwIfAborted();
	const id = (
		await queue.enqueue(req, {
			signal,
			label,
			title: message('activity.titleItemCall', {
				name: d.spec.name,
				index: k + 1,
				total: d.calls.length
			}),
			tag: d.activityScope ? 'studio-move' : 'm3',
			activityScope: d.activityScope,
			minimumTier: draftMinimumTier(d, ctx.rec.manifest.rig)
		})
	).id;
	if (drops.get(c) === dropped) c.recId = id;
	else c.old.push(id);
	return id;
}
async function runCall(
	d: Draft,
	k: number,
	ctx: RigCtx,
	persist: () => Promise<unknown>,
	signal?: AbortSignal
): Promise<JobRec> {
	signal?.throwIfAborted();
	let id = d.calls[k].recId;
	if (id && !recOf(id))
		throw new Error(
			'The saved generation record is unavailable. No request was resent. Review this item before starting a new attempt.'
		);
	if (!id) {
		id = await submit(d, k, ctx, signal);
		signal?.throwIfAborted();
		await persist();
	}
	const r = recOf(id)!;
	if (signal) queue.observeScope(id, signal);
	signal?.throwIfAborted();
	return terminal(r) ? r : settled(r.id, signal);
}

/** A paid call of the draft that ended without results, as its log keeps it. */
const callStopped = (call: number, r: JobRec): LoggedMessage => ({
	key: 'generation.outcome.callStopped',
	vars: { index: call, state: message(`activity.state.${r.state}`) },
	text: `call ${call} ${r.state}: ${r.error ?? ''}`,
	call
});

/** New seed for call k (k = 0 also drops the later calls: their anchor came from the old design). */
export function rerollCall(d: Draft, k: number, why: string) {
	const c = d.calls[k];
	drop(c);
	c.seed = seed();
	c.rerolls++;
	d.log.push(`re-roll call ${k + 1} (${why})`);
	// k = 0 drops every later call (their anchor / keyframes came from the old design); a later dress chunk drops its directions' poses
	const dirs = c.cells.map((x) => x.split('/')[1]),
		stale =
			k === 0
				? d.calls.slice(1)
				: c.kind === 'dress'
					? d.calls.filter((l) =>
							l.kind === 'pose' || l.kind === 'grid'
								? dirs.includes(l.cells[0].split('/')[1])
								: false
						)
					: [];
	for (const l of stale) drop(l);
}
/** Calls of a stopped draft whose paid output cannot be used: the request ended without results, or it returned missing or
 *  malformed frames (G1). Every other completed call stays reusable from its record. */
export function failedCalls(d: Draft, res: Pick<ItemResult, 'g1'> | null): number[] {
	return d.calls.flatMap((c, k) => {
		const r = recOf(c.recId);
		return (terminal(r) && r!.state !== 'done') || structuralReason(res?.g1.get(k) ?? '')
			? [k]
			: [];
	});
}
/** New seeds for exactly these calls (and what depends on them, see rerollCall), priced by every call still to buy: the
 *  completed calls that keep their records are free. */
export function rerollFailed(d: Draft, ks: number[], rig: Rig): { draft: Draft; gens: number } {
	const draft = structuredClone(d),
		pad = padOf(specSlot(draft.spec), draft.spec.method, rig.cell);
	for (const k of ks) rerollCall(draft, k, 'player re-roll of a failed call');
	const unbought = draft.calls
		.filter((c) => !c.recId)
		.map((c) => ({ kind: c.kind ?? ('edit' as const), cells: c.cells }));
	return {
		draft,
		gens: planGens(unbought, { w: rig.cell.w + 2 * pad, h: rig.cell.h + 2 * pad })
	};
}
/** The finished part of an incomplete draft as its own draft: only moves whose every frame landed from a call that completed
 *  without structural failure. Undefined unless the standing views are complete (an item without them could not be worn or
 *  extended) and something was left out. Missing moves stay listed as missing coverage, to make later at their own price. */
export function finishedPart(d: Draft, rig: Rig, r: ItemResult): Draft | undefined {
	const covered = new Set(r.cells.map((c) => c.key)),
		broken = new Set(failedCalls(d, r).flatMap((k) => d.calls[k].cells)),
		unfinished = new Set(d.calls.flatMap((c) => (recOf(c.recId)?.state === 'done' ? [] : c.cells)));
	const complete = d.spec.anims.filter((anim) => {
		const clip = rig.animations.find((a) => a.id === anim);
		return (
			!!clip &&
			(d.spec.clipDirs?.[anim] ?? d.spec.dirs).every((dir) =>
				Array.from({ length: clip.cells }, (_, i) => `${anim}/${dir}/${i}`).every(
					(key) => covered.has(key) && !broken.has(key) && !unfinished.has(key)
				)
			)
		);
	});
	const standing = draftStanding(d);
	if (!complete.includes(standing) || complete.length === d.spec.anims.length) return undefined;
	const inside = (cell: string) => complete.includes(cell.split('/')[0]);
	return {
		...structuredClone(d),
		spec: {
			...structuredClone(d.spec),
			anims: complete,
			...(d.spec.clipDirs
				? { clipDirs: Object.fromEntries(complete.map((a) => [a, d.spec.clipDirs![a]])) }
				: {})
		},
		// Dressed standing views (rest/* cells) and the first call, which later calls anchor to, serve every kept move.
		calls: structuredClone(
			d.calls.filter((c, k) => k === 0 || c.kind === 'dress' || c.cells.some(inside))
		)
	};
}
export const failsOf = (res: ItemResult, k: number) => [
	...(res.g1.has(k) ? [res.g1.get(k)!] : []),
	...(res.qa?.failCalls.get(k) ?? [])
];

export interface RunHooks {
	signal?: AbortSignal;
	status?: (s: string) => void;
	persist?: () => Promise<unknown>;
	result?: (r: ItemResult) => void;
	standingPalettes?: ReadonlyMap<DirectionName, number[]>;
}

/** Every check passed with nothing to look at: such a draft saves itself (round 10: review is optional). */
export const isClean = (r: ItemResult) =>
	r.qa?.qa.status === 'pass' && !r.g1.size && !r.qa.failCalls.size && !r.qa.warnings.length;

/** Run each batch of the player-requested plan once. Checks never authorize another paid attempt. */
export async function runItem(
	d: Draft,
	savedCtx: RigCtx,
	h: RunHooks = {}
): Promise<ItemResult | null> {
	h.signal?.throwIfAborted();
	const ctx = draftContext(d, savedCtx);
	if (d.rigId !== ctx.rec.id)
		throw new Error(`${d.spec.id} belongs to ${d.rigId}, not ${ctx.rec.id}`);
	const persist = h.persist ?? (async () => {}),
		status = h.status ?? (() => {});
	if (d.spec.method === 'skel')
		for (const c of d.calls)
			if (c.kind === 'pose' && !c.recId && frozenGrid(ctx.rec.manifest.rig, d.spec, c.cells)) {
				throw new Error(
					'The equipment plan no longer matches the imported poses. Review a new priced attempt before generating.'
				);
			}
	// One evaluation at a time, so an older result never replaces a newer one. Each caller handles its own evaluation's error;
	// the chain itself only orders them.
	let chain: Promise<unknown> = Promise.resolve();
	const evalItem = () => {
		const r = chain.then(async () => {
			h.signal?.throwIfAborted();
			const x = await evaluateItem(d, savedCtx, h.standingPalettes);
			h.signal?.throwIfAborted();
			h.result?.(x);
			return x;
		});
		chain = r.then(
			() => {},
			() => {}
		);
		return r;
	};
	// Streaming preview: landings during an evaluation coalesce into one more (throttle without timers).
	let streaming = false,
		again = false;
	const landed = () => {
		if (!h.result || h.signal?.aborted) return;
		if (streaming) {
			again = true;
			return;
		}
		streaming = true;
		evalItem()
			.catch((e) => {
				if (!h.signal?.aborted) console.error('item preview', e);
			})
			.finally(() => {
				streaming = false;
				if (again) {
					again = false;
					landed();
				}
			});
	};
	// dress chunks report through their gate evaluation (poseEarly)
	const started: Promise<JobRec>[] = [];
	const call = (k: number) => {
		const pending = runCall(d, k, ctx, persist, h.signal).then((r) => {
			if (r.state === 'done' && d.calls[k]?.kind !== 'dress') landed();
			return r;
		});
		started.push(pending);
		return pending;
	};
	/** Pose calls of the directions call k dressed. */
	const posesOf = (k: number) => {
		const dirs = new Set(d.calls[k].cells.map((x) => x.split('/')[1]));
		return d.calls.flatMap((c, p) =>
			c.kind === 'pose' && dirs.has(c.cells[0].split('/')[1]) ? [p] : []
		);
	};
	// A passing single dress chunk can start its already-priced poses early. Multiple chunks share the first anchor,
	// so evaluate them together before starting their dependent batches.
	const poseEarly = async (early: Map<number, Promise<JobRec>>, k: number, r: JobRec) => {
		if (r.state !== 'done' || d.calls[k].kind !== 'dress') return;
		if (expectsWaistBand(d.spec.prompt)) return; // Evaluate standing consistency before the planned animation batches.
		if (d.calls.filter((c) => c.kind === 'dress').length > 1) return landed();
		if (!posesOf(k).length) return;
		const res = await evalItem();
		h.signal?.throwIfAborted();
		if (failsOf(res, 0).length || failsOf(res, k).length) return;
		status('poses');
		for (const p of posesOf(k))
			if (!early.has(p)) {
				const started = call(p);
				// The coverage step awaits this promise and surfaces its error; no additional attempt is authorized here.
				started.catch(() => {});
				early.set(p, started);
			}
	};
	let res: ItemResult | null = null;
	try {
		do {
			// design calls: call 1, then the other dress chunks (B16: they carry call 1's dressed cell 0 as their anchor)
			const nd = Math.max(1, d.calls.filter((c) => c.kind === 'dress').length),
				early = new Map<number, Promise<JobRec>>();
			status('design call');
			const r0 = await call(0);
			if (r0.state !== 'done') {
				d.log.push(callStopped(1, r0));
				break;
			}
			if (d.calls[0].concept) {
				const frames = outputsOf(r0);
				const { cell } = ctx.rec.manifest.rig;
				const pad = padOf(specSlot(d.spec), d.spec.method, cell);
				if (
					r0.jobs.length !== 1 ||
					frames.length !== d.calls[0].cells.length + 1 ||
					frames.some((frame, index) => frame.label.split('/').at(-1) !== String(index))
				)
					throw new LocalizedError(
						'PixelLab returned incomplete reference or standing frames. No dependent request was sent.',
						'itemRoute.errors.incompleteReferenceFrames'
					);
				for (const frame of frames.slice(1)) {
					const image = await img(frame.sha);
					if (image.w !== cell.w + 2 * pad || image.h !== cell.h + 2 * pad)
						throw new LocalizedError(
							'PixelLab returned a standing frame of the wrong size. No dependent request was sent.',
							'itemRoute.errors.standingFrameSize'
						);
				}
			}
			const gates = [poseEarly(early, 0, r0)];
			// Re-rolling call 1 drops every later call (rerollCall), so nothing after it is bought unless each of its requested
			// frames is identified and of the item's size, not only the anchor frame.
			const designOuts = identifiedOutputs(0, d.calls[0], r0)?.slice(0, d.calls[0].cells.length);
			const { cell } = ctx.rec.manifest.rig;
			const pad = padOf(specSlot(d.spec), d.spec.method, cell);
			const designIntact =
				!!designOuts &&
				(await Promise.all(designOuts.map((o) => img(o.sha)))).every(
					(im) => im.w === cell.w + 2 * pad && im.h === cell.h + 2 * pad
				);
			const anchoredCallReady = (c: CallState) => !!c.recId || designIntact;
			await Promise.all(
				d.calls.slice(1, nd).map((c, i) => {
					const k = i + 1;
					if (!anchoredCallReady(c)) return;
					return call(k).then((r) => {
						gates.push(poseEarly(early, k, r));
						if (r.state !== 'done') d.log.push(callStopped(k + 1, r));
					});
				})
			);
			await Promise.all(gates);
			const design = await evalItem();
			res = design;
			if (hasStructuralFailure(design)) {
				d.log.push({
					key: 'generation.outcome.standingFrames',
					text: 'PixelLab returned incomplete or malformed standing frames. No automatic retry was made.'
				});
			}
			const readyDesigns = new Set(
				d.calls
					.slice(0, nd)
					.flatMap((c, k) =>
						c.kind === 'dress' &&
						recOf(c.recId)?.state === 'done' &&
						!structuralReason(design.g1.get(k) ?? '')
							? c.cells
							: []
					)
			);
			// Re-rolling a malformed design call drops every later call (rerollCall), so buy none of them yet.
			const designReady = !structuralReason(design.g1.get(0) ?? '');
			status(`calls ${nd + 1}–${d.calls.length}`);
			const stopped = await Promise.all(
				d.calls.slice(nd).map(async (c, i) => {
					const k = i + nd;
					if (!c.recId && !designReady) return true;
					if (!anchoredCallReady(c)) return true;
					if (c.kind === 'pose' || c.kind === 'grid') {
						const dir = c.cells[0].split('/')[1] as DirectionName;
						if (!c.recId && !readyDesigns.has(restKey(dir))) return true;
					}
					const r = await (early.get(k) ?? call(k));
					if (r.state === 'done') return false;
					d.log.push(callStopped(k + 1, r));
					return true;
				})
			);
			res = await evalItem();
			if (stopped.some(Boolean)) break;
			d.log.push(
				isClean(res)
					? { key: 'generation.outcome.passed', text: 'Every frame passed the checks.' }
					: {
							key: 'generation.outcome.reviewIssues',
							text: 'Issues detected. Review the item and choose Try again or Accept as is. No automatic retry was made.'
						}
			);
		} while (false);
	} catch (e) {
		if (!h.signal?.aborted)
			d.log.push(e instanceof LocalizedError ? loggedMessage(e) : `error: ${errorText(e)}`);
	} finally {
		if (h.signal?.aborted) await Promise.allSettled(started);
		if (!h.signal?.aborted) await persist();
	}
	return res;
}

// ---------- extraction + QA (re-derived from the ledger) ----------
const decoded = new Map<string, Img>();
async function img(sha: string) {
	const im = await decodedFrame(sha);
	if (im instanceof Error) throw im;
	return im;
}
/** A frame's image, or the decode error that makes it that frame's own failure. The storage read stays outside: a failed or
 *  missing read stops the whole check (its free Try again), never a gap the user could keep. */
async function decodedFrame(sha: string): Promise<Img | Error> {
	const cached = decoded.get(sha);
	if (cached) return cached;
	const blob = await storedFrame(sha);
	try {
		const im = binaryAlpha(await decodePng(blob));
		decoded.set(sha, im);
		return im;
	} catch (error) {
		return error instanceof Error ? error : new Error(String(error));
	}
}
/** Decode this submitted request's mask bytes or its saved record; do not reconstruct permissions during extraction. */
async function inpaintStencils(
	body: unknown,
	count: number,
	w: number,
	h: number,
	record?: JobRec
) {
	type Sized = {
		image?: { type?: string; base64?: string; $blob?: string };
		size?: { width: number; height: number };
	};
	const params = body as { inpainting_image?: Sized; mask_image?: Sized } | null;
	const input = params?.inpainting_image?.size,
		mask = params?.mask_image;
	const cols = (input?.width ?? 0) / w;
	if (
		!input ||
		!mask?.size ||
		!Number.isInteger(cols) ||
		cols < 1 ||
		input.height !== Math.ceil((count + 1) / cols) * h ||
		mask.size.width !== input.width ||
		mask.size.height !== input.height
	) {
		throw new Error('The submitted inpaint mask does not match its frame layout.');
	}
	let bytes: Uint8Array;
	if (record) {
		const hash = mask.image?.$blob;
		if (typeof hash !== 'string' || !record.inputs.includes(hash))
			throw new Error('The saved inpaint mask identity is unavailable.');
		const blob = await db.getBlob(hash);
		if (!blob) throw new Error('The saved inpaint mask is missing from storage.');
		bytes = new Uint8Array(await blob.arrayBuffer());
		if ((await sha256(bytes)) !== hash) throw new Error('The saved inpaint mask hash changed.');
	} else {
		if (mask.image?.type !== 'base64' || typeof mask.image.base64 !== 'string')
			throw new Error('The submitted inpaint mask image is unavailable.');
		bytes = base64ToBytes(mask.image.base64);
	}
	const image = await decodePngBytes(bytes);
	if (image.w !== input.width || image.h !== input.height)
		throw new Error('The submitted inpaint mask PNG has the wrong canvas.');
	// Only target cells are extracted. References and unused tail cells are not equipment permissions.
	return {
		cells: cutGrid(image, count, w, h, cols).map(hardMaskBits),
		hash: await sha256(bytes),
		cols,
		size: input
	};
}
/** Extraction is the costly part of an evaluation, and streaming evaluates after every landed call: each landed output is
 *  extracted once per signature and copied before postProcess changes it. Kept per draft, so it goes with the draft. */
const extracted = new WeakMap<Draft, Map<string, CellOut>>();
function extractOnce(d: Draft, sig: string, run: () => CellOut): CellOut {
	let m = extracted.get(d);
	if (!m) extracted.set(d, (m = new Map()));
	let c = m.get(sig);
	if (!c) m.set(sig, (c = run()));
	return {
		...c,
		layer: { ...c.layer, data: new Uint8ClampedArray(c.layer.data) },
		mask: new Uint8Array(c.mask),
		...(c.stencil ? { stencil: new Uint8Array(c.stencil) } : {}),
		...(c.cut ? { cut: new Uint8Array(c.cut) } : {})
	};
}
export async function evaluateItem(
	d: Draft,
	savedCtx: RigCtx,
	standingPalettes?: ReadonlyMap<DirectionName, number[]>
): Promise<ItemResult> {
	const ctx = draftContext(d, savedCtx);
	if (d.rigId !== ctx.rec.id)
		throw new Error(`${d.spec.id} belongs to ${d.rigId}, not ${ctx.rec.id}`);
	type Out = {
		k: number;
		key: string;
		out: Img;
		posed: boolean;
		rec: string;
		stencil?: Uint8Array;
		stencilHash?: string;
	};
	const { rig } = ctx.rec.manifest,
		route = d.spec.key,
		g1 = new Map<number, string>(),
		outs: Out[] = [],
		dressOuts: Out[] = [];
	const pad = padOf(requireSlot(ctx.rec.manifest, d.spec.slot), d.spec.method, rig.cell),
		slot = requireSlot(ctx.rec.manifest, d.spec.slot),
		W = rig.cell.w + 2 * pad,
		H = rig.cell.h + 2 * pad;
	const dirOf = (key: string) => key.split('/')[1] as DirectionName;
	// the dressed standing view is also the item's cell of a single-frame imported-rest clip (no pose call)
	const restCells = (dir: DirectionName) =>
		rig.animations
			.filter(
				(a) =>
					d.spec.anims.includes(a.id) &&
					(d.spec.clipDirs?.[a.id] ?? d.spec.dirs).includes(dir) &&
					reusesStanding(rig, d.spec, a.id, dir)
			)
			.map((a) => `${a.id}/${dir}/0` as CellKey);
	const pending: CellKey[] = []; // cells of calls that have not landed: previews show them as loading, not as transparent
	for (const [k, c] of d.calls.entries()) {
		const r = recOf(c.recId);
		if (r?.state !== 'done') {
			pending.push(
				...(c.kind === 'dress'
					? c.cells.flatMap((x) => restCells(dirOf(x)))
					: (c.cells as CellKey[]))
			);
			continue;
		}
		if (c.kind === 'grid') {
			// B14: cut the cells out of the returned grid
			const outputs = outputsOf(r);
			if (outputs.length !== 1) {
				g1.set(k, 'G1 expected exactly one repair grid');
				continue;
			}
			let masks: Awaited<ReturnType<typeof inpaintStencils>>;
			try {
				masks = await inpaintStencils(r.params, c.cells.length, W, H, r);
			} catch (error) {
				g1.set(k, `G1 ${(error as Error).message}`);
				continue;
			}
			const g = await decodedFrame(outputs[0].sha);
			if (g instanceof Error) {
				g1.set(k, `G1 repair grid unreadable: ${g.message}`);
				continue;
			}
			if (g.w !== masks.size.width || g.h !== masks.size.height) {
				g1.set(k, 'G1 repair grid does not match its submitted frame layout');
				continue;
			}
			const cut = cutGrid(g, c.cells.length, W, H, masks.cols);
			c.cells.forEach((key, i) =>
				outs.push({
					k,
					key,
					out: cut[i],
					posed: true,
					rec: r.id,
					stencil: masks.cells[i],
					stencilHash: masks.hash
				})
			);
			continue;
		}
		let o = identifiedOutputs(k, c, r);
		if (!o) {
			g1.set(k, `G1 expected ${expectedCellOutputs(k, c)} identifiable frame outputs`);
			continue;
		}
		if (c.kind === 'pose') {
			const dir = c.cells[0].split('/')[1] as DirectionName;
			const poses = paddedPoses(c.cells.map((key) => cellKeypoints(rig, key)!));
			o = unrotate(
				o,
				f0Last(
					requireSlot(ctx.rec.manifest, d.spec.slot),
					rig.rest?.[dir]?.keypoints ?? [],
					poses,
					rig.cell
				)
			).slice(0, c.cells.length);
		}
		// Labels prove each frame's cell, so a malformed frame drops only itself; the call stays G1 for review and re-roll.
		// A frame that cannot be decoded is named with its own reason, like a wrong size. A standing frame it hides still
		// blocks keeping the draft (availableGaps).
		for (const [i, key] of c.cells.entries()) {
			const im = await decodedFrame(o[i].sha);
			if (im instanceof Error) {
				g1.set(
					k,
					[g1.get(k), `G1 frame ${key} unreadable: ${im.message}`].filter(Boolean).join('; ')
				);
				continue;
			}
			if (im.w !== W || im.h !== H) {
				g1.set(k, `G1 output ${im.w}x${im.h}`);
				continue;
			}
			(c.kind === 'dress' ? dressOuts : outs).push({
				k,
				key,
				out: im,
				posed: c.kind === 'pose',
				rec: r.id
			});
		}
	}
	if (d.spec.standing && d.spec.method !== 'skel')
		for (const o of [...outs]) {
			const dir = dirOf(o.key);
			for (const key of restCells(dir)) if (key !== o.key) outs.push({ ...o, key });
		}
	for (const o of dressOuts)
		for (const key of restCells(dirOf(o.key))) outs.push({ ...o, key, posed: true });
	const keyCut: Cuts = {},
		keyRec = new Map(dressOuts.map((o) => [dirOf(o.key), o.rec]));
	// the signature names the output (record + cell) and every extraction input that can change for it (a posed cut follows its
	// keyframe's record)
	const ex = (o: Out, useCc?: boolean, restView = false) =>
		extractOnce(
			d,
			[
				o.rec,
				d.spec.slot,
				o.key,
				o.k,
				route,
				pad,
				useCc,
				restView,
				o.posed,
				rig.baseHash,
				keyRec.get(dirOf(o.key)),
				o.stencilHash
			].join('|'),
			() =>
				// ponytail: padded (held) slots have no keypoint band, so the rig-cell skeleton is not shifted
				extractCell({
					key: o.key,
					call: o.k,
					base: padImg(baseCell(ctx, o.key, restView), pad),
					out: o.out,
					route,
					band: bandOf(
						requireSlot(ctx.rec.manifest, d.spec.slot),
						pad ? undefined : skelOf(ctx, o.key, restView),
						H
					),
					useCc,
					posed: o.posed,
					clip: slot.band,
					held: slot.class === 'held',
					pad,
					cut: cutFor(ctx, d.spec.slot, o.key, o.posed, keyCut, restView),
					...(o.stencil ? { stencil: o.stencil } : {})
				})
		);
	// the dress call only makes keyframes: gate them (G2, G3, presence); they are not item cells themselves
	const keys: Partial<Record<DirectionName, Img>> = {}; // dressed keyframe layers per direction (H4)
	const kfCells = dressOuts.map((o) => ex(o, undefined, true));
	for (const [i, c] of kfCells.entries()) {
		keys[dressOuts[i].key.split('/')[1] as DirectionName] = c.layer;
		if (c.cut) keyCut[dressOuts[i].key.split('/')[1] as DirectionName] = c.cut;
	}
	const hidden = hiddenViews(kfCells, keys, requireSlot(ctx.rec.manifest, d.spec.slot)),
		hiddenWarnings: string[] = [],
		smudged = smudgedViews(
			requireSlot(ctx.rec.manifest, d.spec.slot),
			d.spec.prompt,
			kfCells.map((c) => c.layer)
		),
		sharedColors = sharedDesignColors(kfCells.map((c) => c.layer));
	for (const [i, c] of kfCells.entries()) {
		const o = dressOuts[i];
		if (!c.area && hidden.has(o.key.split('/')[1]))
			hiddenWarnings.push(
				`G4 keyframe ${o.key}: no item in this view; check that the view hides it`
			);
		const bad = [
			g2Fails(c) && `G2 keyframe ${o.key} key kept ${c.keyKept!.toFixed(3)} (${c.keyLost} px)`,
			c.keyOutside != null &&
				c.keyOutside > GATES.keyOutside &&
				`G3 keyframe ${o.key} key outside ${c.keyOutside.toFixed(3)}`,
			!c.area && !hidden.has(o.key.split('/')[1]) && `G4 keyframe ${o.key}: item missing`,
			// B14: flag a smudged design for review (T3: red cape north hem); it holds the early pose start, but only G1 stops poses
			smudged[i] === 'smudge' &&
				`D1 keyframe ${o.key}: ${(grayShare(c.layer, true, sharedColors[i]) * 100).toFixed(0)} % gray smudges in a colorful design`
		].filter(Boolean);
		if (smudged[i] === 'dark')
			hiddenWarnings.push(
				`D1 keyframe ${o.key}: a dark patch not seen in the other views, possibly not part of the design`
			);
		if (bad.length) g1.set(o.k, [g1.get(o.k), ...bad].filter(Boolean).join('; '));
	}
	const retryKey =
		route === 'none'
			? undefined
			: measuredKeyCollision(d.spec.prompt, route, kfCells, dressOuts, g1);
	const designIssue = designConsistency(
		d.spec.prompt,
		standingViews(
			d,
			ctx,
			dressOuts.map((o) => ({ dir: dirOf(o.key), im: o.out }))
		)
	);
	if (designIssue)
		for (const dir of designIssue.missingDirections) {
			const k = dressOuts.find((o) => dirOf(o.key) === dir)!.k;
			g1.set(
				k,
				[
					g1.get(k),
					`D2 keyframe ${dir}: the requested wraparound waist band is missing compared with the other standing views`
				]
					.filter(Boolean)
					.join('; ')
			);
		}
	const run = (useCc?: boolean) => outs.map((o) => ex(o, useCc));
	let cells = run();
	if (route === 'none' && cells.length) {
		// per-item novel_cc decision (S1): novel2 lost > 25 % of the area over all cells
		const cc = run(true);
		if (cc.reduce((s, c) => s + c.area, 0) * 0.75 > cells.reduce((s, c) => s + c.area, 0))
			cells = cc;
	}
	postProcess(rig, slot, cells, keys, pad);
	const kOut = d.spec.method === 'skel' ? GATES.keyOutsidePosed : GATES.keyOutside;
	const qa = cells.length
		? withH4(
				itemQa(
					rig,
					slot,
					route,
					cells,
					d.calls.reduce((s, c) => s + c.old.length, 0),
					kOut,
					pad,
					hidden,
					standingPalettes
				),
				slot,
				cells,
				keys,
				rig,
				referenceBodies(rig, ctx.project.images),
				d.spec.prompt
			)
		: null;
	if (qa && hiddenWarnings.length) {
		qa.warnings.push(...hiddenWarnings);
		if (qa.qa.status === 'pass') qa.qa.status = 'warn';
	}
	if (qa)
		discloseJoints(
			qa,
			rig,
			d.calls.filter((c) => recOf(c.recId)?.state === 'done')
		);
	// Dressed item pixels can land before any target animation cell exists. Expose them without waiting for pose coverage.
	const thumbnail = (
		kfCells.find((c) => c.area && c.key.split('/')[1] === 'south') ?? kfCells.find((c) => c.area)
	)?.layer;
	return {
		cells,
		qa,
		g1,
		preview: qa ? await previewProject(d, savedCtx, slot, cells, qa, pending) : null,
		...(thumbnail ? { thumbnail } : {}),
		...(retryKey ? { retryKey } : {})
	};
}
/** Near-key share of a dressed view from which the item's colors collide with the key (see nearKeyShare). */
export const KEY_COLLISION = 0.2;
/**
 * The key comes from color words in the prompt, so an item the model colors like the key without naming it (goblin armor)
 * loses those px as background while other gates pass. Measure each dressed view: a near-key share of KEY_COLLISION or more
 * adds a K1 review note. On any collision (K1, or the keyframe's G3/G4) the key for Try again comes from the measured colors,
 * the kept item px plus key-colored px off the body, preferring keys the prompt allows. Nothing is resent automatically.
 */
export function measuredKeyCollision(
	prompt: string,
	route: Key,
	kfCells: CellOut[],
	dressOuts: { k: number; key: string; out: Img }[],
	g1: Map<number, string>
): Key | undefined {
	const measured: [number, number, number][] = [],
		shares = kfCells.map((c, i) => nearKeyShare(dressOuts[i].out, c.mask, route));
	let collided = false;
	for (const [i, c] of kfCells.entries()) {
		const o = dressOuts[i],
			od = o.out.data,
			bd = c.base.data;
		for (let p = 0; p < c.mask.length; p++) {
			const q = p * 4;
			// Off-body key px count as item colors only when they are not mannequin ramp shades (a drifted stand-in edge).
			if (
				c.mask[p] ||
				(!bd[q + 3] &&
					od[q + 3] >= 128 &&
					keyScore(route, od[q], od[q + 1], od[q + 2]) >= KT &&
					rampDistance(route, od[q], od[q + 1], od[q + 2]) > 16)
			)
				measured.push([od[q], od[q + 1], od[q + 2]]);
		}
		if (
			shares[i] >= KEY_COLLISION ||
			new RegExp(`G3 keyframe ${o.key} |G4 keyframe ${o.key}: item missing`).test(g1.get(o.k) ?? '')
		)
			collided = true;
	}
	if (!collided || !measured.length) return undefined;
	const alt = keyFor(measured, [
		...KEYS.filter((k) => keyAllowed(prompt, k)),
		...KEYS.filter((k) => !keyAllowed(prompt, k))
	]);
	const next = alt.key !== route ? alt.key : undefined;
	for (const i of kfCells.keys())
		if (shares[i] >= KEY_COLLISION) {
			// The retry hint is shown from ItemResult.retryKey, not stored here: a saved item's Try again picks its key afresh.
			const o = dressOuts[i],
				note = `K1 keyframe ${o.key}: ${Math.round(shares[i] * 100)} % of the item's colors lean toward the ${KEY_NAME[route]} background, so parts may be missing`;
			g1.set(o.k, [g1.get(o.k), note].filter(Boolean).join('; '));
		}
	return next;
}
/** itemQa + the H4 keyframe-consistency gate (posed cells only). */
export function withH4(
	q: QaResult,
	slot: Slot,
	cells: CellOut[],
	keys: Partial<Record<DirectionName, Img>>,
	rig: Rig,
	bodies?: Partial<Record<DirectionName, Img>>,
	prompt = ''
): QaResult {
	const h = dirGate(slot, cells, keys, rig, bodies, prompt);
	const reviewCounts = (
		summary: {
			missingLowerFrames?: number;
			footwearReviewFrames?: number;
			waistReviewFrames?: number;
			facingReviewFrames?: number;
			detailReviewFrames?: number;
		},
		checks: ReturnType<typeof dirGate>
	) => {
		if (checks.missingLowerFrames) summary.missingLowerFrames = checks.missingLowerFrames;
		else delete summary.missingLowerFrames;
		if (checks.footwearReviewFrames) summary.footwearReviewFrames = checks.footwearReviewFrames;
		else delete summary.footwearReviewFrames;
		if (checks.waistReviewFrames) summary.waistReviewFrames = checks.waistReviewFrames;
		else delete summary.waistReviewFrames;
		if (checks.facingReviewFrames) summary.facingReviewFrames = checks.facingReviewFrames;
		else delete summary.facingReviewFrames;
		if (checks.detailReviewFrames) summary.detailReviewFrames = checks.detailReviewFrames;
		else delete summary.detailReviewFrames;
	};
	reviewCounts(q.qa, h);
	q.qa.maxPaletteDist = Math.max(q.qa.maxPaletteDist, h.maxPaletteDist);
	for (const [k, why] of h.fails) q.failCalls.set(k, [...(q.failCalls.get(k) ?? []), ...why]);
	q.warnings.push(...h.warnings);
	if (h.fails.size) q.qa.status = 'fail';
	else if (h.warnings.length && q.qa.status === 'pass') q.qa.status = 'warn';
	for (const [clip, summary] of Object.entries(q.qa.clips)) {
		const part = dirGate(
			slot,
			cells.filter((c) => clipOf(c.key) === clip),
			keys,
			rig,
			bodies,
			prompt
		);
		reviewCounts(summary, part);
		summary.maxPaletteDist = Math.max(summary.maxPaletteDist, part.maxPaletteDist);
		if (part.fails.size) summary.status = 'fail';
		else if (part.warnings.length && summary.status === 'pass') summary.status = 'warn';
	}
	return q;
}
/** The rig project with this draft equipped (for compose previews in every direction, mirrored ones included). */
async function previewProject(
	d: Draft,
	ctx: RigCtx,
	slot: Slot,
	cells: CellOut[],
	qa: QaResult,
	pending: CellKey[]
): Promise<Project> {
	const { item, images } = await buildItem({
		spec: JSON.parse(JSON.stringify({ ...d.spec, slotConfig: slot })) as ItemSpec,
		rig: ctx.rec.manifest.rig,
		cells,
		route: d.spec.key,
		provenance: [],
		qa: qa.qa,
		pad: padOf(slot, d.spec.method, ctx.rec.manifest.rig.cell),
		pending
	});
	const m: Manifest = structuredClone({ ...ctx.rec.manifest, slots: ctx.rec.manifest.slots ?? [] });
	// A slot the character lacks comes in ladder order with its rig's near-hand order, as when the item is saved.
	putItem(m, item, [...slotLadder(m.rig), slot]);
	return { manifest: m, images: new Map([...ctx.project.images, ...images]) };
}

// ---------- accept ----------
const toProv = (r: JobRec, c: CallState): Provenance => ({
	endpoint: r.endpoint,
	params: JSON.parse(
		JSON.stringify(r.params, (_k, v) =>
			v && typeof v === 'object' && '$blob' in v ? { sha256: v.$blob } : v
		)
	),
	seed: c.seed,
	requestHash: `sha256:${r.requestHash}`,
	jobId: r.jobs[0]?.id,
	usage: reportedUsage(r),
	createdAt: new Date(r.submittedAt ?? r.createdAt).toISOString(),
	produced: [...c.cells] as Provenance['produced']
});
/** A draft's receipts: its finished current calls in call order (`index` maps a call to the entry CellQa.provenance names),
 *  then the attempts that re-rolls replaced, each with its own seed, so a saved item's recorded cost includes them. A call
 *  that never finished (a kept draft's missing frames) counts like a replaced attempt. */
function draftProvenance(d: Draft): { provenance: Provenance[]; index: Map<number, number> } {
	const index = new Map<number, number>();
	const current = d.calls.flatMap((c, k) => {
		const r = recOf(c.recId);
		if (r?.state !== 'done') return [];
		index.set(k, index.size);
		return [toProv(r, c)];
	});
	const used = new Set(d.calls.flatMap((c) => (recOf(c.recId)?.state === 'done' ? [c.recId] : [])));
	const replaced = [...new Set(d.calls.flatMap((c) => [...c.old, ...(c.recId ? [c.recId] : [])]))]
		.filter((id) => !used.has(id))
		.map(recOf)
		// A failed or canceled attempt counts only when PixelLab reported what it billed.
		.filter((r): r is JobRec => r?.state === 'done' || (!!r && !!reportedUsage(r)))
		.map((r): Provenance => {
			const seed = (r.params as { seed?: unknown } | null)?.seed;
			return {
				...toProv(r, { cells: [], seed: typeof seed === 'number' ? seed : 0, rerolls: 0, old: [] }),
				replaced: true
			};
		});
	return { provenance: [...current, ...replaced], index };
}
/** The body cells (what baseHash covers) of `anims`, comparable across records. */
const bodyCells = (m: Manifest, anims: string[]) =>
	stableStringify([
		m.rig.directions.map((d) => d.id),
		anims.map((a) => m.items.find((i) => i.id === m.rig.baseItem)?.layers[0].cells?.[a] ?? null)
	]);
/** Write the item (layers + cell blobs + provenance + QA) into the rig's project record. A non-pass QA becomes "accepted".
 *  With `available`, a stopped draft is kept from its verified frames only (availableGaps); the rest stay missing coverage. */
export async function acceptItem(
	d: Draft,
	savedCtx: RigCtx,
	res?: ItemResult,
	available = false
): Promise<{ item: Item; cells: number }> {
	const ctx = draftContext(d, savedCtx),
		rig = ctx.rec.manifest.rig;
	if (d.rigId !== ctx.rec.id)
		throw new Error(`${d.spec.id} belongs to ${d.rigId}, not ${ctx.rec.id}`);
	const r = res ?? (await evaluateItem(d, savedCtx));
	if (available) {
		if (!availableGaps(d, rig, r)) throw keepWithoutStandingError();
		if (d.calls.some((c) => c.recId && !terminal(recOf(c.recId))))
			throw new Error(`${d.spec.id}: not all calls are done`);
	} else {
		if (hasStructuralFailure(r) || incompleteCoverage(d, rig, r))
			throw new Error(
				`${d.spec.id}: a batch has missing or malformed frames. Try again before keeping this item.`
			);
		if (d.calls.some((c) => recOf(c.recId)?.state !== 'done'))
			throw new Error(`${d.spec.id}: not all calls are done`);
	}
	if (!r.qa) throw new Error(`${d.spec.id}: not all calls are done`);
	const pad = padOf(requireSlot(ctx.rec.manifest, d.spec.slot), d.spec.method, rig.cell);
	const { provenance, index } = draftProvenance(d);
	// Fresh cells, remapped from the review's own call numbers: the review stays intact for a Keep retried after a failed save.
	const qa = {
		...acceptQa(r.qa.qa),
		cells: Object.fromEntries(
			Object.entries(r.qa.qa.cells).map(([key, cell]) => [
				key,
				cell.provenance === undefined ? cell : { ...cell, provenance: index.get(cell.provenance) }
			])
		) as typeof r.qa.qa.cells
	};
	// Missing frames are not a passing check.
	if (available) qa.status = 'accepted';
	const dress = d.calls[0].kind === 'dress',
		dressed: Partial<Record<DirectionName, Img>> = {};
	// Keyframes are kept only where their cell and frame size are proven: a kept draft can lack some.
	const keepDressed = async (k: number, kept: (key: string) => boolean) => {
		for (const [key, out] of identifiedCells(d, k)) {
			if (!kept(key)) continue;
			const im = await img(out.sha);
			if (im.w === rig.cell.w + 2 * pad && im.h === rig.cell.h + 2 * pad)
				dressed[key.split('/')[1] as DirectionName] = im;
		}
	};
	if (dress) {
		for (const [k, c] of d.calls.entries())
			if (c.kind === 'dress') await keepDressed(k, () => true);
	}
	// Preserve the original chroma outputs before setup too. Later skeleton estimates can reuse them only if the
	// selected standing body frames still exactly match the registered references.
	else if (d.spec.standing && d.spec.key !== 'none')
		for (const k of d.calls.keys())
			await keepDressed(k, (key) => key.startsWith(`${d.spec.standing}/`));
	// A kept draft saves only the moves and views it has frames in; the others stay missing coverage like any gap.
	const covered = [...new Set(r.cells.map((c) => c.key))];
	const has = (anim: string, dir?: string) =>
		covered.some((key) => key.startsWith(dir ? `${anim}/${dir}/` : `${anim}/`));
	const keptAnims = available ? d.spec.anims.filter((anim) => has(anim)) : d.spec.anims;
	const spec = available
		? {
				...d.spec,
				anims: keptAnims,
				clipDirs: Object.fromEntries(
					keptAnims.map((anim) => [
						anim,
						(d.spec.clipDirs?.[anim] ?? d.spec.dirs).filter((dir) => has(anim, dir))
					])
				)
			}
		: d.spec;
	const { item, images } = await buildItem({
		spec: JSON.parse(
			JSON.stringify({ ...spec, slotConfig: requireSlot(ctx.rec.manifest, d.spec.slot) })
		) as ItemSpec,
		rig,
		// A cut hides body pixels under the item, so a kept draft has none where it has no item pixels.
		cells: available ? r.cells.map((c) => (c.area ? c : { ...c, cut: undefined })) : r.cells,
		route: d.spec.key,
		qa,
		...(Object.keys(dressed).length ? { dressed } : {}),
		pad,
		provenance,
		anchorCell: d.calls.length > 1 ? d.calls[0].cells[0] : undefined
	});
	// Accepted keyframe issues, and the dark-patch review notes, stay with the saved item (2026-11-07 session counter-review F2).
	// Malformed frames are not design issues: a kept draft lists them as missing coverage instead.
	const darkNotes = r.qa.warnings.filter((why) => why.startsWith('D1 '));
	const designWarnings = [
		...new Set([
			...[...r.g1.values()]
				.flatMap((why) => why.split(/;\s*/))
				.filter((why) => !structuralReason(why)),
			...darkNotes
		])
	];
	if (designWarnings.length) {
		item.designWarnings = designWarnings;
		if (item.qa) item.qa.status = 'accepted';
	}
	// A move published since ctx was read (addBodyClip rebases only items already stored) changed baseHash. When every body cell
	// this item was made against is unchanged (moves were only added), it still fits and moves to the new hash, as addBodyClip
	// would have moved it; a replaced or recolored cell means it may not, so it is refused rather than saved for another body.
	const made = ctx.rec.manifest,
		anims = made.rig.animations.map((a) => a.id);
	const slot = specSlot(d.spec, made);
	await saveItem(d.rigId, item, images, [...slotLadder(made.rig), slot], (cur) => {
		const current = specSlot({ slot: slot.id, slotConfig: slot }, cur.manifest);
		if (current.z !== slot.z || current.bgZ !== slot.bgZ)
			throw new Error(
				`${d.spec.name}: the category depth changed while this item was being kept. Nothing was saved; try again.`
			);
		if (cur.manifest.rig.baseHash === item.baseHash) return;
		if (bodyCells(cur.manifest, anims) !== bodyCells(made, anims))
			throw new Error(
				`${d.spec.name}: the character's body changed while this item was being made, so it was not saved. Make it again for the current body.`
			);
		item.baseHash = cur.manifest.rig.baseHash;
	});
	d.acceptedAt = new Date().toISOString();
	return { item, cells: images.size };
}

// ---------- new clips on accepted items (architecture §4.1: "adding a clip later = one pose call per item-direction") ----------

/** Reuse the bought standing design on selected frozen frames, without requiring a skeleton or redrawing the body. */
export async function animateAnchoredItem(
	ctx: RigCtx,
	item: Item,
	anim: string,
	dirs: DirectionName[],
	seed: number,
	onCall: () => void = () => {},
	options: { savedOnly?: boolean; plannedDirs?: DirectionName[]; activityScope?: string } = {}
) {
	const rig = ctx.rec.manifest.rig;
	const calls = planAnchoredMove(rig, item, anim, options.plannedDirs ?? dirs)
		.map((call, i) => ({
			...call,
			seed: seedOf(`${item.id}/${anim}/${call.cells.join(',')}/${seed}/${i}`),
			old: [],
			rerolls: 0
		}))
		.filter((call) => dirs.includes(call.reference.cell.split('/')[1] as DirectionName));
	if (!calls.length) throw new Error('Choose missing item frames before generating.');
	for (const call of calls)
		for (const im of [
			ctx.project.images.get(call.reference.image),
			...call.cells.map((key) => baseCell(ctx, key))
		]) {
			if (!im || im.w !== rig.cell.w || im.h !== rig.cell.h)
				throw new Error(
					'The saved standing design and move frames must use the same frame size. No generation was requested.'
				);
		}
	const draft: Draft = {
		rigId: ctx.rec.id,
		activityScope: options.activityScope,
		spec: {
			id: item.id,
			name: item.name,
			prompt: item.prompt,
			slot: item.slot,
			slotConfig: structuredClone(requireSlot(ctx.rec.manifest, item.slot)),
			key: item.key!,
			method: 'anchor',
			anims: [anim],
			dirs
		},
		calls,
		log: []
	};
	if (options.savedOnly)
		await Promise.all(
			draft.calls.map(async (call, k) => {
				call.recId = (await submitOrSaved(await callRequest(draft, k, ctx), {}, true)).id;
			})
		);
	const standingPalettes = new Map(
		dirs.map((dir) => {
			const standing = item.layers.flatMap((layer) => {
				const hash = layer.cells?.[item.standing!]?.[dir]?.[0],
					image = hash && ctx.project.images.get(hash);
				return image ? [image] : [];
			});
			const counts = colorCounts(standing);
			// A dense palette does not provide discrete shade witnesses and can be expensive to compare per frame.
			return [dir, counts.size <= 256 ? [...counts.keys()] : []];
		})
	);
	const whole = options.savedOnly
		? await evaluateItem(draft, ctx, standingPalettes)
		: await runItem(draft, ctx, { standingPalettes });
	// Views that finished are paid for: publish them even when another view failed, so a retry buys only the missing ones.
	// Each call is anchored on the standing design alone, so a view's finished calls are kept when a later one failed.
	const failedCallSet = new Set(whole ? failedCalls(draft, whole) : draft.calls.keys());
	const dirOfCall = (c: CallState) => c.reference!.cell.split('/')[1] as DirectionName;
	const good = (c: CallState, k: number) =>
		!!whole?.qa && !failedCallSet.has(k) && recOf(c.recId)?.state === 'done';
	const failedDirs = new Set(
		dirs.filter((dir) => draft.calls.some((c, k) => dirOfCall(c) === dir && !good(c, k)))
	);
	const doneDirs = dirs.filter((dir) => !failedDirs.has(dir));
	const partialDirs = [...failedDirs].filter((dir) =>
		draft.calls.some((c, k) => dirOfCall(c) === dir && good(c, k))
	);
	const kept = new Set(
		draft.calls.flatMap((c, k) =>
			partialDirs.includes(dirOfCall(c)) && !good(c, k) ? c.cells : []
		)
	);
	const detail =
		draft.log.at(-1) ?? 'Equipment frames could not finish. Existing artwork was kept.';
	const detailError = () =>
		typeof detail === 'string'
			? (localizedAutomaticRepairError(detail) ?? new Error(detail))
			: loggedError(detail);
	const savedDirs = [...doneDirs, ...partialDirs];
	if (!savedDirs.length) throw detailError();
	const finished: Draft = {
		...draft,
		spec: { ...draft.spec, dirs: savedDirs },
		calls: draft.calls.filter((c, k) => savedDirs.includes(dirOfCall(c)) && good(c, k))
	};
	const result =
		doneDirs.length === dirs.length ? whole : await evaluateItem(finished, ctx, standingPalettes);
	const covered = new Set(result?.cells.map((c) => c.key));
	if (
		!result?.qa ||
		hasStructuralFailure(result) ||
		finished.calls.some((c) => c.cells.some((key) => !covered.has(key)))
	)
		throw detailError();
	dirs = savedDirs;
	const missed = [...failedDirs];
	let materials = ctx.rec.manifest.materials.filter(
		(m) => m.owner === item.id && item.materials.includes(m.id)
	);
	const needsMaterials = !item.materials.length;
	if (needsMaterials) {
		// A standing item can be animated directly from its details before the player ever equips it.
		const standing = {
			...item,
			layers: item.layers.map((l) => ({
				...l,
				cells: { [item.standing!]: l.cells?.[item.standing!] ?? {} }
			}))
		};
		const reference = { ...ctx.project, manifest: { ...ctx.rec.manifest } };
		deriveMaterials(reference, [standing]);
		materials = reference.manifest.materials.filter((m) => m.owner === item.id);
	}
	const owned = new Set(materials.flatMap((m) => m.ramp.map(fromHex)));
	const matchers = new Map(
		[...standingPalettes].map(([dir, colors]) => [
			dir,
			standingDyeMatcher(
				new Set(colors),
				owned,
				result.cells.filter((c) => c.key.split('/')[1] === dir).map((c) => c.layer)
			)
		])
	);
	const cells = result.cells.map((c) => ({
		...c,
		layer: matchers.get(c.key.split('/')[1] as DirectionName)!(c.layer)
	}));
	await mergeClip(
		ctx,
		item,
		anim,
		dirs,
		cells,
		draftProvenance(finished).provenance,
		result.qa,
		0,
		needsMaterials ? materials : undefined,
		kept
	);
	dirs.forEach(onCall);
	if (missed.length)
		throw new PartialMoveError(
			detailError(),
			doneDirs,
			partialDirs.map((dir) => ({
				dir,
				frames: finished.calls
					.filter((c) => dirOfCall(c) === dir)
					.flatMap((c) => c.cells.map((key) => Number(key.split('/')[2])))
					.sort((a, b) => a - b)
			}))
		);
}
const seedOf = (s: string) =>
	1 + ([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 2_000_000);

/** Some directions of an item move failed after the others were saved. */
export class PartialMoveError extends Error {
	constructor(
		/** Why the other views stopped; a LocalizedError keeps its translation. */
		readonly reason: string | Error,
		readonly savedDirs: DirectionName[],
		/** Directions saved only in part: the frames their finished batches made. The rest stay missing. */
		readonly savedFrames: { dir: DirectionName; frames: number[] }[] = []
	) {
		super(`${errorText(reason)} The finished views were saved.`);
	}
}

/** Suspicious imported joints never stop a fit on valid coordinates. They are named for review and counted on the clips
 *  they were posed in, so saved checks keep them until those frames are replaced. */
function discloseJoints(
	q: QaResult,
	rig: Rig,
	calls: readonly { kind?: CallKind; cells: string[] }[]
) {
	const cells = suspiciousPoseCells(rig, calls).filter((key) => q.qa.cells[key as CellKey]);
	if (!cells.length) return;
	q.warnings.push(...poseFitIssues(rig, calls));
	for (const key of cells) {
		const clip = q.qa.clips[key.split('/').slice(0, 2).join('/')];
		q.qa.cells[key as CellKey].jointReview = true;
		if (!clip) continue;
		clip.jointReviewFrames = (clip.jointReviewFrames ?? 0) + 1;
		if (clip.status === 'pass') clip.status = 'warn';
	}
	q.qa.jointReviewFrames = (q.qa.jointReviewFrames ?? 0) + cells.length;
	if (q.qa.status === 'pass') q.qa.status = 'warn';
}
/** A paid item request that ended without results; a lost one may still have run and charged. */
function requestStopped(
	item: Item,
	r: JobRec,
	text: string,
	key: 'itemRoute.errors.poseStopped' | 'itemRoute.errors.gridStopped'
) {
	return r.state === 'lost'
		? new LocalizedError(text, 'itemRoute.errors.requestLost', { item: item.name })
		: new LocalizedError(text, key, {
				item: item.name,
				state: message(`activity.state.${r.state}`)
			});
}
export const SAVED_FRAMES_UNAVAILABLE =
	'Completed frames matching the current body and equipment are unavailable. No generation was requested.';
export const INVALID_ITEM_GRID = 'PixelLab returned an unusable item grid.';
/** Enqueue a paid request, or with `savedOnly` reattach the completed record of the identical request and never send one. */
async function submitOrSaved(
	req: Req,
	meta: Parameters<typeof queue.enqueue>[1],
	savedOnly?: boolean
): Promise<JobRec> {
	if (!savedOnly) return queue.enqueue(req, meta);
	const { requestHash } = await requestIdentity(req),
		saved = jobs.findLast((r) => r.requestHash === requestHash && r.state === 'done');
	if (!saved)
		throw new LocalizedError(SAVED_FRAMES_UNAVAILABLE, 'itemRoute.errors.savedFramesUnavailable');
	return saved;
}

/** Pose each planned clip-direction batch once, retaining its checks for explicit player review.
 * Stable request seeds reattach to accepted jobs after reload; only a new player request changes moveSeed. */
export async function poseItemClip(
	ctx: RigCtx,
	item: Item,
	anim: string,
	onCall: () => void = () => {},
	moveSeed?: number,
	selectedDirs?: DirectionName[],
	activityScope?: string,
	savedOnly = false,
	title?: ItemViewTitle
): Promise<QaResult> {
	const { rig } = ctx.rec.manifest,
		slot = requireSlot(ctx.rec.manifest, item.slot),
		key = item.key!,
		pad = ((item.layers[0].cell?.w ?? rig.cell.w) - rig.cell.w) / 2;
	const available = rig.directions
		.filter((d) => !d.mirrorOf && item.dressed?.[d.id])
		.map((d) => d.id);
	if (
		selectedDirs &&
		(!selectedDirs.length ||
			new Set(selectedDirs).size !== selectedDirs.length ||
			selectedDirs.some((d) => !available.includes(d)))
	)
		throw new Error('Choose supported independently drawn equipment directions.');
	const dirs = selectedDirs ?? available;
	const minimumTier = itemPlanMinimumTier(
		itemPosePlan(
			rig,
			{ ...item, slotConfig: slot },
			anim,
			rig.animations.find((animation) => animation.id === anim)!.cells,
			dirs
		),
		item.layers[0]?.cell ?? rig.cell,
		true
	);
	const keys: Partial<Record<DirectionName, Img>> = {};
	const { keys: k0, cuts, hidden } = await dressedKeys(ctx, item, pad);
	const bodies = referenceBodies(rig, ctx.project.images);
	Object.assign(keys, k0);
	const posed: { kind: 'pose'; cells: string[] }[] = [];
	const perDir = await Promise.allSettled(
		dirs.map(async (dir, k) => {
			const allPoses = clipKeypoints(rig, anim, dir),
				rest = rig.rest?.[dir]?.keypoints;
			if (!allPoses || !rest) throw new Error(`${anim}/${dir}: no stored keypoints`);
			const collected: CellOut[] = [],
				prov: Provenance[] = [];
			const batches = poseBatches(allPoses.length);
			for (const [b, { start, count }] of batches.entries()) {
				try {
					const poses = allPoses.slice(start, start + count),
						cells = poses.map((_, i) => `${anim}/${dir}/${start + i}`);
					const seed = seedOf(
						`${item.id}/${anim}/${dir}/0${allPoses.length > 15 ? `/batch-${start}` : ''}${moveSeed ? `/${moveSeed}` : ''}`
					);
					if (
						frozenGrid(
							rig,
							{
								slot: item.slot,
								slotConfig: structuredClone(requireSlot(ctx.rec.manifest, item.slot)),
								key
							},
							cells
						)
					) {
						const g = await gridItemClip(
							ctx,
							item,
							anim,
							dir,
							k,
							keys,
							cuts,
							seed,
							cells,
							activityScope,
							savedOnly,
							undefined,
							title
						);
						if ('blocked' in g)
							throw new Error(
								`The planned frozen-frame request is unavailable: ${g.blocked}. Existing artwork was kept.`
							);
						onCall();
						prov.push(g.prov);
						collected.push(...g.cells);
						continue;
					}
					posed.push({ kind: 'pose', cells });
					const req = itemRoute.pose({
						keyframePngB64: await blobB64(item.dressed![dir]!.slice(7)),
						rest,
						poses,
						item: item.prompt,
						slot: requireSlot(ctx.rec.manifest, item.slot),
						key,
						anim,
						dir,
						seed,
						cell: rig.cell,
						pad,
						view: rig.view
					});
					const rec = await submitOrSaved(
						req,
						{
							label: `pose ${item.name} · ${anim} ${dir}`,
							...(title ? { title: title(anim, dir) } : {}),
							tag: 'studio-move',
							activityScope,
							minimumTier
						},
						savedOnly
					);
					const r = terminal(rec) ? rec : await settled(rec.id);
					onCall();
					if (r.state !== 'done')
						throw requestStopped(
							item,
							r,
							`${item.name} ${anim} ${dir}: ${r.state} ${r.error ?? ''}`,
							'itemRoute.errors.poseStopped'
						);
					const outputs = outputsOf(r);
					if (outputs.length !== Math.max(3, cells.length))
						throw new LocalizedError(
							`${item.name} ${anim} ${dir}: PixelLab returned missing or malformed frames. No automatic retry was made.`,
							'itemRoute.errors.poseFramesMalformed',
							{ item: item.name }
						);
					const outs = unrotate(
						outputs,
						f0Last(requireSlot(ctx.rec.manifest, item.slot), rest, paddedPoses(poses), rig.cell)
					).slice(0, cells.length);
					const images = await Promise.all(outs.map((o) => img(o.sha)));
					if (images.some((im) => im.w !== rig.cell.w + 2 * pad || im.h !== rig.cell.h + 2 * pad))
						throw new LocalizedError(
							`${item.name} ${anim} ${dir}: PixelLab returned the wrong frame size. No automatic retry was made.`,
							'itemRoute.errors.poseFrameSize',
							{ item: item.name }
						);
					const candidate = cells.map((c, i) =>
						extractCell({
							key: c,
							call: k,
							base: padImg(baseCell(ctx, c), pad),
							out: images[i],
							route: key,
							band: bandOf(
								requireSlot(ctx.rec.manifest, item.slot),
								pad ? undefined : skelOf(ctx, c),
								rig.cell.h + 2 * pad
							),
							posed: true,
							clip: slot.band,
							held: slot.class === 'held',
							pad,
							cut: cutFor(ctx, item.slot, c, true, cuts)
						})
					);
					postProcess(rig, slot, candidate, keys, pad);
					prov.push(toProv(r, { cells, seed, rerolls: 0, old: [] }));
					collected.push(...candidate);
				} catch (error) {
					// The direction's finished batches are paid and verified: they are saved, and the frames of this batch and the
					// later ones keep their current art (missing on a new move). Nothing more is bought for this direction.
					if (!collected.length) throw error;
					const kept = batches
						.slice(b)
						.flatMap(({ start, count }) =>
							Array.from({ length: count }, (_, i) => `${anim}/${dir}/${start + i}`)
						);
					return { collected, prov, failed: error as unknown, kept };
				}
			}
			return { collected, prov, failed: undefined, kept: [] as string[] };
		})
	);
	// Directions that finished are paid for: save them even when another direction failed, so a retry that skips complete
	// directions (addMove without replace) requests only the missing ones instead of buying them again (2026-11-07 audit).
	// A direction stopped after a finished batch saves that batch but is not complete, so a retry poses it again.
	const doneDirs = dirs.filter(
			(_, i) =>
				perDir[i].status === 'fulfilled' &&
				!(perDir[i] as { value: { kept: string[] } }).value.kept.length
		),
		failures = perDir.flatMap((r) =>
			r.status === 'rejected' ? [r.reason] : r.value.kept.length ? [r.value.failed] : []
		);
	const savedDirs = dirs.filter((_, i) => perDir[i].status === 'fulfilled');
	const kept = new Set(perDir.flatMap((r) => (r.status === 'fulfilled' ? r.value.kept : [])));
	const done = perDir.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
		cells = done.flatMap((r) => r.collected),
		prov = done.flatMap((r) => r.prov);
	if (failures.length && !cells.length) throw failures[0];
	if (!cells.length)
		throw new LocalizedError(
			`${item.name}: PixelLab returned no usable ${anim} frames`,
			'itemRoute.errors.noUsableFrames',
			{ item: item.name }
		);
	const q = withH4(
		itemQa(rig, slot, key, cells, 0, GATES.keyOutsidePosed, pad, hidden),
		slot,
		cells,
		keys,
		rig,
		bodies,
		item.prompt
	);
	discloseJoints(q, rig, posed);
	const first = failures.length ? errorText(failures[0]) : '';
	try {
		await mergeClip(ctx, item, anim, savedDirs, cells, prov, q, pad, undefined, kept);
	} catch (error) {
		// The save error leads and keeps its code: the Studio offers free saved-frame recovery on a save conflict.
		throw failures.length
			? error instanceof LocalizedError
				? error.translation.key === 'itemRoute.errors.itemMoveSaveConflict'
					? new LocalizedError(
							`${error.message} ${first}`,
							'itemRoute.errors.itemMoveSaveConflictAlso',
							{ reason: errorMessage(failures[0]) }
						)
					: new LocalizedError(
							`${error.message} ${first}`,
							error.translation.key,
							error.translation.vars
						)
				: new Error(`${errorText(error)} ${first}`)
			: error;
	}
	if (failures.length)
		throw new PartialMoveError(
			failures[0] instanceof Error ? failures[0] : String(failures[0]),
			doneDirs,
			perDir.flatMap((r, i) =>
				r.status === 'fulfilled' && r.value.kept.length
					? [
							{
								dir: dirs[i],
								frames: r.value.collected.map((c) => Number(c.key.split('/')[2]))
							}
						]
					: []
			)
		);
	return q;
}
/** Write a clip's cells (the given directions only) into an accepted item, with their provenance and QA. */
export const ITEM_MOVE_SAVE_CONFLICT =
	'This character or item changed while its frames were generating. Existing artwork was kept; finished frames stay in Activity.';
function clipArtwork(item: Item) {
	const { materials: _materials, hides: _hides, ...artwork } = itemContent(item);
	return stableStringify(artwork);
}

export async function mergeClip(
	ctx: RigCtx,
	item: Item,
	anim: string,
	dirs: DirectionName[],
	cells: CellOut[],
	prov: Provenance[],
	q: QaResult,
	pad = 0,
	standingMaterials?: Material[],
	/** Frames of these directions a stopped batch left: they keep their current art, cut and checks. */
	kept?: ReadonlySet<string>
) {
	await publishClip(
		ctx.rec.id,
		await prepareClip(ctx, item, anim, dirs, cells, prov, q, pad, undefined, kept),
		standingMaterials
	);
}

async function prepareClip(
	ctx: RigCtx,
	item: Item,
	anim: string,
	dirs: DirectionName[],
	cells: CellOut[],
	prov: Provenance[],
	q: QaResult,
	pad: number,
	/** Frames taken from artwork an earlier call already paid for: the item's record of that call, by frame. */
	reused?: ReadonlyMap<string, number>,
	/** Frames a stopped repair did not replace: they keep their current art, cut and checks. */
	kept: ReadonlySet<string> = new Set()
) {
	const { rig } = ctx.rec.manifest,
		key = item.key!;
	const version = rigArtworkVersion(rig, ctx.rec.character),
		originalItem = clipArtwork(item);
	const count = rig.animations.find((a) => a.id === anim)?.cells;
	const expected = new Set(
		dirs
			.flatMap((d) => Array.from({ length: count ?? 0 }, (_, i) => `${anim}/${d}/${i}`))
			.filter((k) => !kept.has(k))
	);
	if (
		!count ||
		!expected.size ||
		cells.length !== expected.size ||
		new Set(cells.map((c) => c.key)).size !== expected.size ||
		cells.some((c) => !expected.has(c.key)) ||
		Object.keys(q.qa.cells).length !== expected.size ||
		Object.keys(q.qa.cells).some((k) => !expected.has(k)) ||
		dirs.some((d) => !q.qa.clips[`${anim}/${d}`]) ||
		Object.keys(q.qa.clips).length !== new Set(dirs).size
	)
		throw new Error('Move QA requires every frame of each replaced direction');
	const spec: ItemSpec = {
		id: item.id,
		name: item.name,
		slot: item.slot,
		slotConfig: structuredClone(requireSlot(ctx.rec.manifest, item.slot)),
		prompt: item.prompt,
		key,
		anims: [anim],
		dirs,
		method: 'skel'
	};
	const built = await buildItem({ spec, rig, cells, route: key, provenance: [], qa: q.qa, pad });
	const out: Item = structuredClone(item);
	out.coverage = [
		...new Set([
			...(item.coverage ?? []).filter((key) => !expected.has(key)),
			...built.item.coverage!
		])
	];
	// A kept frame takes its current entry; every other frame of the replaced directions takes the new one.
	const merge = <T>(row: (T | null)[] | undefined, old: (T | null)[] | undefined, d: string) =>
		(row ?? Array<T | null>(count).fill(null)).map((entry, i) =>
			kept.has(`${anim}/${d}/${i}`) ? (old?.[i] ?? null) : entry
		);
	out.layers.forEach((l, j) => {
		const rows = built.item.layers[j].cells![anim];
		l.cells = {
			...l.cells,
			[anim]: {
				...l.cells?.[anim],
				...Object.fromEntries(
					Object.entries(rows).map(([d, row]) => [
						d,
						merge(row, item.layers[j].cells?.[anim]?.[d as DirectionName], d)
					])
				)
			}
		};
	});
	dropCut(out, anim, dirs); // replaced directions take their new cut, never a stale one
	for (const d of dirs) {
		const c = kept.size
			? merge(built.item.baseCut?.[anim]?.[d], item.baseCut?.[anim]?.[d], d)
			: built.item.baseCut?.[anim]?.[d];
		if (c?.some((entry) => entry)) ((out.baseCut ??= {})[anim] ??= {})[d] = c;
	}
	// Per-direction call numbers are local to this move; records arrive in completion order (and may be grid fallbacks).
	// Resolve the selected record by its produced keys, then offset into the item's full provenance history.
	const source = new Map(
		prov.flatMap((p, i) => p.produced.map((k) => [k, item.provenance.length + i] as const))
	);
	const qaCells: Record<string, CellQa> = Object.fromEntries(
		Object.entries(q.qa.cells).map(([k, c]) => {
			const provenance = source.get(k as keyof typeof q.qa.cells) ?? reused?.get(k);
			if (provenance == null) throw new Error(`No source record for ${k}`);
			return [k, { ...c, provenance }];
		})
	);
	out.provenance = [...out.provenance, ...prov];
	// Kept frames keep their checks, and their direction is no better than it was, since its summary covers only new frames.
	for (const k of kept) {
		const old = item.qa?.cells[k as CellKey];
		if (old) qaCells[k] = old;
	}
	const next = structuredClone(q.qa);
	if (kept.size)
		for (const d of dirs) {
			const before = item.qa?.clips[`${anim}/${d}`]?.status,
				clip = next.clips[`${anim}/${d}`];
			if (before && STATUS_ORDER.indexOf(before) > STATUS_ORDER.indexOf(clip.status))
				clip.status = before;
			// The count covers kept and new frames alike, from each frame's own finding.
			const joints = Object.entries(qaCells).filter(
				([key, cell]) => key.startsWith(`${anim}/${d}/`) && cell.jointReview
			).length;
			if (joints) clip.jointReviewFrames = joints;
			else delete clip.jointReviewFrames;
		}
	out.qa = mergeQa(item, next, qaCells);
	return { out, images: built.images, originalItem, version, ladder: slotLadder(rig) };
}
/** QA statuses from best to worst. */
const STATUS_ORDER = ['pass', 'accepted', 'warn', 'fail'];

type PreparedClip = Awaited<ReturnType<typeof prepareClip>>;
export type RepairReview = {
	clip: PreparedClip;
	findings: string[];
	current: Img[];
	replacement: Img[];
	/** Frame indices a stopped batch left with their current art, when the finished batches are offered alone. */
	kept?: number[];
	/** Why that batch stopped (a failed request or the plan refusing it), shown with the review. */
	stoppedBy?: Message | string;
};

async function publishClip(
	projectId: string,
	prepared: PreparedClip,
	standingMaterials?: Material[]
) {
	const { images, originalItem, version, ladder } = prepared;
	const out = structuredClone(prepared.out);
	await saveItem(projectId, out, images, ladder, (current) => {
		const currentItem = current.manifest.items.find((i) => i.id === out.id);
		if (
			!currentItem ||
			rigArtworkVersion(current.manifest.rig, current.character) !== version ||
			clipArtwork(currentItem) !== originalItem
		)
			throw new LocalizedError(ITEM_MOVE_SAVE_CONFLICT, 'itemRoute.errors.itemMoveSaveConflict');
		// Outfit autosave owns these fields, including when it runs while a paid edit is pending.
		out.materials = currentItem.materials;
		if (!out.materials.length && standingMaterials?.length) {
			current.manifest.materials = [
				...current.manifest.materials.filter((m) => m.owner !== out.id),
				...standingMaterials
			];
			out.materials = standingMaterials.map((m) => m.id);
		}
		if (currentItem.hides === undefined) delete out.hides;
		else out.hides = currentItem.hides;
	});
}

/** The item's record of the paid call that drew its standing design for `dir`. */
const designCall = (item: Item, dir: DirectionName): number | undefined => {
	const at = item.provenance.findIndex(
		(p) => !p.replaced && p.produced.includes(restKey(dir) as CellKey)
	);
	return at < 0 ? undefined : at;
};
/** Standing frames an item lacks although its saved design for that view is stored. A single-frame move whose body is the
 *  registered standing view takes the design itself, as when the item was made (evaluateItem), so they need no call. A copy
 *  can lack one: it takes only the views whose body frames matched its source. */
export function restorableViews(m: Manifest, item: Item): CellKey[] {
	const { rig } = m,
		body = m.items.find((i) => i.id === rig.baseItem)?.layers[0].cells,
		covered = new Set<string>(item.coverage);
	if (
		item.id === rig.baseItem ||
		item.status !== 'accepted' ||
		item.route !== 'skeleton-pose' ||
		!item.key ||
		item.baseHash !== rig.baseHash ||
		item.refit ||
		item.unfitted
	)
		return [];
	return rig.animations.flatMap((a) =>
		rig.directions
			.filter(
				(d) =>
					!d.mirrorOf &&
					!!item.dressed?.[d.id] &&
					!covered.has(cellKey(a.id, d.id, 0)) &&
					reusesStanding(rig, item, a.id, d.id) &&
					matchesStanding(rig, a, d.id, body?.[a.id]?.[d.id]?.[0]) &&
					designCall(item, d.id) !== undefined
			)
			.map((d) => cellKey(a.id, d.id, 0) as CellKey)
	);
}
/** Free: rebuild those frames from the saved designs and save them with their checks. Returns the frames restored. */
export async function restoreStandingViews(projectId: string, itemId: string): Promise<CellKey[]> {
	const ctx = await loadProject(projectId),
		{ rig } = ctx.rec.manifest,
		saved = ctx.rec.manifest.items.find((i) => i.id === itemId),
		views = saved ? restorableViews(ctx.rec.manifest, saved) : [];
	if (!saved || !views.length) return [];
	const slot = requireSlot(ctx.rec.manifest, saved.slot),
		pad = ((saved.layers[0].cell?.w ?? rig.cell.w) - rig.cell.w) / 2;
	const { keys, cuts, hidden } = await dressedKeys(ctx, saved, pad),
		bodies = referenceBodies(rig, ctx.project.images);
	let item = saved;
	for (const anim of new Set(views.map((k) => k.split('/')[0]))) {
		const dirs = views
			.filter((k) => k.split('/')[0] === anim)
			.map((k) => k.split('/')[1] as DirectionName);
		const cells = await Promise.all(
			dirs.map(async (dir, k) => {
				const c = cellKey(anim, dir, 0);
				return extractCell({
					key: c,
					call: k,
					base: padImg(baseCell(ctx, c), pad),
					out: await img(saved.dressed![dir]!.slice(7)),
					route: saved.key!,
					band: bandOf(slot, pad ? undefined : skelOf(ctx, c), rig.cell.h + 2 * pad),
					posed: true,
					clip: slot.band,
					held: slot.class === 'held',
					pad,
					cut: cutFor(ctx, saved.slot, c, true, cuts)
				});
			})
		);
		postProcess(rig, slot, cells, keys, pad);
		const q = withH4(
			itemQa(rig, slot, saved.key!, cells, 0, GATES.keyOutsidePosed, pad, hidden),
			slot,
			cells,
			keys,
			rig,
			bodies,
			saved.prompt
		);
		const clip = await prepareClip(
			ctx,
			item,
			anim,
			dirs,
			cells,
			[],
			q,
			pad,
			new Map(dirs.map((dir) => [cellKey(anim, dir, 0), designCall(saved, dir)!]))
		);
		await publishClip(projectId, clip);
		item = clip.out;
	}
	return views;
}

export async function repairAlreadyApplied(projectId: string, review: RepairReview) {
	const { rec } = await loadProject(projectId);
	const current = rec.manifest.items.find((item) => item.id === review.clip.out.id);
	return !!current && clipArtwork(current) === clipArtwork(review.clip.out);
}

export async function applyRepairReview(projectId: string, review: RepairReview) {
	if (await repairAlreadyApplied(projectId, review)) return;
	await publishClip(projectId, review.clip);
}
/** Free acknowledgment of the exact artwork and warnings the player reviewed, never a new generation. */
/** The moves an item is missing frames in (coverageGaps), each once, in rig order. */
export const gapMoves = (m: Manifest, item: Item) => [
	...new Set(coverageGaps(m, item).map((gap) => gap.split('/')[0]))
];
/** Whether the item has frames in any move besides these (retainItemQa keeps its checks only then). */
const keepsFramesWithout = (item: Item, moves: readonly string[]) =>
	item.layers.some((layer) =>
		Object.entries(layer.cells ?? {}).some(
			([move, dirs]) => !moves.includes(move) && Object.keys(dirs).length > 0
		)
	);
/** Why an item cannot be kept without these moves, in the user's words, or undefined when it can: never without the
 *  standing move it is designed and posed from (the rig's standing move when the item names none), or the move of its
 *  anchor frame, which every other move is drawn from, and never when no frames would be left. Those gaps need the paid
 *  redraw instead. */
export function keepWithoutRefusal(
	m: Manifest,
	item: Item,
	moves: readonly string[]
): LocalizedError | undefined {
	const designed = item.standing ?? standingMove(m, m.rig.directions[0]?.id ?? 'south');
	if (
		moves.length &&
		!(designed && moves.includes(designed)) &&
		!(item.anchorCell && moves.includes(item.anchorCell.split('/')[0])) &&
		keepsFramesWithout(item, moves)
	)
		return undefined;
	return keepsFramesWithout(item, moves)
		? keepWithoutStandingError()
		: new LocalizedError(
				'This item has no complete move to keep. Make the missing frames instead.',
				'itemRoute.errors.keepWithoutNothingLeft'
			);
}
function keepWithoutStandingError() {
	return new LocalizedError(
		'This item is missing frames in the move it is designed from, so it cannot be kept without it. Show that move and use Repair item or Redraw item if offered, or make the item again.',
		'itemRoute.errors.keepWithoutStanding'
	);
}
export const keepableWithout = (m: Manifest, item: Item, moves: readonly string[]) =>
	!keepWithoutRefusal(m, item, moves);
/** The item without these moves (retainItemMoves: frames, coverage, pending cells, hidden body pixels, refit notes and
 *  checks, with the summary recomputed), so it is hidden there and listed as missing, to make later at its own price.
 *  Nothing is added or redrawn. */
function withoutMoves(m: Manifest, item: Item, moves: readonly string[]): Item {
	const out = structuredClone(item);
	retainItemMoves(
		out,
		new Set(m.rig.animations.map((move) => move.id).filter((id) => !moves.includes(id)))
	);
	return out;
}
/** Accept a saved item's reviewed checks as they are. With `keepWithout`, the moves it is missing frames in (exactly the
 *  reviewed gaps) are dropped instead, so an item with gaps can be kept from its complete moves. */
export async function acceptItemReview(
	projectId: string,
	itemId: string,
	reviewed: Item,
	keepWithout?: readonly string[]
): Promise<void> {
	const ctx = await loadProject(projectId),
		item = ctx.rec.manifest.items.find((i) => i.id === itemId);
	const expected = stableStringify(itemContent(reviewed)),
		version = rigArtworkVersion(ctx.rec.manifest.rig, ctx.rec.character);
	if (
		!item ||
		item.id !== reviewed.id ||
		item.slot === 'body' ||
		item.status !== 'accepted' ||
		!item.qa ||
		item.baseHash !== ctx.rec.manifest.rig.baseHash ||
		stableStringify(itemContent(item)) !== expected ||
		(keepWithout &&
			stableStringify(gapMoves(ctx.rec.manifest, item)) !== stableStringify(keepWithout))
	) {
		throw itemReviewChangedError();
	}
	const refusal = keepWithout && keepWithoutRefusal(ctx.rec.manifest, item, keepWithout);
	if (refusal) throw refusal;
	const kept = keepWithout?.length ? withoutMoves(ctx.rec.manifest, item, keepWithout) : item;
	const accepted = { ...kept, qa: { ...acceptQa(kept.qa!), status: 'accepted' as const } };
	await saveItem(projectId, accepted, new Map(), [], (current) => {
		const currentItem = current.manifest.items.find((i) => i.id === itemId);
		if (
			rigArtworkVersion(current.manifest.rig, current.character) !== version ||
			!currentItem ||
			stableStringify(itemContent(currentItem)) !== expected
		) {
			throw itemReviewChangedError();
		}
	});
}

function itemReviewChangedError() {
	return new LocalizedError(
		'This item or its checks changed. Reopen it before accepting its current artwork.',
		'itemRoute.errors.reviewChanged'
	);
}
/** Prepare a bounded frozen-frame edit without making an API call, for visible review and execution. */
export async function gridRepairRequest(
	ctx: RigCtx,
	item: Item,
	anim: string,
	dir: DirectionName,
	seed: number,
	selectedCells?: string[],
	repairCols?: number
): Promise<Req> {
	const { rig } = ctx.rec.manifest;
	if (
		!item.key ||
		!item.dressed?.[dir] ||
		!rig.directions.some((d) => d.id === dir && !d.mirrorOf) ||
		item.baseHash !== rig.baseHash
	)
		throw new Error('This equipment cannot be repaired against the current character view.');
	const cells =
		selectedCells ??
		Array.from(
			{ length: rig.animations.find((a) => a.id === anim)?.cells ?? 0 },
			(_, i) => `${anim}/${dir}/${i}`
		);
	const count = rig.animations.find((a) => a.id === anim)?.cells ?? 0;
	if (
		!cells.length ||
		new Set(cells).size !== cells.length ||
		cells.some((k) => {
			const parts = k.split('/');
			return (
				parts.length !== 3 ||
				parts[0] !== anim ||
				parts[1] !== dir ||
				!/^(0|[1-9][0-9]*)$/.test(parts[2]) ||
				+parts[2] >= count
			);
		})
	)
		throw new Error('Choose unique existing frames from this move and direction to repair.');
	const slot = requireSlot(ctx.rec.manifest, item.slot);
	if (item.layers.length !== (slot.bgZ == null ? 1 : 2))
		throw new LocalizedError(
			'Equipment layers do not match this slot. No generation was requested.',
			'itemRoute.errors.layersMismatch'
		);
	const pad = ((item.layers[0].cell?.w ?? rig.cell.w) - rig.cell.w) / 2;
	if (
		!Number.isInteger(pad) ||
		pad < 0 ||
		item.layers.some(
			(l) =>
				(l.cell?.w ?? rig.cell.w) !== rig.cell.w + 2 * pad ||
				(l.cell?.h ?? rig.cell.h) !== rig.cell.h + 2 * pad
		)
	)
		throw new Error('Equipment layers use incompatible repair dimensions.');
	const refs = await Promise.all(
		(Object.entries(item.dressed) as [DirectionName, string][]).map(async ([d, h]) => ({
			dir: d,
			im: await img(h.slice(7))
		}))
	);
	return gridReq(
		ctx,
		{
			slot: item.slot,
			slotConfig: structuredClone(slot),
			prompt: item.prompt,
			key: item.key
		},
		cells,
		refs,
		seed,
		pad,
		true,
		repairCols
	);
}
/** One clip-direction edited on its own canvas; body frames remain frozen and reference cells are protected. A grid the account's
 *  plan cannot run (> 256 px needs Tier 2) is never enqueued, since the queue would hold it forever: `blocked` says why. */
async function gridItemClip(
	ctx: RigCtx,
	item: Item,
	anim: string,
	dir: DirectionName,
	call: number,
	keys: Partial<Record<DirectionName, Img>>,
	cuts: Cuts,
	seed: number,
	selectedCells?: string[],
	activityScope?: string,
	savedOnly = false,
	prepared?: {
		request: Req;
		maskRequest?: Req;
		canvas?: { w: number; h: number };
		tier: number;
		start: number;
		count: number;
	},
	title?: ItemViewTitle
): Promise<
	{ cells: CellOut[]; prov: Provenance; registrationIssue?: string } | { blocked: string }
> {
	const { rig } = ctx.rec.manifest,
		slot = requireSlot(ctx.rec.manifest, item.slot),
		pad = ((item.layers[0].cell?.w ?? rig.cell.w) - rig.cell.w) / 2;
	const cells =
			selectedCells ??
			Array.from(
				{ length: rig.animations.find((a) => a.id === anim)!.cells },
				(_, i) => `${anim}/${dir}/${i}`
			),
		n = cells.length;
	// Reattaching a finished grid needs no plan check: nothing is sent.
	const req = prepared?.request ?? (await gridRepairRequest(ctx, item, anim, dir, seed, cells)),
		blocked = savedOnly ? null : queue.planBlocks(req, 1);
	if (blocked) return { blocked };
	const w = rig.cell.w + 2 * pad,
		h = rig.cell.h + 2 * pad;
	const stencils = await inpaintStencils((prepared?.maskRequest ?? req).body, n, w, h);
	const rec = await submitOrSaved(
		req,
		{
			label: `${prepared?.maskRequest ? 'redraw' : 'grid'} ${item.name} · ${anim} ${dir}${prepared ? ` · frames ${prepared.start + 1}–${prepared.start + prepared.count}` : ''}`,
			...(title ? { title: title(anim, dir) } : {}),
			tag: 'studio-move',
			activityScope,
			minimumTier: prepared?.tier ?? 1
		},
		savedOnly
	);
	const r = terminal(rec) ? rec : await settled(rec.id);
	if (r.state !== 'done')
		throw requestStopped(
			item,
			r,
			`${item.name} ${anim} ${dir} grid: ${r.state} ${r.error ?? ''}`,
			'itemRoute.errors.gridStopped'
		);
	if (outputsOf(r).length !== 1)
		throw new LocalizedError(
			`${INVALID_ITEM_GRID} Expected exactly one sheet. Existing artwork was kept.`,
			'itemRoute.errors.invalidItemGridSheet'
		);
	const g = await img(outputsOf(r)[0].sha),
		size = stencils.size;
	if (g.w !== (prepared?.canvas?.w ?? size.width) || g.h !== (prepared?.canvas?.h ?? size.height))
		throw new LocalizedError(
			`${INVALID_ITEM_GRID} The sheet has the wrong frame layout. Existing artwork was kept.`,
			'itemRoute.errors.invalidItemGridLayout'
		);
	const cut = cutGrid(g, n, w, h, stencils.cols);
	let registrationIssue: string | undefined;
	if (prepared?.canvas) {
		let top = false,
			bottom = false,
			left = false,
			right = false;
		for (let x = 0; x < g.w; x++) {
			top ||= !!g.data[x * 4 + 3];
			bottom ||= !!g.data[((g.h - 1) * g.w + x) * 4 + 3];
		}
		for (let y = 0; y < g.h; y++) {
			left ||= !!g.data[y * g.w * 4 + 3];
			right ||= !!g.data[(y * g.w + g.w - 1) * 4 + 3];
		}
		if (!top || !bottom || !left || !right) registrationIssue = ITEM_GRID_REGISTRATION_NOTICE;
	}
	const out = cells.map((c, i) => {
		const base = padImg(baseCell(ctx, c), pad);
		if (prepared?.canvas) clearKeyMatte(cut[i], inputCell(base, item.key!), item.key!);
		return extractCell({
			key: c,
			call,
			base,
			out: cut[i],
			route: item.key!,
			band: bandOf(requireSlot(ctx.rec.manifest, item.slot), pad ? undefined : skelOf(ctx, c), h),
			posed: true,
			clip: slot.band,
			held: slot.class === 'held',
			pad,
			cut: cutFor(ctx, item.slot, c, true, cuts),
			stencil: stencils.cells[i]
		});
	});
	if (!prepared) postProcess(rig, slot, out, keys, pad);
	return { cells: out, prov: toProv(r, { cells, seed, rerolls: 0, old: [] }), registrationIssue };
}
/**
 * B14: redo one clip-direction of an accepted (rig-cell) item as an inpaint-v3 grid and keep it when it passes every gate
 * (the stored clip failed QA after its re-rolls, e.g. T3's cape wrapping the raised arm in slash north). Returns the grid's QA.
 */
export async function regridClip(
	ctx: RigCtx,
	item: Item,
	anim: string,
	dir: DirectionName,
	seedN = seed(),
	preferTierOne = false,
	activityScope?: string,
	savedOnly = false,
	redraw = false,
	title?: ItemViewTitle
): Promise<{ qa: QaResult; saved: boolean; cells: CellOut[]; review?: RepairReview }> {
	const { rig } = ctx.rec.manifest,
		slot = requireSlot(ctx.rec.manifest, item.slot),
		key = item.key!;
	if (!item.key || !item.dressed?.[dir])
		throw new Error(`${item.name}: no grid reference for this item`);
	const pad = ((item.layers[0].cell?.w ?? rig.cell.w) - rig.cell.w) / 2;
	const { keys, cuts, hidden } = await dressedKeys(ctx, item, pad);
	const frames = rig.animations.find((a) => a.id === anim)?.cells;
	if (!frames)
		throw new LocalizedError(
			'Choose an existing move before repairing its equipment.',
			'create.errors.chooseExistingMoveRepairing'
		);
	const batches = repairGridPlan(item.layers[0].cell ?? rig.cell, frames, preferTierOne, redraw);
	const requests = await Promise.all(
		batches.map(async (batch) => {
			const cells = Array.from(
				{ length: batch.count },
				(_, index) => `${anim}/${dir}/${batch.start + index}`
			);
			const batchSeed = seedN + batch.start;
			const maskRequest = await gridRepairRequest(
				ctx,
				item,
				anim,
				dir,
				batchSeed,
				cells,
				batch.cols
			);
			if (redraw) {
				const { inpainting_image, description } = maskRequest.body as InpaintV3;
				const source = await decodePngBytes(base64ToBytes(inpainting_image.image.base64));
				const data = new Uint8ClampedArray(batch.w * batch.h * 4);
				const matte = keyMatte(key);
				for (let y = 0; y < batch.h; y++)
					for (let x = 0; x < batch.w; x++) {
						const offset = (y * source.w + x) * 4;
						data.set(
							x < source.w && y < source.h && source.data[offset + 3]
								? source.data.subarray(offset, offset + 4)
								: matte,
							(y * batch.w + x) * 4
						);
					}
				const image_size = { width: batch.w, height: batch.h };
				const reference = await img(item.dressed![dir]!.slice(7));
				const padding =
					source.w !== batch.w || source.h !== batch.h
						? ` The described grid occupies the top-left ${source.w}x${source.h} px of the ${batch.w}x${batch.h} px sheet. The remaining margin is solid background; leave it empty.`
						: '';
				const request = routes.editImageSheet({
					method: 'edit_with_reference',
					description: description.replace(
						'the transparent background unchanged.',
						`the solid ${KEY_NAME[key]} background unchanged, including unused space. Keep the entire sheet opaque and do not crop, shift, or resize it.${padding}`
					),
					edit_images: [
						{
							...image_size,
							image: png(bytesToBase64(await encodePngBytes({ w: batch.w, h: batch.h, data })))
						}
					],
					reference_image: {
						width: reference.w,
						height: reference.h,
						image: png(bytesToBase64(await encodePngBytes(reference)))
					},
					image_size,
					seed: batchSeed,
					no_background: false
				});
				return { ...batch, cells, seed: batchSeed, request, maskRequest, canvas: batch };
			}
			return {
				...batch,
				cells,
				seed: batchSeed,
				request: maskRequest
			};
		})
	);
	if (!savedOnly)
		for (const batch of requests) {
			const blocked = queue.planBlocks(batch.request, batch.tier);
			if (blocked) throw localizedPlanRestriction(blocked) ?? new Error(blocked);
		}
	const cells: CellOut[] = [],
		provenance: Provenance[] = [],
		registrationFindings: string[] = [];
	let stopped: number | undefined, stoppedBy: Message | string | undefined;
	for (const [index, request] of requests.entries()) {
		let result: Awaited<ReturnType<typeof gridItemClip>>;
		try {
			result = await gridItemClip(
				ctx,
				item,
				anim,
				dir,
				index,
				keys,
				cuts,
				request.seed,
				request.cells,
				activityScope,
				savedOnly,
				request,
				title
			);
		} catch (error) {
			// The finished batches are paid and verified, so they stay usable; the frames of this batch and of the batches
			// not bought yet keep their current art. Nothing more is bought after a failure.
			if (!cells.length) throw error;
			console.error('item repair batch', error);
			stopped = index;
			stoppedBy = errorMessage(error);
			break;
		}
		if ('blocked' in result) {
			const refused = localizedPlanRestriction(result.blocked) ?? new Error(result.blocked);
			// A plan that stops allowing a later batch keeps the finished ones usable, like a failed batch.
			if (!cells.length) throw refused;
			console.error('item repair batch', refused);
			stopped = index;
			stoppedBy = errorMessage(refused);
			break;
		}
		// A shifted batch is flagged G10 (itemQa) and lands in the review with the rest of the approved, already priced
		// batches: stopping them offered only a paid re-roll and left the bought frames unusable.
		cells.push(...result.cells);
		provenance.push(result.prov);
		if (result.registrationIssue) registrationFindings.push(result.registrationIssue);
	}
	postProcess(rig, slot, cells, keys, pad);
	const qa = withH4(
		itemQa(rig, slot, key, cells, 0, GATES.keyOutsidePosed, pad, hidden),
		slot,
		cells,
		keys,
		rig,
		referenceBodies(rig, ctx.project.images),
		item.prompt
	);
	if (batches.length > 1)
		for (const [batch, findings] of qa.softCalls) {
			const palette = findings.filter((finding) => finding.startsWith('G6 '));
			if (palette.length) {
				qa.failCalls.set(batch, [...(qa.failCalls.get(batch) ?? []), ...palette]);
				qa.qa.status = 'fail';
				qa.qa.clips[`${anim}/${dir}`].status = 'fail';
			}
		}
	const kept = stopped === undefined ? [] : requests.slice(stopped).flatMap((r) => r.cells);
	const clip = await prepareClip(
		ctx,
		item,
		anim,
		[dir],
		cells,
		provenance,
		qa,
		pad,
		undefined,
		new Set(kept)
	);
	if (!redraw && !qa.failCalls.size && !kept.length) {
		await publishClip(ctx.rec.id, clip);
		return { qa, saved: true, cells };
	}

	const project = ctx.project;
	const repaired = {
		manifest: {
			...project.manifest,
			items: project.manifest.items.map((entry) => (entry.id === item.id ? clip.out : entry))
		},
		images: new Map([...project.images, ...clip.images])
	};
	const frame = {
		w: rig.cell.w + 2 * pad,
		h: rig.cell.h + 2 * pad,
		x: rig.pivot.x + pad,
		y: rig.pivot.y + pad
	};
	const previews = (source: Project) =>
		Array.from({ length: frames }, (_, index) =>
			composeCell(source, { [item.slot]: item.id }, anim, dir, index, frame)
		);
	return {
		qa,
		saved: false,
		cells,
		review: {
			clip,
			findings: [...new Set([...registrationFindings, ...[...qa.failCalls.values()].flat()])],
			current: previews(project),
			replacement: previews(repaired),
			...(kept.length
				? { kept: kept.map((k) => Number(k.split('/')[2])), stoppedBy: stoppedBy! }
				: {})
		}
	};
}

/** B16 fake-API check: an 8-direction held dress never sends edit-animation-v2 more frames than its size takes, every direction
 *  gets its own dressed keyframe back (the anchor's output is dropped), and re-rolling a later chunk only redoes its poses. */
export function selfTest() {
	const dirs: DirectionName[] = ['south', 'south-east', 'east', 'north-east', 'north'],
		pad = padOf('main_hand', 'skel');
	const rig = {
		cell: { w: 64, h: 64 },
		directions: dirs.map((id) => ({ id })),
		animations: [
			{ id: 'idle', cells: 4 },
			{ id: 'walk', cells: 8 }
		]
	} as unknown as Manifest['rig'];
	const plan = planItem(rig, {
		anims: ['idle', 'walk'],
		dirs,
		method: 'skel',
		key: 'green',
		slot: 'main_hand'
	});
	const calls: CallState[] = plan.map((c, i) => ({
		...c,
		seed: i,
		rerolls: 0,
		old: [],
		recId: `r${i}`
	}));
	const recs = new Map<string, JobRec>();
	for (const [k, c] of calls.entries()) {
		if (c.kind !== 'dress') continue;
		// the frames submit() sends: [anchor], then the chunk's padded rest cells; the fake API answers one output per frame
		const frames = [...(anchored(k, c.kind) ? ['anchor'] : []), ...c.cells];
		const req = itemRoute.edit(frames, 'x', 1, {
				w: rig.cell.w + 2 * pad,
				h: rig.cell.h + 2 * pad
			}),
			body = req.body as { frames: unknown[]; image_size: { width: number } };
		console.assert(
			body.frames.length >= 2 && body.frames.length <= editFrameCap(body.image_size.width),
			`dress call ${k + 1}: ${body.frames.length} frames at ${body.image_size.width} px (cap ${editFrameCap(body.image_size.width)})`
		);
		recs.set(c.recId!, {
			id: c.recId,
			state: 'done',
			jobs: [{ results: frames.map((f, i) => ({ label: String(i), sha: f })) }]
		} as unknown as JobRec);
	}
	const m = dressedOf(calls, (id) => recs.get(id!));
	console.assert(
		calls.filter((c) => c.kind === 'dress').length === 2 &&
			dirs.every((d) => m.get(restKey(d))?.sha === restKey(d)),
		`8-dir held dress: every direction dressed once (${[...m.keys()]})`
	);
	console.assert(planGens(plan) === 2 * 10 + 10 * 3, `8-dir held cost ${planGens(plan)}`);
	const d = { spec: {}, calls, log: [] } as unknown as Draft;
	rerollCall(d, 1, 'test');
	console.assert(
		calls
			.filter((c) => !c.recId)
			.map((c) => c.cells[0].split('/').slice(0, 2).join('/'))
			.join() === 'rest/north,idle/north,walk/north',
		'a later dress chunk re-roll redoes only its poses'
	);
}

export interface ItemPaletteRepairPlan {
	version: typeof ITEM_PALETTE_POLICY;
	fingerprint: string;
	materialId: string;
	changedPixels: number;
	changedFrames: number[];
	unmatchedPixels: number;
	/** Frames of the view the item has no art for: matching runs on the others, and the review names these. */
	missingFrames: number[];
}
const paletteVersion = (rec: StoredProject, itemId: string) => {
	const item = rec.manifest.items.find((entry) => entry.id === itemId);
	return stableStringify({
		rig: rigArtworkVersion(rec.manifest.rig, rec.character),
		item: item && itemContent(item),
		materials: rec.manifest.materials
	});
};
/** Inspect only stored equipment pixels. No queue, PixelLab call, material membership edit or image mutation. */
async function prepareItemPalette(
	projectId: string,
	itemId: string,
	anim: string,
	dir: DirectionName
) {
	const ctx = await loadProject(projectId),
		{ rig } = ctx.rec.manifest,
		item = ctx.rec.manifest.items.find((i) => i.id === itemId);
	const count = rig.animations.find((a) => a.id === anim)?.cells;
	if (
		!item ||
		item.slot === 'body' ||
		item.status !== 'accepted' ||
		item.baseHash !== rig.baseHash ||
		!count ||
		!rig.directions.some((d) => d.id === dir && !d.mirrorOf)
	)
		throw new Error(
			'Choose an accepted item and an authored view of an existing move to match colors.'
		);
	const matcher = itemPaletteMatcher(item, ctx.rec.manifest.materials),
		next = structuredClone(item),
		images = new Map<Sha256, Img>();
	const frames = new Map<
		number,
		{ cell: number; changedPixels: number; layers: { id: string; before: Sha256; after: Sha256 }[] }
	>();
	let changedPixels = 0,
		unmatchedPixels = 0;
	for (const [j, layer] of item.layers.entries()) {
		const row = layer.cells?.[anim]?.[dir];
		// A layer without frames in this view has nothing to match; a row of another length is malformed.
		if (!row) continue;
		if (row.length !== count)
			throw new Error('Color matching needs every stored frame in this view.');
		for (const [i, before] of row.entries()) {
			if (!before) continue;
			const original = ctx.project.images.get(before);
			if (!original) throw new Error('An equipment frame is missing. Existing colors were kept.');
			const r = matcher.apply(original);
			unmatchedPixels += r.unmatchedPixels;
			if (!r.changedPixels) continue;
			// Only RGB can change; exact dimensions, alpha and all pixel positions are retained.
			if (
				r.image.w !== original.w ||
				r.image.h !== original.h ||
				r.image.data.some((v, k) => k % 4 === 3 && v !== original.data[k])
			)
				throw new Error('Color matching cannot change equipment geometry.');
			const after = await cellHash(r.image);
			images.set(after, r.image);
			next.layers[j].cells![anim][dir]![i] = after;
			const frame = frames.get(i) ?? { cell: i, changedPixels: 0, layers: [] };
			frame.changedPixels += r.changedPixels;
			frame.layers.push({ id: layer.id, before, after });
			frames.set(i, frame);
			changedPixels += r.changedPixels;
		}
	}
	if (!changedPixels) throw new Error('No eligible colors need matching in this view.');
	const version = paletteVersion(ctx.rec, itemId),
		edits = [...frames.values()].sort((a, b) => a.cell - b.cell);
	const plan: ItemPaletteRepairPlan = {
		version: ITEM_PALETTE_POLICY,
		fingerprint: await sha256(stableStringify({ projectId, anim, dir, version })),
		materialId: matcher.materialId,
		changedPixels,
		changedFrames: edits.map((f) => f.cell),
		unmatchedPixels,
		missingFrames: Array.from({ length: count }, (_, i) => i).filter(
			(i) => item.coverage && !item.coverage.includes(cellKey(anim, dir, i) as CellKey)
		)
	};
	next.paletteRepairs = [
		...(next.paletteRepairs ?? []),
		{ version: ITEM_PALETTE_POLICY, materialId: matcher.materialId, anim, dir, frames: edits }
	];
	if (!validPaletteRepairs(next.paletteRepairs))
		throw new Error(
			'This color correction exceeds the supported history format. Existing colors were kept.'
		);
	return { plan, version, next, images };
}
/** A free, explicit preview; unsupported/ambiguous color families remain unchanged. */
export async function itemPaletteRepairPlan(
	projectId: string,
	itemId: string,
	anim: string,
	dir: DirectionName
): Promise<ItemPaletteRepairPlan> {
	return (await prepareItemPalette(projectId, itemId, anim, dir)).plan;
}
/** Apply exactly the reviewed free edit, atomically. Historical QA flags and original paid provenance are preserved. */
export async function matchItemColors(
	projectId: string,
	itemId: string,
	anim: string,
	dir: DirectionName,
	reviewed: ItemPaletteRepairPlan
): Promise<void> {
	const prepared = await prepareItemPalette(projectId, itemId, anim, dir);
	if (stableStringify(prepared.plan) !== stableStringify(reviewed))
		throw new LocalizedError(
			'This item or its colors changed. Review the color match again.',
			'itemRoute.errors.paletteReviewChanged'
		);
	await saveItem(projectId, prepared.next, prepared.images, [], (current) => {
		if (paletteVersion(current, itemId) !== prepared.version)
			throw new LocalizedError(
				'This item, body or material changed. Existing colors were kept; review again.',
				'itemRoute.errors.paletteSaveChanged'
			);
	});
}
