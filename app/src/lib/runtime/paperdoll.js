/**
 * @typedef {import('./types.d.ts').Img} Img
 * @typedef {import('./types.d.ts').DirectionName} DirectionName
 * @typedef {import('./types.d.ts').Item} Item
 * @typedef {import('./types.d.ts').Layer} Layer
 * @typedef {import('./types.d.ts').Manifest} Manifest
 * @typedef {import('./types.d.ts').Preset} Preset
 * @typedef {import('./types.d.ts').Project} Project
 * @typedef {import('./types.d.ts').Rig} Rig
 * @typedef {import('./types.d.ts').Slot} Slot
 * @typedef {{ item: Item, layer: Layer, slot: Slot, z: number, under: Item[] }} Draw
 * @typedef {{ w: number, h: number, x: number, y: number }} Frame
 */
/**
 * @param {number} w
 * @param {number} h
 * @returns {Img}
 */
const makeImg = (w, h) => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
/**
 * @param {Img} im
 * @returns {Img}
 */
export function flipH(im) {
	const o = makeImg(im.w, im.h);
	for (let y = 0; y < im.h; y++)
		for (let x = 0; x < im.w; x++) {
			const s = (y * im.w + x) * 4;
			o.data.set(im.data.subarray(s, s + 4), (y * im.w + (im.w - 1 - x)) * 4);
		}
	return o;
}
/**
 * @param {Pick<Rig, 'cell' | 'pivot'>} rig
 * @returns {Frame}
 */
export const rigFrame = (rig) => ({
	...rig.cell,
	...rig.pivot
});
/**
 * @param {Pick<Rig, 'cell' | 'pivot'>} rig
 * @param {Pick<Layer, 'cell' | 'pivot'>} l
 * @returns {Frame}
 */
export const layerFrame = (rig, l) => ({ ...rig.cell, ...rig.pivot, ...l.cell, ...l.pivot });
/**
 * @param {Frame[]} fs
 * @returns {Frame}
 */
export function unionFrame(fs) {
	const x = Math.max(...fs.map((f) => f.x)),
		y = Math.max(...fs.map((f) => f.y));
	return {
		x,
		y,
		w: x + Math.max(...fs.map((f) => f.w - f.x)),
		h: y + Math.max(...fs.map((f) => f.h - f.y))
	};
}
/**
 * @param {Manifest} m
 * @returns {Frame}
 */
export const bakedFrame = (m) =>
	unionFrame([
		rigFrame(m.rig),
		...m.items.flatMap((it) => it.layers.map((l) => layerFrame(m.rig, l)))
	]);
/**
 * @param {Manifest} m
 * @param {Preset['items']} items
 * @returns {Item[]}
 */
export function equipped(m, items) {
	return m.items.filter((it) => it.id === m.rig.baseItem || items[it.slot] === it.id);
}
/**
 * @param {Manifest} m
 * @param {Item} it
 */
const hidesOf = (m, it) => it.hides ?? m.slots.find((x) => x.id === it.slot)?.hides ?? [];
/**
 * @param {Manifest} m
 * @param {Item[]} items
 * @returns {Set<string>}
 */
export function hiddenSlots(m, items) {
	/** @param {string} slot */
	const at = (slot) => m.slots.findIndex((s) => s.id === slot);
	const out = new Set(/** @type {string[]} */ ([]));
	for (const it of items) {
		const mine = hidesOf(m, it);
		if (
			items.some(
				(o) =>
					o !== it &&
					mine.includes(o.slot) &&
					hidesOf(m, o).includes(it.slot) &&
					at(o.slot) > at(it.slot)
			)
		)
			continue;
		for (const s of mine) out.add(s);
	}
	return out;
}
export const OTHER_HAND = /** @type {Readonly<Record<string, string>>} */ ({
	main_hand: 'off_hand',
	off_hand: 'main_hand'
});
/**
 * @param {Manifest} m
 * @param {Item} it
 */
