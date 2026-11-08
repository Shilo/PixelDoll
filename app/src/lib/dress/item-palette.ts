// Explicit, local color matching for an existing item. Source ramps and variants never change.
import type { Img } from '../image/png.ts';
import type { Item, Material } from '../store/manifest.ts';
import { colorCounts, fromHex, lab, OUTLINE_C, OUTLINE_L } from './palette.ts';

export const ITEM_PALETTE_POLICY = 'neutral-owned-v1' as const;
const channels = (c: number) => [c >> 16, (c >> 8) & 255, c & 255];

/** Match close owned shades without merging a visible color boundary. Context must cover every same-facing frame to map. */
export function standingDyeMatcher(
	standing: ReadonlySet<number>,
	owned: ReadonlySet<number>,
	context: readonly Img[]
) {
	if (!standing.size || !owned.size) return (image: Img) => image;
	const palette = [...standing].map((color) => ({ color, rgb: channels(color) }));
	const matches = new Map<number, number>();
	const colorAt = (image: Img, i: number) =>
		image.data[i] * 65536 + image.data[i + 1] * 256 + image.data[i + 2];
	for (const color of colorCounts(context).keys()) {
		if (standing.has(color) || owned.has(color)) continue;
		const src = channels(color);
		const ranked = palette
			.map((entry) => {
				const deltas = entry.rgb.map((channel, j) => Math.abs(channel - src[j]));
				return { color: entry.color, max: Math.max(...deltas), distance: Math.hypot(...deltas) };
			})
			.sort((a, b) => a.distance - b.distance);
		const [best, next] = ranked;
		// Unowned shades compete so an outline cannot acquire a dye ramp by proximity alone.
		if (
			best &&
			owned.has(best.color) &&
			best.max <= 12 &&
			(!next || next.distance - best.distance >= 3)
		)
			matches.set(color, best.color);
	}
	if (!matches.size) return (image: Img) => image;
	const veto = new Set<number>();
	for (const image of context)
		for (let y = 0; y < image.h; y++)
			for (let x = 0; x < image.w; x++) {
				const i = (y * image.w + x) * 4;
				if (!image.data[i + 3]) continue;
				const color = colorAt(image, i);
				for (const j of [x + 1 < image.w ? i + 4 : -1, y + 1 < image.h ? i + image.w * 4 : -1]) {
					if (j < 0 || !image.data[j + 3]) continue;
					const neighbor = colorAt(image, j);
					if (
						color !== neighbor &&
						(matches.get(color) ?? color) === (matches.get(neighbor) ?? neighbor)
					) {
						if (matches.has(color)) veto.add(color);
						if (matches.has(neighbor)) veto.add(neighbor);
					}
				}
			}
	// Reverting a proposal cannot create another collision: changed source colors are outside the standing palette,
	// while every replacement is inside it. Veto throughout the clip to avoid frame-dependent shade choices.
	for (const color of veto) matches.delete(color);
	return (image: Img): Img => {
		let data: Img['data'] | undefined;
		for (let i = 0; i < image.data.length; i += 4) {
			if (!image.data[i + 3]) continue;
			const match = matches.get(colorAt(image, i));
			if (match === undefined) continue;
			data ??= image.data.slice();
			data.set(channels(match), i);
		}
		return data ? { ...image, data } : image;
	};
}

