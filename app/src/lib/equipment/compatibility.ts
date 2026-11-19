// Free sharing between characters: an item copies only onto byte-identical frozen body cells. Stored cells are
// content-addressed by their RGBA hash, so manifests decide; only a view one character mirrors and the other draws needs
// its flipped image's hash.
import { layerFrame } from '../compose/compose.ts';
import { withoutRegions } from '../dress/regions.ts';
import type { Img } from '../image/png.ts';
import { cellHash, cellKey, type DirectionName, type Sha256 } from '../rig/rig.ts';
import { stableStringify } from '../image/hash.ts';
import { canPose, SLOTS, slotLadder } from '../items/items.ts';
import type { CellKey, Item, Layer, Manifest, Slot } from '../store/manifest.ts';

export interface CellMatch {
	target: string;
	source: string;
}
export interface CopyAssessment {
	/** Target cells whose body equals a source cell, and the source cell whose item art they take. */
	matches: CellMatch[];
	/** The target's standing views equal the source's, so later moves can be generated for the copy like any item. */
	canExtend: boolean;
	/** Some body cells are identical, so a free copy covers them. Moves the item lacks here, as on its source, stay missing
	 *  like any item's and are made through the normal item path. */
	fits: boolean;
}
/** The hash of a stored image flipped horizontally. */
export type Flip = (hash: Sha256) => Promise<Sha256>;
/** Images for a comparison: `load` reads a stored image, or one `flip` made. */
export interface Frames {
	flip: Flip;
	load: (hash: Sha256) => Promise<Img>;
}

/** A cell's content hash: stored, or its mirror source's image flipped (null = transparent or absent). */
export async function cellId(
	m: Manifest,
	layer: Layer,
	anim: string,
	dir: DirectionName,
	i: number,
	flip: Flip
): Promise<Sha256 | null> {
	const stored = layer.cells?.[anim]?.[dir];
	if (stored) return stored[i] ?? null;
	const src = m.rig.directions.find((d) => d.id === dir)?.mirrorOf;
	const id = src ? await cellId(m, layer, anim, src, i, flip) : null;
	return id && flip(id);
}
export const bodyOf = (m: Manifest) => m.items.find((it) => it.id === m.rig.baseItem);
const geometry = (m: Manifest) =>
	stableStringify({
		cell: m.rig.cell,
		pivot: m.rig.pivot,
		body: bodyOf(m) && layerFrame(m.rig, bodyOf(m)!.layers[0])
	});
/** Same canvas, pivot and body layer frame, and the same camera when both record one. */
export const sameGeometry = (source: Manifest, target: Manifest) =>
	geometry(source) === geometry(target) &&
	(!source.rig.view || !target.rig.view || source.rig.view === target.rig.view) &&
	(!source.rig.template || !target.rig.template || source.rig.template === target.rig.template);
const slotOf = (m: Manifest, id: string) =>
	m.slots.find((s) => s.id === id) ?? SLOTS.find((s) => s.id === id);
/** Same behavior: the item needs the same attachment and generation profile, not the same label or browsing order. */
const sameMeaning = (a: Slot, b: Slot) =>
	a.class === b.class && a.anchor === b.anchor && (a.profile ?? a.id) === (b.profile ?? b.id);
/** The target draws the slot like the source: same class, anchor and behavior profile. A custom slot the target lacks is
 *  adoptable (see copySlotPlan), so it is compatible before the item is added there. */
export const sameSlot = (source: Manifest, target: Manifest, id: string) => {
	const from = slotOf(source, id),
		to = slotOf(target, id);
	return !!from && (!to || sameMeaning(from, to));
};
/** What a shared item needs from the target's slot list, and the definition its layers should resolve against. */
export interface SlotCopyPlan {
	/** The source definition the item's layer depths were made for. */
	from: Slot;
	/** The target definition to draw it with: the existing one, or the adopted/new ladder one. */
	to: Slot;
	/** The definition to insert when the target has no explicit definition of this ID yet. */
	add?: Slot;
}
/** The end of a Wardrobe list, as the manager computes it, so an adopted category is shown at the end. */
function nextWardrobeOrder(m: Pick<Manifest, 'slots' | 'rig'>): number {
	const defaults = new Map(SLOTS.map((s) => [s.id, s.wardrobeOrder ?? 0])),
		all = [...slotLadder(m.rig), ...m.slots];
	return Math.max(-1, ...all.map((s) => s.wardrobeOrder ?? defaults.get(s.id) ?? SLOTS.length)) + 1;
}
/**
 * The slot definition a copied item uses in the target. A custom source slot the target lacks comes with the item, keeping
 * its label, behavior profile and depths; a built-in the target lacks uses the target's own ladder. An existing category
 * with the same ID must mean the same thing: adopting over a different behavior would put the item in the wrong place.
 * Throws an actionable message instead of guessing.
 */