export const twoHanded = (m, it) =>
	!!OTHER_HAND[it.slot] && hidesOf(m, it).includes(OTHER_HAND[it.slot]);
/**
 * @param {Manifest} m
 * @param {Preset['items']} items
 * @param {string} [keep]
 * @returns {{ items: Preset['items']; removed?: Item; by?: Item; }}
 */
export function settleHands(m, items, keep) {
	/** @param {string} slot */
	const worn = (slot) => m.items.find((i) => i.id === items[slot] && i.slot === slot);
	const main = worn('main_hand'),
		off = worn('off_hand');
	if (!main || !off || (!twoHanded(m, main) && !twoHanded(m, off))) return { items };
	const [removed, by] = keep === 'off_hand' ? [main, off] : [off, main];
	return { items: { ...items, [removed.slot]: null }, removed, by };
}
/**
 * @param {Manifest} m
 * @param {Item[]} on
 * @param {string} slot
 */
export const tuckers = (m, on, slot) =>
	on.filter(
		(c) => c.slot !== slot && (m.slots.find((s) => s.id === c.slot)?.clips ?? []).includes(slot)
	);
/**
 * @param {string} item
 * @param {string | ReadonlyArray<string>} over
 */
export const tuckedId = (item, over) =>
	`${item}~${typeof over === 'string' ? over : over.join('~')}`;
/**
 * @param {Pick<Item, 'under' | 'underAll'>} item
 * @returns {string[]}
 */
export const variantCovers = (item) => item.underAll ?? (item.under ? [item.under] : []);
/**
 * @param {Manifest} m
 * @param {Item[]} on
 * @returns {Item[]}
 */
export const shownItems = (m, on) =>
	on.map((it) => {
		const covers = new Set(
			(it.id === m.rig?.baseItem
				? on.filter((c) => c.baseHash === m.rig.baseHash && affectsBody(m, c))
				: tuckers(m, on, it.slot)
			).map((c) => c.id)
		);
		let shown = it,
			count = 0;
		for (const variant of m.items) {
			const required = variantCovers(variant);
			if (
				variant.variantOf === it.id &&
				required.length > count &&
				required.every((id) => covers.has(id))
			) {
				shown = variant;
				count = required.length;
			}
		}
		return shown;
	});
/**
 * @param {Manifest} m
 * @param {Item} item
 */
export const affectsBody = (m, item) =>
	!!item.baseCut || (m.slots.find((s) => s.id === item.slot)?.clips ?? []).includes('body');
/**
 * @param {Manifest} m
 * @param {Item} item
 * @param {string} anim
 * @param {DirectionName} dir
 * @param {number} cell
 * @returns {number[] | null}
 */
export function cutAt(m, item, anim, dir, cell) {
	const stored = item.baseCut?.[anim]?.[dir];
	if (stored) return stored[cell] ?? null;
	const src = m.rig.directions.find((d) => d.id === dir)?.mirrorOf,
		w = m.rig.cell.w,
		s = src ? cutAt(m, item, anim, src, cell) : null;
	return s && s.map((p) => p - 2 * (p % w) + w - 1);
}
/**
 * @param {Img} im
 * @param {(number[] | null)[]} cuts
 * @returns {Img}
 */
export function cutBase(im, cuts) {
	if (!cuts.some((c) => c?.length)) return im;
	const o = /** @type {Img} */ ({ w: im.w, h: im.h, data: im.data.slice() });
	for (const c of cuts) for (const p of c ?? []) o.data.fill(0, p * 4, p * 4 + 4);
	return o;
}
/**
 * @param {Img} im
 * @param {(number[] | null)[]} cuts
 * @param {Rig} rig
 * @param {Layer} layer
 * @returns {Img}
 */
