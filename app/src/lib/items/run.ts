// Item runner (architecture §3): drafts -> calls through the queue -> extraction + QA from the ledger -> player review or accept.
// UI-free; ui/M3.svelte and the Studio use this. A Draft is mutated in place (pass a Svelte $state proxy to get reactivity)
// and persisted through the `persist` hook. Everything is re-derived from the job ledger, so reloads resume.
import { queue, requestIdentity, type JobRec } from '../pixellab/queue.ts';
import { base64ToBytes, binaryAlpha, bytesToBase64, decodePng, type Img } from '../image/png.ts';
import { sha256, stableStringify } from '../image/hash.ts';
import { cellHash, rigArtworkVersion, type Sha256 } from '../rig/rig.ts';
import {
	itemPaletteMatcher,
	ITEM_PALETTE_POLICY,
	standingDyeMatcher,
	validPaletteRepairs
} from '../dress/item-palette.ts';
import { colorCounts, fromHex } from '../dress/palette.ts';
import { deriveMaterials, hasCells } from '../dress/dress.ts';
import { decodePngBytes, encodePngBytes } from '../image/pngraw.ts';
import { hardMaskBits } from '../image/hard-mask.ts';
import * as db from '../store/db.ts';
import { loadProject, saveItem, type StoredProject } from '../store/project.ts';
import type {
	CellKey,
	Item,
	Manifest,
	Material,
	Project,
	Provenance,
	Slot
} from '../store/manifest.ts';
import { dropCut } from '../compose/compose.ts';
import type { DirectionName, Keypoint, Rig } from '../rig/rig.ts';
import { fromApi, hasAll } from '../rig/poses.ts';
import { paddedPoses, poseBatches, poseGensFor } from '../rig/clips.ts';
import { acceptQa, clipOf, mergeQa } from './qa-summary.ts';
import {
	chromaLayer,
	keyAllowed,
	keyFor,
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
	type Req
} from '../pixellab/routes.ts';
import {
	GATES,
	heldParts,
	heldSkel,
	markHand,
	planAnchoredMove,
	reusesStanding,
	anchored,
	planGens,
	SLOTS,
	gridEstimate,
	repairGridLayout,
	bandMask,
	cutGrid,
	g2Fails,
	grayShare,
	smudgedViews,
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
	postProcess,
	restKey,
	slotOf,
	unrotate,
	type CallKind,
	type CellOut,
	type ItemSpec,
	type QaResult
} from './items.ts';

/** kind: 'edit' (packed edit-animation-v2, anchor cell after the first), 'dress' (rest keyframes), 'pose' (one clip x dir). */
export interface CallState {
	cells: string[];
	seed: number;
	recId?: string;
	rerolls: number;
	old: string[];
	kind?: CallKind;
	frozen?: true;
	reference?: { image: Sha256; cell: CellKey };
}
export interface Draft {
	spec: ItemSpec;
	rigId: string;
	calls: CallState[];
	log: string[];
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
/** Standing checks may stop before animation: review must not offer to save incomplete coverage. */
export function incompleteCoverage(d: Draft, rig: Rig, r: Pick<ItemResult, 'cells'>): boolean {
	const covered = new Set(r.cells.map((c) => c.key));
	return d.spec.anims.some((anim) => {
		const clip = rig.animations.find((a) => a.id === anim);
		return (
			!clip ||
			(d.spec.clipDirs?.[anim] ?? d.spec.dirs).some((dir) =>
				Array.from({ length: clip.cells }, (_, i) => `${anim}/${dir}/${i}`).some(
					(key) => !covered.has(key)
				)
			)
		);
	});
}
/** A frozen rig opened with store/project.ts loadProject(). */
export interface RigCtx {
	rec: StoredProject;
	project: Project;
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
	while (taken.includes(id) || ctx.rec.manifest.items.some((i) => i.id === id)) id += '_2';
	const s: ItemSpec = {
		...spec,
		id,
		name: spec.name || id,
		method: spec.method ?? defaultMethod(ctx, spec)
	};
	if (s.method === 'skel' && (s.key === 'none' || !canPose(ctx.rec.manifest.rig, s)))
		s.method = 'anchor';
	return {
		spec: s,
		rigId: ctx.rec.id,
		calls: planItem(ctx.rec.manifest.rig, s).map((c) => ({
			...c,
			...(c.kind === 'grid' ? { frozen: true as const } : {}),
			seed: seed(),
			rerolls: 0,
			old: []
		})),
		log: []
	};
}

// ---------- ledger access ----------
let jobs: JobRec[] = [];
queue.subscribe((s) => (jobs = s.jobs));
export const recIn = (list: JobRec[], id?: string) =>
	id ? list.find((j) => j.id === id) : undefined;
const recOf = (id?: string) => recIn(jobs, id);
const terminal = (r?: JobRec) => !!r && !['queued', 'submitting', 'running'].includes(r.state);
const settled = (id: string) =>
	new Promise<JobRec>((res) => {
		let done = false;
		const un = queue.subscribe((s) => {
			const r = s.jobs.find((j) => j.id === id);
			if (!done && terminal(r)) {
				done = true;
				res(r!);
				queueMicrotask(() => un());
			}
		});
	});
const outputsOf = (r: JobRec) => [...(r.jobs[0]?.results ?? [])].sort(frameOrder);
/** Outputs of call k in cell order (an anchored call's first output is the anchor's: dropped). */
const cellOuts = (k: number, c: CallState, r: JobRec) =>
	outputsOf(r).slice(c.reference || anchored(k, c.kind) ? 1 : 0);
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
export function dressedOf(
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
const dressedRefs = (d: Draft) =>
	Promise.all(
		[...dressedOf(d.calls)].map(async ([k, o]) => ({
			dir: k.split('/')[1] as DirectionName,
			im: await img(o.sha)
		}))
	);
/** Generations spent on a draft, re-rolls included. */
const draftRecords = (d: Draft) => [
	...new Set(d.calls.flatMap((c) => [c.recId, ...c.old]).filter((id): id is string => !!id))
];
export const gensOf = (d: Draft, list = jobs) =>
	draftRecords(d).reduce((s, id) => s + (recIn(list, id)?.gens ?? 0), 0);
export const usdOf = (d: Draft, list = jobs) =>
	draftRecords(d).reduce((s, id) => s + (recIn(list, id)?.usd ?? 0), 0);
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
		maxY = cutRows(slot, skelOf(ctx, k, restView), rig.cell.h);
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
				band: bandOf(item.slot, pad ? undefined : skelOf(ctx, k, true), H),
				cut: cutFor(ctx, item.slot, k, false, {}, true)
			});
		keys[d] = c.layer;
		if (c.cut) cuts[d] = c.cut;
		cells.push(c);
	}
	return { keys, cuts, hidden: hiddenViews(cells, keys, item.slot) };
}