const neutral = (c: number) => {
	const [L, a, b] = lab(c),
		r = c >> 16,
		g = (c >> 8) & 255,
		blue = c & 255;
	// A small warm allowance includes off-white steel. Muted green/brown guards are excluded.
	return L >= OUTLINE_L && Math.hypot(a, b) <= OUTLINE_C && blue >= r - 4 && blue >= g - 4;
};
export function itemPaletteMatcher(item: Pick<Item, 'id' | 'materials'>, materials: Material[]) {
	const candidates = materials.filter(
		(m) =>
			m.owner === item.id &&
			item.materials.includes(m.id) &&
			m.ramp.length &&
			m.ramp.every((h) => neutral(fromHex(h)))
	);
	if (candidates.length !== 1)
		throw new Error(
			'Color matching needs exactly one neutral material owned by this item. Existing colors were kept.'
		);
	const material = candidates[0],
		ramp = material.ramp.map(fromHex),
		claimed = new Set(materials.flatMap((m) => m.ramp.map(fromHex)));
	const cache = new Map<number, number | null | undefined>();
	const match = (c: number): number | null | undefined => {
		// undefined = already owned or outside the supported color family; null = eligible but unsafe/ambiguous.
		if (cache.has(c)) return cache.get(c);
		let result: number | null | undefined;
		if (!claimed.has(c) && neutral(c)) {
			const src = channels(c);
			const sorted = ramp
				.map((v) => ({ v, ds: channels(v).map((x, i) => Math.abs(x - src[i])) }))
				.map((v) => ({ ...v, d: v.ds.reduce((s, x) => s + x * x, 0) }))
				.sort((a, b) => a.d - b.d);
			result =
				Math.max(...sorted[0].ds) <= 24 && (sorted.length === 1 || sorted[0].d !== sorted[1].d)
					? sorted[0].v
					: null;
		}
		cache.set(c, result);
		return result;
	};
	return {
		materialId: material.id,
		apply(im: Img) {
			const image: Img = { ...im, data: im.data.slice() };
			let changedPixels = 0,
				unmatchedPixels = 0;
			for (let i = 0; i < image.data.length; i += 4)
				if (image.data[i + 3]) {
					const c = (image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2],
						next = match(c);
					if (next === null) unmatchedPixels++;
					else if (next !== undefined) {
						image.data[i] = next >> 16;
						image.data[i + 1] = (next >> 8) & 255;
						image.data[i + 2] = next & 255;
						changedPixels++;
					}
				}
			return { image, changedPixels, unmatchedPixels };
		}
	};
}

// History can outlive a removed move/material; validate its bounded shape rather than live references.
export function validPaletteRepairs(value: unknown): boolean {
	const record = (v: unknown): v is Record<string, unknown> =>
		!!v && typeof v === 'object' && !Array.isArray(v);
	const safeId = (v: unknown) =>
		typeof v === 'string' && v.length <= 200 && /^[a-z0-9][a-z0-9_-]*$/.test(v);
	const hash = (v: unknown) => typeof v === 'string' && /^sha256:[0-9a-f]{64}$/.test(v);
	if (!Array.isArray(value) || value.length > 1000) return false;
	return value.every((repair: unknown) => {
		if (
			!record(repair) ||
			repair.version !== 'neutral-owned-v1' ||
			!safeId(repair.materialId) ||
			!safeId(repair.anim) ||
			![
				'south',
				'south-east',
				'east',
				'north-east',
				'north',
				'north-west',
				'west',
				'south-west'
			].includes(repair.dir as string) ||
			!Array.isArray(repair.frames) ||
			!repair.frames.length ||
			repair.frames.length > 1000
		)
			return false;
		const cells = new Set<number>();
		return repair.frames.every((frame: unknown) => {
			if (
				!record(frame) ||
				!Number.isSafeInteger(frame.cell) ||
				(frame.cell as number) < 0 ||
				cells.has(frame.cell as number) ||
				!Array.isArray(frame.layers) ||
				!frame.layers.length ||
				frame.layers.length > 3 ||
				!Number.isInteger(frame.changedPixels) ||
				(frame.changedPixels as number) < 1 ||
				(frame.changedPixels as number) > frame.layers.length * 256 * 256
			)
				return false;
			cells.add(frame.cell as number);
			const layers = new Set<string>();
			return frame.layers.every((layer: unknown) => {
				if (
					!record(layer) ||
					!['main', 'fg', 'bg'].includes(layer.id as string) ||
					layers.has(layer.id as string) ||
					!hash(layer.before) ||
					!hash(layer.after) ||
					layer.before === layer.after
				)
					return false;
				layers.add(layer.id as string);
				return true;
			});
		});
	});
}