export function cutBodyLayer(im, cuts, rig, layer) {
	const frame = layerFrame(rig, layer),
		dx = frame.x - rig.pivot.x,
		dy = frame.y - rig.pivot.y;
	const local = cuts.map(
		(cut) =>
			cut?.flatMap((pixel) => {
				const x = (pixel % rig.cell.w) + dx,
					y = Math.floor(pixel / rig.cell.w) + dy;
				return x >= 0 && y >= 0 && x < im.w && y < im.h ? [y * im.w + x] : [];
			}) ?? null
	);
	return cutBase(im, local);
}
/**
 * @param {Img} im
 * @param {Frame} f
 * @param {[ Img | null, Frame ][]} covers
 * @returns {Img}
 */
export function tuck(im, f, covers) {
	const brim = /** @type {number[]} */ (new Array(im.w).fill(-1));
	for (const [c, g] of covers) {
		if (!c) continue;
		for (let y = 0; y < c.h; y++)
			for (let x = 0; x < c.w; x++) {
				if (!c.data[(y * c.w + x) * 4 + 3]) continue;
				const X = x - g.x + f.x,
					Y = y - g.y + f.y;
				if (X >= 0 && X < im.w) brim[X] = Math.max(brim[X], Y);
			}
	}
	if (brim.every((b) => b < 0)) return im;
	const own = brim.slice();
	for (let x = 0; x < im.w; x++) {
		if (own[x] >= 0) continue;
		let l = x - 1,
			r = x + 1;
		while (l >= 0 && own[l] < 0) l--;
		while (r < im.w && own[r] < 0) r++;
		const dl = l >= 0 ? x - l : Infinity,
			dr = r < im.w ? r - x : Infinity;
		brim[x] = dl < dr ? own[l] : dr < dl ? own[r] : Math.max(own[l], own[r]);
	}
	const o = /** @type {Img} */ ({ w: im.w, h: im.h, data: im.data.slice() });
	for (let y = 0; y < im.h; y++)
		for (let x = 0; x < im.w; x++)
			if (y <= brim[x]) o.data.fill(0, (y * im.w + x) * 4, (y * im.w + x) * 4 + 4);
	return o;
}
/**
 * @param {Project} p
 * @param {Img | null} im
 * @param {Layer} l
 * @param {Item[]} under
 * @param {string} anim
 * @param {DirectionName} dir
 * @param {number} cell
 * @returns {Img | null}
 */
export const tucked = (p, im, l, under, anim, dir, cell) =>
	im && under.length
		? tuck(
				im,
				layerFrame(p.manifest.rig, l),
				under.flatMap((c) =>
					c.layers.map(
						(cl) =>
							/** @type {[ Img | null, Frame ]} */ ([
								cellImg(p, cl, anim, dir, cell),
								layerFrame(p.manifest.rig, cl)
							])
					)
				)
			)
		: im;
/**
 * @param {Slot | undefined} slot
 * @param {Pick<Layer, 'role' | 'z'>} layer
 * @param {string} anim
 * @param {DirectionName} dir
 * @param {number} cell
 * @returns {number}
 */
export function resolveZ(slot, layer, anim, dir, cell) {
	let z = layer.z,
		best = -1;
	for (const o of slot?.zOverrides ?? []) {
		if (
			o.layer !== layer.role ||
			(o.dir && o.dir !== dir) ||
			(o.anim && o.anim !== anim) ||
			(o.cell != null && o.cell !== cell)
		)
			continue;
		const rank = o.cell != null ? 3 : o.anim ? 2 : o.dir ? 1 : 0;
		if (rank >= best) {
			best = rank;
			z = o.z;
		}
	}
	return z;
}
/**
 * @param {Manifest} manifest
 * @returns {(left: Pick<Draw, 'item' | 'layer' | 'z'>, right: Pick<Draw, 'item' | 'layer' | 'z'>) => number}
 */
