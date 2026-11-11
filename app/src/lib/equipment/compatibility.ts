// Free sharing between characters: an item copies only onto byte-identical frozen body cells. Stored cells are
// content-addressed by their RGBA hash, so manifests decide; only a view one character mirrors and the other draws needs
// its flipped image's hash.
import { layerFrame } from '../compose/compose.ts';
import { cellKey, type DirectionName, type Sha256 } from '../rig/rig.ts';
import { stableStringify } from '../image/hash.ts';
import { canPose, SLOTS } from '../items/items.ts';
import type { CellKey, Item, Layer, Manifest } from '../store/manifest.ts';

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
/** The target draws the slot like the source: same class and anchor. */
export const sameSlot = (source: Manifest, target: Manifest, id: string) => {
	const slot = slotOf(target, id),
		from = source.slots.find((s) => s.id === id);
	return !!slot && !!from && slot.class === from.class && slot.anchor === from.anchor;
};
/** The item covers a cell of its character (a mirrored view through its drawn source view). */
export const covered = (m: Manifest, item: Item, anim: string, dir: DirectionName, i: number) =>
	[dir, m.rig.directions.find((d) => d.id === dir)?.mirrorOf ?? dir].some((d) =>
		item.coverage?.includes(cellKey(anim, d, i) as CellKey)
	);

export async function assessCopy(
	source: Manifest,
	item: Item,
	target: Manifest,
	flip: Flip
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
						};
						out.set(hash, [...(out.get(hash) ?? []), entry]);
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
					cells.map(async (i) => (await hashAt(source, sb.layers[0], sa.id, dir, i)) === bodies[i])
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
				const candidates = index.get(bodies[i]!) ?? [];
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