export function copySlotPlan(
	source: Manifest,
	target: Manifest,
	id: string,
	sourceName = 'the source'
): SlotCopyPlan {
	const from = slotOf(source, id);
	if (!from) throw new Error(`Unknown equipment slot: ${id}`);
	const existing = target.slots.find((s) => s.id === id);
	if (existing) {
		if (!sameMeaning(from, existing))
			throw new Error(
				`This character’s “${existing.label ?? id}” category does not attach items like ${sourceName}’s “${from.label ?? id}”. Use another character, or remove the conflicting custom category first.`
			);
		return { from, to: existing };
	}
	const builtin = SLOTS.find((s) => s.id === id);
	if (builtin) {
		if (!sameMeaning(from, builtin))
			throw new Error(
				`This character’s “${builtin.label ?? id}” category does not attach items like ${sourceName}’s “${from.label ?? id}”. Choose another category or character.`
			);
		const ladder = slotLadder(target.rig).find((s) => s.id === id) ?? builtin;
		return { from, to: ladder, add: ladder };
	}
	const adopted = structuredClone(from);
	const label = (adopted.label ?? adopted.id).trim().toLowerCase();
	if (
		[...SLOTS, ...target.slots].some(
			(slot) => slot.id !== id && (slot.label ?? slot.id).trim().toLowerCase() === label
		)
	)
		throw new Error(
			`Another category is already called ${adopted.label ?? adopted.id}. Rename the source category before copying its item.`
		);
	adopted.wardrobeHidden = false;
	adopted.wardrobeOrder = nextWardrobeOrder(target);
	return { from, to: adopted, add: adopted };
}
/** A target slot still matches the definition an item was prepared against (depth included, since item layers use it). */
export const sameSlotDefinition = (a: Slot, b: Slot) =>
	sameMeaning(a, b) && a.z === b.z && a.bgZ === b.bgZ;
/** The item covers a cell of its character (a mirrored view through its drawn source view). */
export const covered = (m: Manifest, item: Item, anim: string, dir: DirectionName, i: number) =>
	[dir, m.rig.directions.find((d) => d.id === dir)?.mirrorOf ?? dir].some((d) =>
		item.coverage?.includes(cellKey(anim, d, i) as CellKey)
	);

// A body image's hash without its region marks. A hash names exact pixels, so an entry never goes stale.
const unmarked = new Map<Sha256, Promise<Sha256>>();
function unmarkedId(hash: Sha256, load: Frames['load']): Promise<Sha256> {
	let id = unmarked.get(hash);
	if (!id) {
		if (unmarked.size >= 4096) unmarked.clear();
		const read = load(hash).then(
			(im) => cellHash(withoutRegions(im)),
			(error: unknown) => {
				// An unreadable image proves nothing: the frame compares by its stored hash, as it did before.
				console.warn('body frame compared with its marks', hash, error);
				if (unmarked.get(hash) === read) unmarked.delete(hash);
				return hash;
			}
		);
		unmarked.set(hash, (id = read));
	}
	return id;
}
/** One body, saved twice: the characters share a registered standing reference or a stored body frame, or (every frame
 *  marked again) the first frame both store for a move and direction is the same without its marks. */
async function sameOrigin(
	source: Manifest,
	target: Manifest,
	load: Frames['load']
): Promise<boolean> {
	const frames = (m: Manifest) => bodyOf(m)?.layers[0].cells ?? {};
	const images = (m: Manifest) => [
		...Object.values(m.rig.rest ?? {}).map((view) => view?.image),
		...Object.values(frames(m)).flatMap((dirs) =>
			Object.values(dirs ?? {}).flatMap((row) => row ?? [])
		)
	];
	const known = new Set(images(target));
	if (images(source).some((hash) => !!hash && known.has(hash))) return true;
	for (const [anim, dirs] of Object.entries(frames(target)))
		for (const [dir, row] of Object.entries(dirs ?? {})) {
			const theirs = frames(source)[anim]?.[dir as DirectionName]?.[0],
				mine = row?.[0];
			if (theirs && mine)
				return (await unmarkedId(theirs, load)) === (await unmarkedId(mine, load));
		}
	return false;
}