export function compareDraws(manifest) {
	/** @param {string} id */
	const slotIndex = (id) => manifest.slots.findIndex((slot) => slot.id === id);
	return (left, right) =>
		left.z - right.z ||
		slotIndex(left.item.slot) - slotIndex(right.item.slot) ||
		(left.layer.role === right.layer.role ? 0 : left.layer.role === 'bg' ? -1 : 1) ||
		left.item.id.localeCompare(right.item.id);
}
/**
 * @param {Manifest} m
 * @param {Preset['items']} items
 * @param {string} anim
 * @param {DirectionName} dir
 * @param {number} cell
 * @returns {Draw[]}
 */
export function drawList(m, items, anim, dir, cell) {
	const on = equipped(m, items),
		hidden = hiddenSlots(m, on);
	const list = /** @type {Draw[]} */ ([]);
	for (const item of shownItems(m, on)) {
		if (hidden.has(item.slot)) continue;
		const slot = /** @type {Slot} */ (m.slots.find((s) => s.id === item.slot)),
			under = item.variantOf ? [] : tuckers(m, on, item.slot);
		for (const layer of item.layers)
			list.push({ item, layer, slot, z: resolveZ(slot, layer, anim, dir, cell), under });
	}
	return list.sort(compareDraws(m));
}
/**
 * @param {Project} p
 * @param {Layer} layer
 * @param {string} anim
 * @param {DirectionName} dir
 * @param {number} cell
 * @returns {Img | null}
 */
export function cellImg(p, layer, anim, dir, cell) {
	const stored = layer.cells?.[anim]?.[dir];
	if (stored) {
		const h = stored[cell];
		return h ? (p.layerImages?.get(layer)?.get(h) ?? p.images.get(h) ?? null) : null;
	}
	const src = p.manifest.rig.directions.find((d) => d.id === dir)?.mirrorOf;
	const im = src ? cellImg(p, layer, anim, src, cell) : null;
	return im && flipH(im);
}
/**
 * @param {Img} dst
 * @param {Img} src
 */
export function over(dst, src, x = 0, y = 0) {
	for (let sy = Math.max(0, -y); sy < Math.min(src.h, dst.h - y); sy++)
		for (let sx = Math.max(0, -x); sx < Math.min(src.w, dst.w - x); sx++) {
			const s = (sy * src.w + sx) * 4,
				ta = src.data[s + 3];
			if (!ta) continue;
			const d = ((y + sy) * dst.w + x + sx) * 4;
			if (ta === 255) {
				dst.data.set(src.data.subarray(s, s + 4), d);
				continue;
			}
			const ba = dst.data[d + 3] / 255,
				a = ta / 255,
				oa = a + ba * (1 - a);
			for (let c = 0; c < 3; c++)
				dst.data[d + c] = Math.round((src.data[s + c] * a + dst.data[d + c] * ba * (1 - a)) / oa);
			dst.data[d + 3] = Math.round(oa * 255);
		}
}
/**
 * @param {Project} p
 * @param {Preset['items']} items
 * @param {string} anim
 * @param {DirectionName} dir
 * @param {number} cell
 * @returns {Img}
 */
export function composeCell(p, items, anim, dir, cell, frame = rigFrame(p.manifest.rig)) {
	const out = makeImg(frame.w, frame.h),
		m = p.manifest;
	const cuts = equipped(m, items)
		.filter((it) => it.baseCut && it.baseHash === m.rig.baseHash)
		.map((it) => cutAt(m, it, anim, dir, cell));
	for (const d of drawList(m, items, anim, dir, cell)) {
		let im = tucked(p, cellImg(p, d.layer, anim, dir, cell), d.layer, d.under, anim, dir, cell);
		if (im && (d.item.id === m.rig.baseItem || d.item.variantOf === m.rig.baseItem))
			im = cutBodyLayer(im, cuts, m.rig, d.layer);
		const f = layerFrame(m.rig, d.layer);
		if (im) over(out, im, frame.x - f.x, frame.y - f.y);
	}
	return out;
}