function standingViews(d: Draft, ctx: RigCtx, refs: { dir: DirectionName; im: Img }[]) {
	const views: Partial<Record<DirectionName, StandingDesignView>> = {};
	if (
		!gridable(d.spec) ||
		slotOf(d.spec.slot).class !== 'worn' ||
		slotOf(d.spec.slot).bgZ != null ||
		padOf(d.spec.slot, d.spec.method, ctx.rec.manifest.rig.cell)
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
			spec.slot === 'off_hand' ? 'LEFT ARM' : 'RIGHT ARM'
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
	spec: Pick<ItemSpec, 'slot' | 'prompt' | 'key'>,
	cells: string[],
	refs: { dir: DirectionName; im: Img }[],
	seed: number,
	pad = 0,
	repair = false
): Promise<Req> {
	const { rig } = ctx.rec.manifest,
		w = rig.cell.w + 2 * pad,
		h = rig.cell.h + 2 * pad,
		[anim, dir] = cells[0].split('/') as [string, DirectionName];
	if (cells.some((k) => k.split('/')[1] !== dir))
		throw new Error('Repair one independently drawn direction at a time.');
	const held = slotOf(spec.slot).class === 'held';
	const radius = held ? heldRepairRadius(ctx, spec, refs, pad) : 0;
	// Keep other views for QA; mixing front and back references can confuse the image editor.
	refs = refs.filter((r) => r.dir === dir);
	if (refs.length !== 1)
		throw new Error(`${dir}: repair needs exactly one matching dressed reference`);
	const cell = { w, h };
	const layout = repair
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
					bandOf(spec.slot, skelOf(ctx, k), h),
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
		const point = observed?.[spec.slot === 'off_hand' ? 'LEFT ARM' : 'RIGHT ARM'];
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
			slot: spec.slot,
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
const gridable = (spec: { slot: string; key?: ItemSpec['key'] }) =>
	!!spec.key && spec.key !== 'none' && slotOf(spec.slot).class !== 'held';

const blobB64 = async (sha: string) =>
	bytesToBase64(new Uint8Array(await (await db.getBlob(sha))!.arrayBuffer()));
/** Times each call was dropped (re-rolled, or its design or key changed): a request built across a drop is stale. */
const drops = new WeakMap<CallState, number>();
function drop(c: CallState) {
	if (c.recId) c.old.push(c.recId);
	c.recId = undefined;
	drops.set(c, (drops.get(c) ?? 0) + 1);
}
async function callRequest(d: Draft, k: number, ctx: RigCtx): Promise<Req> {
	const c = d.calls[k],
		route = d.spec.key,
		{ rig } = ctx.rec.manifest,
		pad = padOf(d.spec.slot, d.spec.method, rig.cell);
	let req;
	if (c.kind === 'grid') {
		// B14: the clip-direction as one inpaint-v3 grid, the dress call's keyframes as reference cells
		req = await gridReq(ctx, d.spec, c.cells, await dressedRefs(d), c.seed);
		const blocked = queue.planBlocks(req, 1);
		if (blocked)
			throw new Error(
				`Automatic equipment repair is unavailable: ${blocked}. Existing artwork was kept; manual review is needed.`
			);
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
			slot: d.spec.slot,
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
		if (c.reference) frames.push(await blobB64(c.reference.image.slice(7)));
		else if (anchored(k, c.kind)) {
			// anchor cell: the design call's dressed cell 0 (cross-call design lock, S2; B16: dress chunks too)
			const a = recOf(d.calls[0].recId);
			if (a?.state !== 'done') throw new Error('design call not done');
			frames.push(await blobB64(outputsOf(a)[0].sha));
		}
		const mark = c.kind === 'dress' && heldSkel(d.spec.slot, d.spec.method);
		for (const key of c.cells) {
			const im = padImg(inputCell(baseCell(ctx, key, c.kind === 'dress'), route), pad),
				rest = rig.rest?.[key.split('/')[1] as DirectionName]?.keypoints;
			if (mark && !rest) throw new Error(`${key}: no rest pose to mark the held hand`);
			frames.push(
				bytesToBase64(
					await encodePngBytes(mark ? markHand(im, rest!, d.spec.slot, rig.cell, pad) : im)
				)
			);
		}
		// held (S5): dress the marked rest views on the padded canvas, held naturally, one held item
		req = itemRoute.edit(
			frames,
			itemPrompt(
				dressItem(d.spec),
				route,
				c.cells,
				c.reference?.cell ?? (anchored(k, c.kind) ? d.calls[0].cells[0] : undefined)
			),
			c.seed,
			{ w: rig.cell.w + 2 * pad, h: rig.cell.h + 2 * pad }
		);
	}
	return req;
}

/** A dropped call keeps its paid record in `old` so its previous design or key never lands in the current draft. */
async function submit(d: Draft, k: number, ctx: RigCtx): Promise<string> {
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
	const id = (
		await queue.enqueue(req, {
			label,
			tag: d.activityScope ? 'studio-move' : 'm3',
			activityScope: d.activityScope,
			playerRequested: true,
			minimumTier: d.calls.some((c) => c.kind === 'pose' || c.kind === 'grid') ? 1 : 0
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
	persist: () => Promise<unknown>
): Promise<JobRec> {
	let id = d.calls[k].recId;
	if (id && !recOf(id))
		throw new Error(
			'The saved generation record is unavailable. No request was resent. Review this item before starting a new attempt.'
		);
	if (!id) {
		id = await submit(d, k, ctx);
		await persist();
	}
	const r = recOf(id)!;
	return terminal(r) ? r : settled(r.id);
}

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
export const failsOf = (res: ItemResult, k: number) => [
	...(res.g1.has(k) ? [res.g1.get(k)!] : []),
	...(res.qa?.failCalls.get(k) ?? [])
];

export interface RunHooks {
	status?: (s: string) => void;
	persist?: () => Promise<unknown>;
	result?: (r: ItemResult) => void;
	standingPalettes?: ReadonlyMap<DirectionName, number[]>;
}

/** Every check passed with nothing to look at: such a draft saves itself (round 10: review is optional). */
export const isClean = (r: ItemResult) =>
	r.qa?.qa.status === 'pass' && !r.g1.size && !r.qa.failCalls.size && !r.qa.warnings.length;

/** Run each batch of the player-requested plan once. Checks never authorize another paid attempt. */
export async function runItem(d: Draft, ctx: RigCtx, h: RunHooks = {}): Promise<ItemResult | null> {
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
			const x = await evaluateItem(d, ctx, h.standingPalettes);
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
		if (!h.result) return;
		if (streaming) {
			again = true;
			return;
		}
		streaming = true;
		evalItem()
			.catch((e) => console.error('item preview', e))
			.finally(() => {
				streaming = false;
				if (again) {
					again = false;
					landed();
				}
			});
	};
	// dress chunks report through their gate evaluation (poseEarly)
	const call = (k: number) =>
		runCall(d, k, ctx, persist).then((r) => {
			if (r.state === 'done' && d.calls[k]?.kind !== 'dress') landed();
			return r;
		});
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
				d.log.push(`call 1 ${r0.state}: ${r0.error ?? ''}`);
				break;
			}
			const gates = [poseEarly(early, 0, r0)];
			const rd = await Promise.all(
				d.calls.slice(1, nd).map((_, i) =>
					call(i + 1).then((r) => {
						gates.push(poseEarly(early, i + 1, r));
						return r;
					})
				)
			);
			await Promise.all(gates);
			const bd = rd.findIndex((r) => r.state !== 'done');
			if (bd >= 0) {
				d.log.push(`call ${bd + 2} ${rd[bd].state}: ${rd[bd].error ?? ''}`);
				break;
			}
			res = await evalItem();
			if (hasStructuralFailure(res)) {
				d.log.push(
					'PixelLab returned incomplete or malformed standing frames. No automatic retry was made.'
				);
				break;
			}
			status(`calls ${nd + 1}–${d.calls.length}`);
			const rs = await Promise.all(
				d.calls.slice(nd).map((_, i) => early.get(i + nd) ?? call(i + nd))
			);
			const broken = rs.findIndex((r) => r.state !== 'done');
			if (broken >= 0) {
				d.log.push(`call ${broken + nd + 1} ${rs[broken].state}: ${rs[broken].error ?? ''}`);
				break;
			}
			res = await evalItem();
			d.log.push(
				isClean(res)
					? 'Every frame passed the checks.'
					: 'Issues detected. Review the item and choose Try again or Accept as is. No automatic retry was made.'
			);
		} while (false);
	} catch (e) {
		d.log.push(`error: ${(e as Error).message}`);
	} finally {
		await persist();
	}
	return res;
}

// ---------- extraction + QA (re-derived from the ledger) ----------
const decoded = new Map<string, Img>();
async function img(sha: string) {
	let im = decoded.get(sha);
	if (!im) {
		im = binaryAlpha(await decodePng((await db.getBlob(sha))!));
		decoded.set(sha, im);
	}
	return im;
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
	ctx: RigCtx,
	standingPalettes?: ReadonlyMap<DirectionName, number[]>
): Promise<ItemResult> {
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
	const pad = padOf(d.spec.slot, d.spec.method, rig.cell),
		slot = slotOf(d.spec.slot),
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
			const g = await img(outputs[0].sha);
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
		let o = cellOuts(k, c, r);
		const expected =
			c.kind === 'pose'
				? Math.max(3, c.cells.length)
				: Math.max(EDIT_MIN_FRAMES - Number(!!c.reference || anchored(k, c.kind)), c.cells.length);
		if (o.length !== expected) {
			g1.set(k, `G1 ${o.length} outputs for ${expected} requested frames`);
			continue;
		}
		if (c.kind !== 'pose' && o.length > c.cells.length) {
			const padding = await Promise.all(o.slice(c.cells.length).map((output) => img(output.sha)));
			if (padding.some((im) => im.w !== W || im.h !== H)) {
				g1.set(k, 'G1 duplicated edit output has the wrong frame size');
				continue;
			}
		}
		if (c.kind === 'pose') {
			const dir = c.cells[0].split('/')[1] as DirectionName;
			const poses = paddedPoses(c.cells.map((key) => cellKeypoints(rig, key)!));
			o = unrotate(o, f0Last(d.spec.slot, rig.rest?.[dir]?.keypoints ?? [], poses, rig.cell)).slice(
				0,
				c.cells.length
			);
		}
		for (const [i, key] of c.cells.entries()) {
			const im = await img(o[i].sha);
			if (im.w !== W || im.h !== H) {
				g1.set(k, `G1 output ${im.w}x${im.h}`);
				break;
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
					band: bandOf(d.spec.slot, pad ? undefined : skelOf(ctx, o.key, restView), H),
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
	const hidden = hiddenViews(kfCells, keys, d.spec.slot),
		hiddenWarnings: string[] = [],
		smudged = smudgedViews(
			d.spec.slot,
			d.spec.prompt,
			kfCells.map((c) => c.layer)
		);
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
				`D1 keyframe ${o.key}: ${(grayShare(c.layer) * 100).toFixed(0)} % gray smudges in a colorful design`
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
	const run = (useCc?: boolean) =>
		outs.filter((o) => !structuralReason(g1.get(o.k) ?? '')).map((o) => ex(o, useCc));
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
	// Dressed item pixels can land before any target animation cell exists. Expose them without waiting for pose coverage.
	const thumbnail = (
		kfCells.find((c) => c.area && c.key.split('/')[1] === 'south') ?? kfCells.find((c) => c.area)
	)?.layer;
	return {
		cells,
		qa,
		g1,
		preview: qa ? await previewProject(d, ctx, cells, qa, pending) : null,
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
	for (const [clip, summary] of Object.entries(q.qa.clips ?? {})) {
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
	cells: CellOut[],
	qa: QaResult,
	pending: CellKey[]
): Promise<Project> {
	const { item, images } = await buildItem({
		spec: JSON.parse(JSON.stringify(d.spec)) as ItemSpec,
		rig: ctx.rec.manifest.rig,
		cells,
		route: d.spec.key,
		provenance: [],
		qa: qa.qa,
		pad: padOf(d.spec.slot, d.spec.method, ctx.rec.manifest.rig.cell),
		pending
	});
	const m: Manifest = structuredClone(ctx.rec.manifest);
	m.items = [...m.items.filter((i) => i.id !== item.id), item];
	if (!m.slots.some((s) => s.id === item.slot)) m.slots = [...m.slots, slotOf(item.slot)];
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
	usage: { generations: r.gens, usd: r.usd },
	createdAt: new Date(r.submittedAt ?? r.createdAt).toISOString(),
	produced: [...c.cells] as Provenance['produced']
});
/** The body cells (what baseHash covers) of `anims`, comparable across records. */
const bodyCells = (m: Manifest, anims: string[]) =>
	stableStringify([
		m.rig.directions.map((d) => d.id),
		anims.map((a) => m.items.find((i) => i.id === m.rig.baseItem)?.layers[0].cells?.[a] ?? null)
	]);
/** Write the item (layers + cell blobs + provenance + QA) into the rig's project record. A non-pass QA becomes "accepted". */
export async function acceptItem(
	d: Draft,
	ctx: RigCtx,
	res?: ItemResult
): Promise<{ item: Item; cells: number }> {
	if (d.rigId !== ctx.rec.id)
		throw new Error(`${d.spec.id} belongs to ${d.rigId}, not ${ctx.rec.id}`);
	const r = res ?? (await evaluateItem(d, ctx));
	if (hasStructuralFailure(r))
		throw new Error(
			`${d.spec.id}: a batch has missing or malformed frames. Try again before keeping this item.`
		);
	if (incompleteCoverage(d, ctx.rec.manifest.rig, r))
		throw new Error(
			`${d.spec.id}: a batch has missing or malformed frames. Try again before keeping this item.`
		);
	if (!r.qa || d.calls.some((c) => recOf(c.recId)?.state !== 'done'))
		throw new Error(`${d.spec.id}: not all calls are done`);
	const qa = acceptQa(r.qa.qa);
	const dress = d.calls[0].kind === 'dress',
		dressed: Partial<Record<DirectionName, Img>> = {};
	if (dress) for (const r of await dressedRefs(d)) dressed[r.dir] = r.im;
	// Preserve the original chroma outputs before setup too. Later skeleton estimates can reuse them only if the
	// selected standing body frames still exactly match the registered references.
	else if (d.spec.standing && d.spec.key !== 'none')
		for (const [k] of d.calls.entries()) {
			for (const [key, out] of chunkOuts(d.calls, k, recOf))
				if (key.startsWith(`${d.spec.standing}/`))
					dressed[key.split('/')[1] as DirectionName] = await img(out.sha);
		}
	const provenance = d.calls.map((c) => toProv(recOf(c.recId)!, c));
	const { item, images } = await buildItem({
		spec: JSON.parse(JSON.stringify(d.spec)) as ItemSpec,
		rig: ctx.rec.manifest.rig,
		cells: r.cells,
		route: d.spec.key,
		qa,
		...(Object.keys(dressed).length ? { dressed } : {}),
		pad: padOf(d.spec.slot, d.spec.method, ctx.rec.manifest.rig.cell),
		provenance,
		anchorCell: d.calls.length > 1 ? d.calls[0].cells[0] : undefined
	});
	// Accepted keyframe issues, and the dark-patch review notes, stay with the saved item (2026-11-07 session counter-review F2).
	const darkNotes = r.qa.warnings.filter((why) => why.startsWith('D1 '));
	const designWarnings = [
		...new Set([...[...r.g1.values()].flatMap((why) => why.split(/;\s*/)), ...darkNotes])
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
	await saveItem(d.rigId, item, images, SLOTS, (cur) => {
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
/** Accepted skeleton-pose items that can be posed onto a new clip (dressed keyframes + key, made for this base). */
export const posable = (m: Manifest) =>
	m.items.filter(
		(i) =>
			i.slot !== 'body' &&
			i.route === 'skeleton-pose' &&
			i.key &&
			i.dressed &&
			i.baseHash === m.rig.baseHash
	);
export const anchorable = (m: Manifest) =>
	m.items.filter(
		(i) =>
			i.slot !== 'body' &&
			i.route === 'ea2-anchor' &&
			i.standing &&
			i.key &&
			i.dressed &&
			i.baseHash === m.rig.baseHash
	);

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
	const result = options.savedOnly
		? await evaluateItem(draft, ctx, standingPalettes)
		: await runItem(draft, ctx, { standingPalettes });
	if (!result?.qa || hasStructuralFailure(result) || incompleteCoverage(draft, rig, result))
		throw new Error(
			draft.log.at(-1) ?? 'Equipment frames could not finish. Existing artwork was kept.'
		);
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
		draft.calls.map((c) => toProv(recOf(c.recId)!, c)),
		result.qa,
		0,
		needsMaterials ? materials : undefined
	);
	dirs.forEach(onCall);
}
/** Gens for posing `n` items onto a clip of `cells` frames in `dirs` directions. */
export const poseGens = (n: number, cells: number, dirs: number) => n * dirs * poseGensFor(cells);
/** The complete requested posing plan; additional attempts require a new player request. */
export function itemPoseGens(
	rig: Rig,
	item: Item,
	anim: string,
	frames: number,
	dirs: DirectionName[]
): number {
	const cell = item.layers[0]?.cell ?? rig.cell;
	return dirs.reduce(
		(sum, dir) =>
			sum +
			poseBatches(frames).reduce((n, batch) => {
				const cells = Array.from(
					{ length: batch.count },
					(_, i) => `${anim}/${dir}/${batch.start + i}`
				);
				return (
					n +
					(frozenGrid(rig, item, cells)
						? repairGridLayout(cell, cells.length, 1).gens
						: poseGensFor(cells.length))
				);
			}, 0),
		0
	);
}
const seedOf = (s: string) =>
	1 + ([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 2_000_000);

/** Some directions of an item move failed after the others were saved. */
export class PartialMoveError extends Error {
	constructor(
		readonly reason: string,
		readonly savedDirs: DirectionName[]
	) {
		super(`${reason} The finished views were saved.`);
	}
}

export const SAVED_FRAMES_UNAVAILABLE =
	'Completed frames matching the current body and equipment are unavailable. No generation was requested.';
/** Enqueue a paid request, or with `savedOnly` reattach the completed record of the identical request and never send one. */
async function submitOrSaved(
	req: Req,
	meta: Parameters<typeof queue.enqueue>[1],
	savedOnly?: boolean
): Promise<JobRec> {
	if (!savedOnly) return queue.enqueue(req, meta);
	const { requestHash } = await requestIdentity(req),
		saved = jobs.findLast((r) => r.requestHash === requestHash && r.state === 'done');
	if (!saved) throw new Error(SAVED_FRAMES_UNAVAILABLE);
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
	savedOnly = false
): Promise<QaResult> {
	const { rig } = ctx.rec.manifest,
		slot = slotOf(item.slot),
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
	const keys: Partial<Record<DirectionName, Img>> = {};
	const { keys: k0, cuts, hidden } = await dressedKeys(ctx, item, pad);
	const bodies = referenceBodies(rig, ctx.project.images);
	Object.assign(keys, k0);
	const perDir = await Promise.allSettled(
		dirs.map(async (dir, k) => {
			const allPoses = clipKeypoints(rig, anim, dir),
				rest = rig.rest?.[dir]?.keypoints;
			if (!allPoses || !rest) throw new Error(`${anim}/${dir}: no stored keypoints`);
			const collected: CellOut[] = [],
				prov: Provenance[] = [];
			for (const { start, count } of poseBatches(allPoses.length)) {
				const poses = allPoses.slice(start, start + count),
					cells = poses.map((_, i) => `${anim}/${dir}/${start + i}`);
				const seed = seedOf(
					`${item.id}/${anim}/${dir}/0${allPoses.length > 15 ? `/batch-${start}` : ''}${moveSeed ? `/${moveSeed}` : ''}`
				);
				if (frozenGrid(rig, { slot: item.slot, key }, cells)) {
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
						savedOnly
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
				const req = itemRoute.pose({
					keyframePngB64: await blobB64(item.dressed![dir]!.slice(7)),
					rest,
					poses,
					item: item.prompt,
					slot: item.slot,
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
						tag: 'studio-move',
						playerRequested: true,
						activityScope,
						minimumTier: 1
					},
					savedOnly
				);
				const r = terminal(rec) ? rec : await settled(rec.id);
				onCall();
				if (r.state !== 'done')
					throw new Error(`${item.name} ${anim} ${dir}: ${r.state} ${r.error ?? ''}`);
				const outputs = outputsOf(r);
				if (outputs.length !== Math.max(3, cells.length))
					throw new Error(
						`${item.name} ${anim} ${dir}: PixelLab returned missing or malformed frames. No automatic retry was made.`
					);
				const outs = unrotate(outputs, f0Last(item.slot, rest, paddedPoses(poses), rig.cell)).slice(
					0,
					cells.length
				);
				const images = await Promise.all(outs.map((o) => img(o.sha)));
				if (images.some((im) => im.w !== rig.cell.w + 2 * pad || im.h !== rig.cell.h + 2 * pad))
					throw new Error(
						`${item.name} ${anim} ${dir}: PixelLab returned the wrong frame size. No automatic retry was made.`
					);
				const candidate = cells.map((c, i) =>
					extractCell({
						key: c,
						call: k,
						base: padImg(baseCell(ctx, c), pad),
						out: images[i],
						route: key,
						band: bandOf(item.slot, pad ? undefined : skelOf(ctx, c), rig.cell.h + 2 * pad),
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
			}
			return { collected, prov };
		})
	);
	// Directions that finished are paid for: save them even when another direction failed, so a retry that skips complete
	// directions (addMove without replace) requests only the missing ones instead of buying them again (2026-11-07 audit).
	const doneDirs = dirs.filter((_, i) => perDir[i].status === 'fulfilled'),
		failures = perDir.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
	const done = perDir.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
		cells = done.flatMap((r) => r.collected),
		prov = done.flatMap((r) => r.prov);
	if (failures.length && !cells.length) throw failures[0];
	if (!cells.length) throw new Error(`${item.name}: PixelLab returned no usable ${anim} frames`);
	const q = withH4(
		itemQa(rig, slot, key, cells, 0, GATES.keyOutsidePosed, pad, hidden),
		slot,
		cells,
		keys,
		rig,
		bodies,
		item.prompt
	);
	const first = failures.length
		? failures[0] instanceof Error
			? failures[0].message
			: String(failures[0])
		: '';
	try {
		await mergeClip(ctx, item, anim, doneDirs, cells, prov, q, pad);
	} catch (error) {
		// The save error leads: the Studio offers free saved-frame recovery by its prefix (ITEM_MOVE_SAVE_CONFLICT).
		throw failures.length
			? new Error(`${error instanceof Error ? error.message : String(error)} ${first}`)
			: error;
	}
	if (failures.length) throw new PartialMoveError(first, doneDirs);
	return q;
}
/** Write a clip's cells (the given directions only) into an accepted item, with their provenance and QA. */
export const ITEM_MOVE_SAVE_CONFLICT =
	'This character or item changed while its frames were generating. Existing artwork was kept; finished frames stay in Activity.';
function clipArtwork({ materials: _materials, hides: _hides, ...artwork }: Item) {
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
	standingMaterials?: Material[]
) {
	const { rig } = ctx.rec.manifest,
		key = item.key!;
	const version = rigArtworkVersion(rig, ctx.rec.character),
		originalItem = clipArtwork(item);
	const count = rig.animations.find((a) => a.id === anim)?.cells;
	const expected = new Set(
		dirs.flatMap((d) => Array.from({ length: count ?? 0 }, (_, i) => `${anim}/${d}/${i}`))
	);
	if (
		!count ||
		!expected.size ||
		cells.length !== expected.size ||
		new Set(cells.map((c) => c.key)).size !== expected.size ||
		cells.some((c) => !expected.has(c.key)) ||
		Object.keys(q.qa.cells).length !== expected.size ||
		Object.keys(q.qa.cells).some((k) => !expected.has(k)) ||
		dirs.some((d) => !q.qa.clips?.[`${anim}/${d}`]) ||
		Object.keys(q.qa.clips ?? {}).length !== new Set(dirs).size
	)
		throw new Error('Move QA requires every frame of each replaced direction');
	const spec: ItemSpec = {
		id: item.id,
		name: item.name,
		slot: item.slot,
		prompt: item.prompt,
		key,
		anims: [anim],
		dirs,
		method: 'skel'
	};
	const built = await buildItem({ spec, rig, cells, route: key, provenance: [], qa: q.qa, pad });
	const out: Item = structuredClone(item);
	const previousCoverage =
		item.coverage ??
		rig.animations.flatMap((a) =>
			rig.directions
				.filter((d) => !d.mirrorOf && hasCells(ctx.rec.manifest, item, a.id, d.id))
				.flatMap((d) =>
					Array.from({ length: a.cells }, (_, i) => `${a.id}/${d.id}/${i}` as CellKey)
				)
		);
	out.coverage = [
		...new Set([...previousCoverage.filter((key) => !expected.has(key)), ...built.item.coverage!])
	];
	out.layers.forEach((l, j) => {
		l.cells = { ...l.cells, [anim]: { ...l.cells?.[anim], ...built.item.layers[j].cells![anim] } };
	});
	dropCut(out, anim, dirs); // replaced directions take their new cut, never a stale one
	for (const d of dirs) {
		const c = built.item.baseCut?.[anim]?.[d];
		if (c) ((out.baseCut ??= {})[anim] ??= {})[d] = c;
	}
	// Per-direction call numbers are local to this move; records arrive in completion order (and may be grid fallbacks).
	// Resolve the selected record by its produced keys, then offset into the item's full provenance history.
	const source = new Map(
		prov.flatMap((p, i) => p.produced.map((k) => [k, item.provenance.length + i] as const))
	);
	const qaCells = Object.fromEntries(
		Object.entries(q.qa.cells).map(([k, c]) => {
			const provenance = source.get(k as keyof typeof q.qa.cells);
			if (provenance == null) throw new Error(`No source record for ${k}`);
			return [k, { ...c, provenance }];
		})
	);
	out.provenance = [...out.provenance, ...prov];
	out.qa = mergeQa(item, q.qa, qaCells);
	await saveItem(ctx.rec.id, out, built.images, SLOTS, (current) => {
		const currentItem = current.manifest.items.find((i) => i.id === item.id);
		if (
			!currentItem ||
			rigArtworkVersion(current.manifest.rig, current.character) !== version ||
			clipArtwork(currentItem) !== originalItem
		)
			throw new Error(ITEM_MOVE_SAVE_CONFLICT);
		// Outfit autosave owns these fields, including when it runs while a paid edit is pending.
		out.materials = currentItem.materials;
		if (!out.materials.length && standingMaterials?.length) {
			current.manifest.materials = [
				...current.manifest.materials.filter((m) => m.owner !== item.id),
				...standingMaterials
			];
			out.materials = standingMaterials.map((m) => m.id);
		}
		if (currentItem.hides === undefined) delete out.hides;
		else out.hides = currentItem.hides;
	});
}
/** Free acknowledgment of the exact artwork and warnings the player reviewed, never a new generation. */
export async function acceptItemReview(
	projectId: string,
	itemId: string,
	reviewed: Item
): Promise<void> {
	const ctx = await loadProject(projectId),
		item = ctx.rec.manifest.items.find((i) => i.id === itemId);
	const expected = stableStringify(reviewed),
		version = rigArtworkVersion(ctx.rec.manifest.rig, ctx.rec.character);
	if (
		!item ||
		item.id !== reviewed.id ||
		item.slot === 'body' ||
		item.status !== 'accepted' ||
		!item.qa ||
		item.baseHash !== ctx.rec.manifest.rig.baseHash ||
		stableStringify(item) !== expected
	) {
		throw new Error(
			'This item or its checks changed. Reopen it before accepting its current artwork.'
		);
	}
	const accepted = { ...item, qa: { ...acceptQa(item.qa), status: 'accepted' as const } };
	await saveItem(projectId, accepted, new Map(), [], (current) => {
		if (
			rigArtworkVersion(current.manifest.rig, current.character) !== version ||
			stableStringify(current.manifest.items.find((i) => i.id === itemId)) !== expected
		) {
			throw new Error(
				'This item or its checks changed. Reopen it before accepting its current artwork.'
			);
		}
	});
}
/** Prepare a bounded frozen-frame edit without making an API call, for visible review and execution. */
export async function gridRepairRequest(
	ctx: RigCtx,
	item: Item,
	anim: string,
	dir: DirectionName,
	seed: number,
	selectedCells?: string[]
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
		{ slot: item.slot, prompt: item.prompt, key: item.key },
		cells,
		refs,
		seed,
		pad,
		true
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
	savedOnly = false
): Promise<{ cells: CellOut[]; prov: Provenance } | { blocked: string }> {
	const { rig } = ctx.rec.manifest,
		slot = slotOf(item.slot),
		pad = ((item.layers[0].cell?.w ?? rig.cell.w) - rig.cell.w) / 2;
	const cells =
			selectedCells ??
			Array.from(
				{ length: rig.animations.find((a) => a.id === anim)!.cells },
				(_, i) => `${anim}/${dir}/${i}`
			),
		n = cells.length;
	// Reattaching a finished grid needs no plan check: nothing is sent.
	const req = await gridRepairRequest(ctx, item, anim, dir, seed, cells),
		blocked = savedOnly ? null : queue.planBlocks(req, 1);
	if (blocked) return { blocked };
	const w = rig.cell.w + 2 * pad,
		h = rig.cell.h + 2 * pad;
	const stencils = await inpaintStencils(req.body, n, w, h);
	const rec = await submitOrSaved(
		req,
		{
			label: `grid ${item.name} · ${anim} ${dir}`,
			tag: 'studio-move',
			playerRequested: true,
			activityScope,
			minimumTier: 1
		},
		savedOnly
	);
	const r = terminal(rec) ? rec : await settled(rec.id);
	if (r.state !== 'done')
		throw new Error(`${item.name} ${anim} ${dir} grid: ${r.state} ${r.error ?? ''}`);
	if (outputsOf(r).length !== 1)
		throw new Error('PixelLab returned a malformed repair grid. Existing artwork was kept.');
	const g = await img(outputsOf(r)[0].sha),
		size = stencils.size;
	if (g.w !== size.width || g.h !== size.height)
		throw new Error(
			`${item.name} ${anim} ${dir}: PixelLab returned a grid with the wrong frame layout`
		);
	const cut = cutGrid(g, n, w, h, stencils.cols);
	const out = cells.map((c, i) =>
		extractCell({
			key: c,
			call,
			base: padImg(baseCell(ctx, c), pad),
			out: cut[i],
			route: item.key!,
			band: bandOf(item.slot, pad ? undefined : skelOf(ctx, c), h),
			posed: true,
			clip: slot.band,
			held: slot.class === 'held',
			pad,
			cut: cutFor(ctx, item.slot, c, true, cuts),
			stencil: stencils.cells[i]
		})
	);
	postProcess(rig, slot, out, keys, pad);
	return { cells: out, prov: toProv(r, { cells, seed, rerolls: 0, old: [] }) };
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
	seedN = seed()
): Promise<{ qa: QaResult; saved: boolean; cells: CellOut[] }> {
	const { rig } = ctx.rec.manifest,
		slot = slotOf(item.slot),
		key = item.key!;
	if (!item.key || !item.dressed?.[dir])
		throw new Error(`${item.name}: no grid reference for this item`);
	const pad = ((item.layers[0].cell?.w ?? rig.cell.w) - rig.cell.w) / 2;
	const { keys, cuts, hidden } = await dressedKeys(ctx, item, pad);
	const g = await gridItemClip(ctx, item, anim, dir, 0, keys, cuts, seedN);
	if ('blocked' in g) throw new Error(g.blocked);
	const qa = withH4(
		itemQa(rig, slot, key, g.cells, 0, GATES.keyOutsidePosed, pad, hidden),
		slot,
		g.cells,
		keys,
		rig,
		referenceBodies(rig, ctx.project.images),
		item.prompt
	);
	const saved = !qa.failCalls.size;
	if (saved) await mergeClip(ctx, item, anim, [dir], g.cells, [g.prov], qa, pad);
	return { qa, saved, cells: g.cells };
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
}
const paletteVersion = (rec: StoredProject, itemId: string) =>
	stableStringify({
		rig: rigArtworkVersion(rec.manifest.rig, rec.character),
		item: rec.manifest.items.find((i) => i.id === itemId),
		materials: rec.manifest.materials
	});
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
		if (!row || row.length !== count)
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
		unmatchedPixels
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
		throw new Error('This item or its colors changed. Review the color match again.');
	await saveItem(projectId, prepared.next, prepared.images, [], (current) => {
		if (paletteVersion(current, itemId) !== prepared.version)
			throw new Error(
				'This item, body or material changed. Existing colors were kept; review again.'
			);
	});
}