export async function assessCopy(
	source: Manifest,
	item: Item,
	target: Manifest,
	{ flip, load }: Frames
): Promise<CopyAssessment> {
	const sb = bodyOf(source),
		tb = bodyOf(target);
	if (!sb || !tb) throw new Error('A character is missing its frozen body.');
	const sourceDir = (dir: DirectionName) =>
		source.rig.directions.find((d) => d.id === dir)?.mirrorOf ?? dir;
	const covers = (anim: string, dir: DirectionName, i: number) =>
		covered(source, item, anim, dir, i);
	const hashAt = (m: Manifest, layer: Layer, anim: string, dir: DirectionName, i: number) =>
		cellId(m, layer, anim, dir, i, flip);
	// The equipment raster of every layer: equal signatures are interchangeable, different ones are an ambiguous choice.
	const signature = async (anim: string, dir: DirectionName, cells: number[]) =>
		stableStringify(
			await Promise.all(
				item.layers.map(async (l) => ({
					geometry: layerFrame(source.rig, l),
					cells: await Promise.all(cells.map((i) => hashAt(source, l, anim, dir, i)))
				}))
			)
		);
	const hasLayer = (anim: string, dir: DirectionName, cells: number) =>
		item.layers.some(
			(l) => (l.cells?.[anim]?.[dir] ?? l.cells?.[anim]?.[sourceDir(dir)])?.length === cells
		);
	const compatible = sameGeometry(source, target) && sameSlot(source, target, item.slot);
	// The color split writes shirt and shorts marks into the body's pixels, and writes them again with every added move
	// (splitBase votes over all frames), so one body can be stored with different marks on two characters. Characters of one
	// origin compare their bodies without the marks; unrelated ones read at most one frame each.
	const related = compatible && (await sameOrigin(source, target, load));
	const bodyId = (hash: Sha256) => (related ? unmarkedId(hash, load) : hash);
	const sameBody = async (a: Sha256 | null, b: Sha256 | null) =>
		!!a && !!b && (a === b || (related && (await bodyId(a)) === (await bodyId(b))));
	const targetDirs = target.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id);
	const matches: CellMatch[] = [],
		clipDirs: Record<string, DirectionName[]> = {};
	// Source cells by body hash, per direction, for clips whose lengths or names differ.
	const byBody = new Map<
		DirectionName,
		Promise<Map<Sha256, { key: string; signature: string }[]>>
	>();
	const sourceIndex = (dir: DirectionName) => {
		let index = byBody.get(dir);
		if (!index) {
			index = (async () => {
				const out = new Map<Sha256, { key: string; signature: string }[]>();
				for (const a of source.rig.animations) {
					if (!hasLayer(a.id, dir, a.cells)) continue;
					for (let i = 0; i < a.cells; i++) {
						const hash = covers(a.id, dir, i) && (await hashAt(source, sb.layers[0], a.id, dir, i));
						if (!hash) continue;
						const entry = {
								key: cellKey(a.id, dir, i),
								signature: await signature(a.id, dir, [i])
							},
							id = await bodyId(hash);
						out.set(id, [...(out.get(id) ?? []), entry]);
					}
				}
				return out;
			})();
			byBody.set(dir, index);
		}
		return index;
	};
	for (const ta of target.rig.animations) {
		clipDirs[ta.id] = [];
		for (const dir of targetDirs) {
			const cells = Array.from({ length: ta.cells }, (_, i) => i),
				bodies = await Promise.all(cells.map((i) => hashAt(target, tb.layers[0], ta.id, dir, i)));
			if (!bodies.some(Boolean)) continue;
			clipDirs[ta.id].push(dir);
			if (bodies.some((b) => !b) || !compatible) continue;
			const possible: { anim: string; signature: string }[] = [];
			for (const sa of source.rig.animations) {
				if (sa.cells !== ta.cells || !hasLayer(sa.id, dir, sa.cells)) continue;
				if (!cells.every((i) => covers(sa.id, dir, i))) continue;
				const same = await Promise.all(
					cells.map(async (i) =>
						sameBody(await hashAt(source, sb.layers[0], sa.id, dir, i), bodies[i])
					)
				);
				if (same.every(Boolean))
					possible.push({ anim: sa.id, signature: await signature(sa.id, dir, cells) });
			}
			// An equal named clip wins; differently named clips only when they agree on the equipment.
			const chosen =
				possible.find((p) => p.anim === ta.id) ??
				(new Set(possible.map((p) => p.signature)).size === 1 ? possible[0] : undefined);
			if (chosen) {
				for (const i of cells)
					matches.push({ source: cellKey(chosen.anim, dir, i), target: cellKey(ta.id, dir, i) });
				continue;
			}
			// Different clip lengths can still share an unambiguous frozen pose (a repeated standing cell).
			const index = await sourceIndex(dir);
			for (const i of cells) {
				const candidates = index.get(await bodyId(bodies[i]!)) ?? [];
				if (new Set(candidates.map((c) => c.signature)).size === 1)
					matches.push({ target: cellKey(ta.id, dir, i), source: candidates[0].key });
			}
		}
	}
	const canExtend =
		!!target.rig.rest &&
		!!item.dressed &&
		canPose(target.rig, {
			anims: target.rig.animations.filter((a) => clipDirs[a.id].length).map((a) => a.id),
			dirs: targetDirs,
			clipDirs
		}) &&
		targetDirs.every(
			(d) =>
				!!item.dressed?.[d] &&
				stableStringify(target.rig.rest?.[d]) === stableStringify(source.rig.rest?.[d])
		);
	return {
		matches,
		canExtend,
		fits: matches.length > 0
	};
}
