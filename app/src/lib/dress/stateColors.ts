// States on the body's colors. Recolors swap exact body colors, and a State PixelLab redrew has its own shading, so a
// recolor reaches only the pixels that happen to match. New States are matched when saved; ones saved before that are
// found here and matched through Fix frames (one undoable step).
import type { Img } from '../image/png.ts';
import { bodyColorSnapper } from '../rig/palette.ts';
import type { Project } from '../store/manifest.ts';
import { isGarment, withoutRegions } from './regions.ts';

const states = (p: Project) =>
	new Set(p.manifest.rig.animations.filter((a) => a.kind === 'state').map((a) => a.id));

/** Matches one body image (region marks cleared) to the body's own colors: its recolor ramps and every base frame except
 *  States, which may not be on them yet. Undefined when the body has no frames to match against. */
export function stateColorMatcher(p: Project): ((image: Img) => Img) | undefined {
	const { rig, items } = p.manifest,
		base = items.find((i) => i.id === rig.baseItem),
		skip = states(p);
	const reference = Object.entries(base?.layers[0]?.cells ?? {})
		.filter(([clip]) => !skip.has(clip))
		.flatMap(([, dirs]) => Object.values(dirs ?? {}).flat())
		.flatMap((hash) => {
			const image = hash && p.images.get(hash);
			return image ? [withoutRegions(image)] : [];
		});
	if (!reference.some((image) => image.data.some((v, i) => i % 4 === 3 && v))) return undefined;
	// A color already in a body recolor ramp is recolored with the body wherever it is, so it stays.
	const ramps = new Set(
		p.manifest.materials
			.filter((material) => material.owner === base?.id)
			.flatMap((material) => material.ramp.map((hex) => parseInt(hex.slice(1), 16)))
			.map((c) => (isGarment(c) ? c & ~1 : c))
	);
	const snap = bodyColorSnapper(reference, ramps);
	return (image) => snap(withoutRegions(image));
}

const drift = new Map<string, boolean>();
/** Whether matching would change any visible pixel of State `anim` (region marks aside). Remembered per body version. */
export function stateColorDrift(p: Project, anim: string): boolean {
	const { rig, items } = p.manifest;
	if (!states(p).has(anim)) return false;
	const key = `${rig.baseHash}|${anim}`;
	const known = drift.get(key);
	if (known !== undefined) return known;
	const cells = Object.values(
		items.find((i) => i.id === rig.baseItem)?.layers[0]?.cells?.[anim] ?? {}
	).flat();
	const match = cells.length ? stateColorMatcher(p) : undefined;
	const result =
		!!match &&
		cells.some((hash) => {
			const image = hash && p.images.get(hash);
			if (!image) return false;
			const before = withoutRegions(image),
				after = match(image);
			return after.data.some((v, i) => v !== before.data[i]);
		});
	if (drift.size > 64) drift.clear();
	drift.set(key, result);
	return result;
}
