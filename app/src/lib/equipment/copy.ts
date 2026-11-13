// A free copy of another character's item: an ordinary, independent item with its own ids and materials whose cells reuse the
// source's content-addressed blobs (or their flips, for a view the source mirrors), so its pixels stay byte-identical.
import * as db from '../store/db.ts';
import { cutAt, layerFrame } from '../compose/compose.ts';
import { decodePng, makeImg, type Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import { flipH } from '../rig/mirror.ts';
import { cellHash, cellKey } from '../rig/rig.ts';
import { variantOf, variantRampOf } from '../dress/dress.ts';
import { putItem, slotLadder } from '../items/items.ts';
import { clipOf, mergeQa, summaryOf } from '../items/qa-summary.ts';
import type { StoredProject } from '../store/project.ts';
import type {
	CellKey,
	DirectionName,
	Item,
	ItemQa,
	Layer,
	Manifest,
	Material,
	Preset,
	Sha256,
	UnfitNote
} from '../store/manifest.ts';
import { stableStringify } from '../image/hash.ts';
import {
	assessCopy,
	bodyOf,
	cellId,
	covered,
	type CellMatch,
	type CopyAssessment,
	type Flip
} from './compatibility.ts';
import { onTarget, refitCells, refitShared, refittable, standingMove } from './refit.ts';
import { actionOf } from '../rig/clips.ts';
import type { BundledSource } from './shared.ts';

export interface CopyCandidate {
	item: Item;
	materials: Material[];
	assessment: CopyAssessment;
	/** New images the item references (a re-fit's moved cells), stored with it. */
	images?: Map<Sha256, Img>;
}

/** Image blobs an item references (cells and dressed references). */
export function itemHashes(item: Item): Sha256[] {
	const refs = new Set<Sha256>();
	for (const h of Object.values(item.dressed ?? {})) if (h) refs.add(h);
	for (const l of item.layers)
		for (const ds of Object.values(l.cells ?? {}))
			for (const cs of Object.values(ds ?? {})) for (const h of cs ?? []) if (h) refs.add(h);
	return [...refs];
}

/** Flipped hashes of stored images, keeping each flipped image for publication. */
export function flipper(load: (hash: Sha256) => Promise<Img>): {
	flip: Flip;
	made: Map<Sha256, Img>;
} {
	const made = new Map<Sha256, Img>(),
		memo = new Map<Sha256, Promise<Sha256>>();
	const flip: Flip = (hash) => {
		let flipped = memo.get(hash);
		if (!flipped) {
			flipped = load(hash).then(async (im) => {
				const out = flipH(im),
					h = await cellHash(out);
				made.set(h, out);
				return h;
			});
			memo.set(hash, flipped);
		}
		return flipped;
	};
	return { flip, made };
}

/** The copy, or null when the bodies differ. `variants` are the source's current colors: they become the copy's defaults. */
export async function prepareCopy(
	source: Manifest,
	itemId: string,
	variants: Preset['variants'],
	target: Manifest,
	flip: Flip
): Promise<CopyCandidate | null> {
	const original = source.items.find((it) => it.id === itemId);
	if (!original || original.slot === 'body' || original.variantOf)
		throw new Error('That item is no longer available.');
	const assessment = await assessCopy(source, original, target, flip);
	if (!assessment.fits) return null;
	const { item, materials } = copyShell(
		source,
		original,
		variants,
		target,
		assessment.matches.map((match) => match.target)
	);
	item.layers.forEach((layer) => {
		layer.cells = {};
		delete layer.sheets;
	});
	delete item.baseCut;
	await putCells(source, original, target, item, assessment.matches, flip);
	// Standing references only fit future moves when the standing views match.
	if (!assessment.canExtend) {
		delete item.dressed;
		delete item.route;
	}
	return { item, materials, assessment };
}

/** Puts the source item's art of each matched cell into the copy's cells, with the base px an identical body hides under it (a
 *  mirrored source view flips both). The copy's layers are the source's, in order. */
async function putCells(
	source: Manifest,
	original: Item,
	target: Manifest,
	item: Item,
	matches: CellMatch[],
	flip: Flip
) {
	for (const match of matches) {
		const [ta, td, ti] = match.target.split('/') as [string, DirectionName, string],
			[sa, sd, si] = match.source.split('/') as [string, DirectionName, string],
			n = target.rig.animations.find((a) => a.id === ta)!.cells;
		const cut = cutAt(source, original, sa, sd, +si);
		if (cut?.length)
			(((item.baseCut ??= {})[ta] ??= {})[td] ??= Array(n).fill(null))[+ti] = [...cut].sort(
				(a, b) => a - b
			);
		for (const [i, layer] of original.layers.entries())
			(((item.layers[i].cells ??= {})[ta] ??= {})[td] ??= Array(n).fill(null))[+ti] = await cellId(
				source,
				layer,
				sa,
				sd,
				+si,
				flip
			);
	}
}

/** A new, independent item from another character's: own ids and materials (the source's current colors as defaults) and
 *  coverage of the `targets` cells, with the source checks kept as one summary per copied move. The caller sets its cells. */
export function copyShell(
	source: Manifest,
	original: Item,
	variants: Preset['variants'],
	target: Manifest,
	targets: string[]
): { item: Item; materials: Material[] } {
	const item = structuredClone(original),
		id = `gear-${crypto.randomUUID()}`,
		itemId = original.id;
	item.id = id;
	item.baseHash = target.rig.baseHash;
	item.coverage = targets as CellKey[];
	const materials = source.materials
		.filter((mat) => mat.owner === itemId)
		.map((mat, i) => {
			const copy: Material = { ...structuredClone(mat), id: `${id}_${i + 1}`, owner: id };
			// Links point at the source's other materials; the copy owns its resolved colors.
			delete copy.linkTo;
			const name = variantOf(source, variants, mat.id),
				ramp = name ? variantRampOf(mat, name) : undefined;
			if (name && ramp) {
				copy.variants[name] = ramp;
				copy.defaultVariant = name;
			} else delete copy.defaultVariant;
			return copy;
		});
	item.materials = materials.map((mat) => mat.id);
	if (item.qa) {
		// The art is unchanged on an identical body, so the source checks still describe it, as one summary per copied move (a
		// re-fit's moved art is marked for review on top).
		const {
			cells: _cells,
			clips: _clips,
			inherited: _inherited,
			rerolls: _rerolls,
			...summary
		} = item.qa;
		item.qa.cells = {};
		item.qa.clips = {};
		item.qa.inherited = {
			clips: [...new Set(targets.map((key) => key.split('/').slice(0, 2).join('/')))],
			summary
		};
	}
	return { item, materials };
}

/** Same slot and same request: the same item for the wardrobe's purposes. */
export const itemKey = (item: Pick<Item, 'slot' | 'prompt' | 'name'>) =>
	`${item.slot}\n${(item.prompt.trim() || item.name).toLowerCase().replace(/\s+/g, ' ')}`;

/** How another character's item comes to `target`: an exact free copy, a free approximate re-fit, a free copy worn as drawn
 *  for the other body without fitting, or a new item made for it. */
export type SharedFit = 'copy' | 'refit' | 'unfitted' | 'remake';
/** Target cells (drawn views with a body) at a move, direction and frame the item covers on its source. */
function wanted(source: Manifest, item: Item, target: Manifest): string[] {
	const body = bodyOf(target)?.layers[0],
		out: string[] = [];
	for (const a of target.rig.animations)
		for (const { id: dir } of target.rig.directions.filter((d) => !d.mirrorOf))
			for (let i = 0; i < a.cells; i++)
				if (body?.cells?.[a.id]?.[dir]?.[i] && covered(source, item, a.id, dir, i))
					out.push(cellKey(a.id, dir, i));
	return out;
}
export interface UnfittedPlan {
	/** The source cell each target cell wears. */
	matches: CellMatch[];
	notes: UnfitNote[];
}
/** How a copy worn as drawn fills the target cells its art exists for, never scaling or moving pixels. Per view: only a view the
 *  item is drawn in (a mirrored one through its drawn view). Per frame: the same move (its frames spread over the target's
 *  count), else a move of the same kind (any walk for a walk); a one-frame standing move takes the item's standing frame.
 *  Anything else stays empty, so the item is hidden there, as an item's own missing frames are. Empty when the item has no art
 *  for this character at all, or its canvas could not be exported here. */
export function unfittedPlan(source: Manifest, item: Item, target: Manifest): UnfittedPlan {
	// A layer that cannot sit centered on a whole pixel, whose pivot falls outside it, or that grows past 256 px could not be
	// exported.
	const mirrored = target.rig.directions.some((d) => d.mirrorOf);
	if (
		item.layers.some((layer) => {
			const f = layerFrame(target.rig, asDrawn(source, target, layer));
			return (
				f.x < 0 ||
				f.x > f.w ||
				f.y < 0 ||
				f.y > f.h ||
				f.w > 256 ||
				f.h > 256 ||
				(mirrored && 2 * (target.rig.pivot.x - f.x) + f.w !== target.rig.cell.w)
			);
		})
	)
		return { matches: [], notes: [] };
	const body = bodyOf(target)?.layers[0],
		covers = (anim: string, dir: DirectionName, i: number) => covered(source, item, anim, dir, i),
		frames = (a: { cells: number }) => Array.from({ length: a.cells }, (_, i) => i),
		/** The item's standing frame facing `dir`: its standing move's, else its first frame (the demo has no standing move:
		 *  its walk starts standing, as its saved copy assumes). */
		standing = (dir: DirectionName) => {
			const still = standingMove(source, dir);
			if (still && covers(still, dir, 0)) return { anim: still, frame: 0 };
			for (const a of source.rig.animations)
				for (const i of frames(a)) if (covers(a.id, dir, i)) return { anim: a.id, frame: i };
		};
	const matches: CellMatch[] = [],
		notes = new Map<string, UnfitNote>(),
		note = (n: UnfitNote) => notes.set(stableStringify(n), n);
	for (const ta of target.rig.animations)
		for (const { id: dir } of target.rig.directions.filter((d) => !d.mirrorOf)) {
			const moves = [
				...source.rig.animations.filter((a) => a.id === ta.id),
				...source.rig.animations.filter((a) => a.id !== ta.id && actionOf(a.id) === actionOf(ta.id))
			];
			const still = ta.cells === 1 && standingMove(target, dir) === ta.id;
			for (const i of frames(ta)) {
				if (!body?.cells?.[ta.id]?.[dir]?.[i]) continue;
				let pick: { anim: string; frame: number } | undefined;
				for (const sa of moves) {
					const j = Math.floor((i * sa.cells) / ta.cells);
					if (!covers(sa.id, dir, j)) continue;
					pick = { anim: sa.id, frame: j };
					if (sa.id !== ta.id) note({ how: 'similar', anim: ta.id, from: sa.id });
					if (sa.cells !== ta.cells) note({ how: 'retimed', anim: ta.id, from: String(sa.cells) });
					break;
				}
				if (!pick && still) {
					pick = standing(dir);
					// Its own standing move needs no note; a frame of another move does.
					if (pick && pick.anim !== standingMove(source, dir))
						note({ how: 'standing', anim: ta.id, from: pick.anim });
				}
				if (pick)
					matches.push({
						target: cellKey(ta.id, dir, i),
						source: cellKey(pick.anim, dir, pick.frame)
					});
			}
		}
	if (matches.length && source.rig.cell.w !== target.rig.cell.w)
		note({ how: 'size', from: String(source.rig.cell.w) });
	return { matches, notes: [...notes.values()] };
}
/** How an item comes to a character, and the target cells it would cover there (the others hide it). */
export interface SharedChoice {
	fit: SharedFit;
	cells: string[];
}
/** An exact copy when it covers every cell the item covers on its source; otherwise whichever of the exact copy and a re-fit
 *  covers more cells (the exact copy on a tie: its pixels need no look); only when neither covers any, a copy worn as drawn.
 *  `refit` runs only when needed. */
async function choose(
	source: Manifest,
	item: Item,
	target: Manifest,
	copy: string[] | null,
	refit: () => Promise<string[] | null>
): Promise<SharedChoice> {
	if (copy && wanted(source, item, target).every((k) => copy.includes(k)))
		return { fit: 'copy', cells: copy };
	const fitted = refittable(item) ? await refit() : null;
	if (fitted && fitted.length > (copy?.length ?? 0)) return { fit: 'refit', cells: fitted };
	if (copy) return { fit: 'copy', cells: copy };
	const cells = unfittedPlan(source, item, target).matches.map((m) => m.target);
	return { fit: cells.length ? 'unfitted' : 'remake', cells };
}
/** A source layer on the target, unscaled. On the same frame size its pixels keep their place in the frame unless that leaves
 *  it off-center for mirrored views. Otherwise it
 *  keeps its own canvas, centered across the target cell (mirrored views flip the whole layer cell) with its pivot row on the
 *  target's, so the item stands on the same ground; when the widths differ by an odd number of px and the target mirrors, the
 *  canvas gains one transparent column on the right (`pad`) so it can center. */
function asDrawn(source: Manifest, target: Manifest, layer: Layer): Layer & { pad?: 1 } {
	const mirrored = target.rig.directions.some((d) => d.mirrorOf);
	if (stableStringify(source.rig.cell) === stableStringify(target.rig.cell)) {
		// Kept in place unless that leaves it off-center for mirrored views (a source that mirrors none padded it unevenly).
		const placed = onTarget(source, target, layer),
			f = layerFrame(target.rig, placed);
		if (!mirrored || 2 * (target.rig.pivot.x - f.x) + f.w === target.rig.cell.w) return placed;
	}
	const { w, h, y } = layerFrame(source.rig, layer),
		pad = mirrored && (target.rig.cell.w - w) % 2 ? 1 : 0,
		wide = w + pad;
	return {
		...layer,
		cell: { w: wide, h },
		pivot: { x: target.rig.pivot.x - Math.floor((target.rig.cell.w - wide) / 2), y },
		...(pad ? { pad: 1 as const } : {})
	};
}
/** The image with one transparent column added on the right. */
function padRight(im: Img): Img {
	const out = makeImg(im.w + 1, im.h);
	for (let y = 0; y < im.h; y++)
		out.data.set(im.data.subarray(y * im.w * 4, (y + 1) * im.w * 4), y * (im.w + 1) * 4);
	return out;
}
/** A free copy of `original` worn as drawn (see unfittedPlan): its source cells unchanged, at the same place in the frame. The
 *  source body's cuts, standing references and fit notes describe another body, so they are dropped. Null when no cell maps. */
async function unfittedCopy(
	source: Manifest,
	original: Item,
	variants: Preset['variants'],
	target: Manifest,
	flip: Flip,
	read: (hash: Sha256) => Promise<Img>
): Promise<CopyCandidate | null> {
	const plan = unfittedPlan(source, original, target);
	if (!plan.matches.length) return null;
	const { item, materials } = copyShell(
		source,
		original,
		variants,
		target,
		plan.matches.map((m) => m.target)
	);
	const padded = new Set<number>();
	item.layers = item.layers.map((layer, i) => {
		const { pad, ...placed } = asDrawn(source, target, layer);
		if (pad) padded.add(i);
		const out: Layer = { ...placed, cells: {} };
		delete out.sheets;
		return out;
	});
	await putCells(source, original, target, item, plan.matches, flip);
	const images = new Map<Sha256, Img>();
	for (const i of padded)
		for (const dirs of Object.values(item.layers[i].cells ?? {}))
			for (const row of Object.values(dirs ?? {}))
				for (const [j, h] of (row ?? []).entries()) {
					if (!h) continue;
					const im = padRight(await read(h)),
						wide = await cellHash(im);
					images.set(wide, im);
					row![j] = wide;
				}
	for (const key of ['baseCut', 'dressed', 'route', 'standing', 'anchorCell', 'refit'] as const)
		delete item[key];
	item.unfitted = plan.notes;
	return { item, materials, assessment: { matches: [], canExtend: false, fits: true }, images };
}
export async function sharedFit(
	source: Manifest,
	item: Item,
	target: Manifest,
	load: (hash: Sha256) => Promise<Img>
): Promise<SharedChoice> {
	const copy = await assessCopy(source, item, target, flipper(load).flip);
	return choose(source, item, target, copy.fits ? copy.matches.map((m) => m.target) : null, () =>
		refitCells(source, item, target, load)
	);
}

/** Copy an item of another saved character into `targetId` in one transaction: exact on an identical body, otherwise a free
 *  approximate fit when one exists, otherwise the item as drawn for the other body (both marked for review). Returns the new item, the copy this character already holds of it
 *  (a second tap while the first was saving), or null when it does not fit (nothing is written). Never generates anything. */
export async function acceptCopy(
	sourceId: string,
	itemId: string,
	targetId: string,
	bundled?: BundledSource
): Promise<Item | null> {
	if (!targetId.startsWith('rig-'))
		throw new Error('Make an editable copy of the demo to add items to it.');
	const [record, target] = await Promise.all([
		bundled
			? undefined
			: db.get<StoredProject & { dress?: { current?: Pick<Preset, 'variants'> } }>(
					'projects',
					sourceId
				),
		db.get<StoredProject>('projects', targetId)
	]);
	const source = bundled ?? record,
		original = source?.manifest.items.find((it) => it.id === itemId);
	if (!source || !original) throw new Error('That character or item was removed.');
	if (!target) throw new Error('This character was removed.');
	const variants =
		bundled?.variants ??
		record?.dress?.current?.variants ??
		source.manifest.presets[0]?.variants ??
		{};
	const { missing, load } = stored(original, bundled?.images);
	const { flip, made } = flipper(load);
	const copy = await prepareCopy(source.manifest, itemId, variants, target.manifest, flip),
		fitted: { refit?: CopyCandidate | null } = {};
	const { fit: how } = await choose(
		source.manifest,
		original,
		target.manifest,
		copy?.item.coverage ?? null,
		async () =>
			(fitted.refit = await refitShared(source.manifest, itemId, variants, target.manifest, load))
				?.item.coverage ?? null
	);
	const candidate =
		how === 'copy'
			? copy
			: how === 'refit'
				? fitted.refit
				: how === 'unfitted'
					? await unfittedCopy(
							source.manifest,
							original,
							variants,
							target.manifest,
							flip,
							async (h) => made.get(h) ?? (await load(h))
						)
					: null;
	if (!candidate) return null;
	const { item, materials } = candidate;
	// The paid calls were made for the first character an item was copied from. An exact copy of a re-fit keeps the re-fit's
	// notes too: its pixels and body are identical, so they still name exactly the frames to check.
	item.copiedFrom = original.copiedFrom ?? {
		id: sourceId,
		name: source.manifest.name,
		item: original.id
	};
	// A bundled source's images are not stored: they are written with the copy.
	const { blobs, keys } = await blobsOf(
		item,
		(h) => made.get(h) ?? candidate.images?.get(h) ?? bundled?.images.get(h)
	);
	let added = item;
	await db.updateCharacter<StoredProject>(
		targetId,
		blobs,
		(rec) => {
			if (!rec) throw new Error('This character was removed.');
			if (body(rec.manifest) !== body(target.manifest))
				throw new Error('This character changed while the item was being added. Try again.');
			const held = rec.manifest.items.find(
				(it) =>
					it.status === 'accepted' &&
					it.copiedFrom?.id === item.copiedFrom!.id &&
					itemKey(it) === itemKey(item)
			);
			if (held) {
				added = held;
				return rec;
			}
			// A slot only the source defines (a custom one) comes with its item.
			putItem(rec.manifest, item, [
				...slotLadder(rec.manifest.rig),
				...source.manifest.slots.filter((s) => s.id === item.slot)
			]);
			rec.manifest.materials.push(...materials);
			rec.savedAt = new Date().toISOString();
			return rec;
		},
		{ keys, missing }
	);
	return added;
}

/** Reads an item's stored images, naming the item when one is gone. */
function stored(item: Item, kept?: ReadonlyMap<string, Img>) {
	const missing = (h: string) =>
		new Error(`An image of ${item.name} is missing (${h.replace('sha256:', '').slice(0, 12)}).`);
	const load = async (h: Sha256) => {
		const im = kept?.get(h);
		if (im) return im;
		const blob = await db.getBlob(h.slice(7));
		if (!blob) throw missing(h);
		return decodePng(blob);
	};
	return { missing, load };
}
/** New images (flipped views, moved frames) are written with the item; the others are already stored and only checked, in the
 *  same transaction, so a concurrent deletion and cleanup of the source cannot sweep them. */
async function blobsOf(item: Item, made: (hash: Sha256) => Img | undefined) {
	const blobs = new Map<string, Blob>(),
		keys: string[] = [];
	for (const h of itemHashes(item)) {
		const im = made(h);
		if (im)
			blobs.set(
				h.slice(7),
				new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
			);
		else keys.push(h.slice(7));
	}
	return { blobs, keys };
}
const body = (m: Manifest) =>
	stableStringify({ rig: m.rig, body: m.items.find((it) => it.id === m.rig.baseItem) });

/** Cells an exact copy lacks here that its source item now covers on an identical body (moves the source gained after the
 *  copy), or null when there are none. A re-fit never takes more: its art was moved for this body, not copied. */
async function fromSource(target: Manifest, item: Item, flip: Flip) {
	const from = item.copiedFrom;
	if (!from?.item || item.refit || item.unfitted) return null;
	const rec = await db.get<StoredProject>('projects', from.id),
		source = rec?.manifest,
		original = source?.items.find((it) => it.id === from.item);
	if (
		!source ||
		!original ||
		original.status !== 'accepted' ||
		original.baseHash !== source.rig.baseHash ||
		original.layers.length !== item.layers.length
	)
		return null;
	const have = new Set<string>(item.coverage ?? []),
		matches = (await assessCopy(source, original, target, flip)).matches.filter(
			(m) => !have.has(m.target)
		);
	return matches.length ? { source, original, matches } : null;
}

/** How many frames each exact copy of `target` can take from its source for free, by item id (copies with none left out). */
export async function freeFrames(target: Manifest): Promise<Record<string, number>> {
	const out: Record<string, number> = {};
	for (const item of target.items) {
		if (item.status !== 'accepted' || !item.copiedFrom?.item || item.refit || item.unfitted)
			continue;
		const found = await fromSource(target, item, flipper(stored(item).load).flip);
		if (found) out[item.id] = found.matches.length;
	}
	return out;
}

/** Adds to an exact copy, in place, the frames its source item now has for this body (same item: its colors, outfits and
 *  own frames stay). Returns how many frames were added (0 when none are left). Never generates anything. */
export async function copyMoreFrames(targetId: string, itemId: string): Promise<number> {
	const target = await db.get<StoredProject>('projects', targetId),
		item = target?.manifest.items.find((it) => it.id === itemId);
	if (!target || !item) throw new Error('That item was removed.');
	const { missing, load } = stored(item);
	const { flip, made } = flipper(load);
	const found = await fromSource(target.manifest, item, flip);
	if (!found) return 0;
	const { source, original, matches } = found,
		next = structuredClone(item);
	await putCells(source, original, target.manifest, next, matches, flip);
	next.coverage = [...(next.coverage ?? []), ...(matches.map((m) => m.target) as CellKey[])];
	if (next.qa && original.qa) {
		// Each added move keeps its source move's checks (the art is the same), else the source's summary, as a copy does.
		const clips: ItemQa['clips'] = {};
		for (const m of matches)
			clips[clipOf(m.target)] ??= original.qa.clips[clipOf(m.source)] ?? summaryOf(original.qa);
		next.qa = mergeQa(next, { ...summaryOf(original.qa), rerolls: 0, cells: {}, clips }, {});
	}
	const { blobs, keys } = await blobsOf(next, (h) => made.get(h));
	await db.updateCharacter<StoredProject>(
		targetId,
		blobs,
		(rec) => {
			const at = rec?.manifest.items.findIndex((it) => it.id === itemId) ?? -1;
			if (!rec || at < 0) throw new Error('That item was removed.');
			if (
				body(rec.manifest) !== body(target.manifest) ||
				stableStringify(rec.manifest.items[at]) !== stableStringify(item)
			)
				throw new Error('This character changed while the frames were being copied. Try again.');
			rec.manifest.items[at] = next;
			rec.savedAt = new Date().toISOString();
			return rec;
		},
		{ keys, missing }
	);
	return matches.length;
}
