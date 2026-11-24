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
 * @param {Manifest} manifest
 * @param {Pick<Preset, 'items' | 'variants'> | string} preset
 * @returns {Pick<Preset, 'items' | 'variants'>}
 */
export function resolvePreset(manifest, preset) {
	const selected =
		typeof preset === 'string' ? manifest.presets.find((entry) => entry.id === preset) : preset;
	if (!selected) throw new Error('PixelDoll: unknown outfit');
	const items = { ...selected.items, body: manifest.rig.baseItem };
	for (const [slot, itemId] of Object.entries(items)) {
		if (slot === 'body') continue;
		if (!validEquipment(manifest, slot, itemId))
			throw new Error('PixelDoll: invalid equipment for ' + slot);
	}
	return { items, variants: { ...selected.variants } };
}
/** @param {Manifest} manifest @param {string} slot @param {string | null | undefined} itemId */
export function validEquipment(manifest, slot, itemId) {
	return (
		manifest.slots.some((entry) => entry.id === slot) &&
		(itemId == null ||
			manifest.items.some((item) => item.id === itemId && item.slot === slot && !item.variantOf))
	);
}
/**
 * @param {Manifest} m
 * @param {Item} it
 */
export const hidesOf = (m, it) =>
	handHides(m, it.slot, it.hides ?? m.slots.find((entry) => entry.id === it.slot)?.hides ?? []);
/** @param {Manifest} manifest @param {string} key @returns {'left' | 'right' | undefined} */
export function handSide(manifest, key) {
	const slot = manifest.slots.find((entry) => entry.id === key);
	if (slot?.class !== 'held') return undefined;
	if (slot.anchor === 'hand_l') return 'left';
	if (slot.anchor === 'hand_r') return 'right';
	return key === 'off_hand' ? 'left' : key === 'main_hand' ? 'right' : undefined;
}
/** @param {Manifest} manifest @param {string} key @returns {string[]} */
export function oppositeHands(manifest, key) {
	const side = handSide(manifest, key);
	return side
		? manifest.slots
				.filter((slot) => {
					const other = handSide(manifest, slot.id);
					return other && other !== side;
				})
				.map((slot) => slot.id)
		: [];
}
/** Canonical hand targets also cover custom slots using that hand.
 * @param {Manifest} manifest @param {string} key @param {string[]} hides @returns {string[]} */
export function handHides(manifest, key, hides) {
	if (!handSide(manifest, key)) return hides;
	const result = new Set(hides);
	for (const target of hides) {
		if (target !== 'main_hand' && target !== 'off_hand') continue;
		const side = target === 'off_hand' ? 'left' : 'right';
		for (const slot of manifest.slots)
			if (handSide(manifest, slot.id) === side) result.add(slot.id);
	}
	return [...result];
}
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
export const twoHanded = (m, it) => {
	const side = handSide(m, it.slot);
	if (!side) return false;
	const hides = hidesOf(m, it);
	return (
		hides.includes(side === 'left' ? 'main_hand' : 'off_hand') ||
		oppositeHands(m, it.slot).some((key) => hides.includes(key))
	);
};
/**
 * @param {Manifest} m
 * @param {Preset['items']} items
 * @param {string} [keep]
 * @returns {{ items: Preset['items']; removed?: Item; removedItems?: Item[]; by?: Item; }}
 */
export function settleHands(m, items, keep) {
	const worn = equipped(m, items).filter((item) => handSide(m, item.slot));
	const priority = keep && worn.some((item) => item.slot === keep) ? keep : 'main_hand';
	const side = handSide(m, priority) ?? 'right';
	/** @param {Item} item */
	const rank = (item) => (item.slot === priority ? 0 : handSide(m, item.slot) === side ? 1 : 2);
	worn.sort(
		(left, right) =>
			rank(left) - rank(right) ||
			m.slots.findIndex((slot) => slot.id === left.slot) -
				m.slots.findIndex((slot) => slot.id === right.slot)
	);
	const kept = /** @type {Item[]} */ ([]),
		removedItems = /** @type {Item[]} */ ([]);
	let by;
	for (const item of worn) {
		const conflict = kept.find(
			(other) =>
				handSide(m, other.slot) !== handSide(m, item.slot) &&
				(twoHanded(m, other) || twoHanded(m, item))
		);
		if (conflict) {
			removedItems.push(item);
			by ??= conflict;
		} else kept.push(item);
	}
	if (!removedItems.length) return { items };
	return {
		items: { ...items, ...Object.fromEntries(removedItems.map((item) => [item.slot, null])) },
		removed: removedItems[0],
		removedItems,
		by
	};
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
 */
function* dollPixels(p, items, anim, dir, cell) {
	const m = p.manifest;
	const cuts = equipped(m, items)
		.filter((it) => it.baseCut && it.baseHash === m.rig.baseHash)
		.map((it) => cutAt(m, it, anim, dir, cell));
	for (const draw of drawList(m, items, anim, dir, cell)) {
		let image = tucked(
			p,
			cellImg(p, draw.layer, anim, dir, cell),
			draw.layer,
			draw.under,
			anim,
			dir,
			cell
		);
		if (!image) continue;
		const body = draw.item.id === m.rig.baseItem || draw.item.variantOf === m.rig.baseItem;
		if (body) image = cutBodyLayer(image, cuts, m.rig, draw.layer);
		yield { ...draw, image, body, frame: layerFrame(m.rig, draw.layer) };
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
	const out = makeImg(frame.w, frame.h);
	for (const draw of dollPixels(p, items, anim, dir, cell))
		over(out, draw.image, frame.x - draw.frame.x, frame.y - draw.frame.y);
	return out;
}
/** @typedef {{x: number, y: number}} DollPoint */
/** @typedef {'anchor' | 'measured' | 'requested' | 'fit' | 'manual'} DollHipSource */
/** @typedef {{hip: DollPoint, feet: DollPoint[], source: DollHipSource}} DollHip */
/** @typedef {{image: Img, hip: DollPoint, waist: number, source: DollHipSource}} DollFragment */

/** Maximum total horizontal displacement of the two waist edges, in pixels. */
export const ACTION_SEAM_LIMIT = 1;

/**
 * @param {Rig} rig
 * @param {string} clip
 * @param {DirectionName} dir
 * @param {number} cell
 * @returns {DollHip | null}
 */
export function actionHip(rig, clip, dir, cell) {
	const mirror = rig.directions.find((d) => d.id === dir)?.mirrorOf;
	const sources = rig.animations.find((a) => a.id === clip)?.sources;
	const reflected = !sources?.[dir] && !!mirror;
	const source = sources?.[dir] ?? (mirror ? sources?.[mirror] : undefined);
	const jointSets = [source?.measured?.[cell], source?.keypoints?.[cell]];
	const [measured, requested] = jointSets.map((joints) =>
		joints
			?.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
			.map((p) => ({
				label: p.label,
				x: (reflected ? 1 - p.x : p.x) * rig.cell.w,
				y: p.y * rig.cell.h
			}))
	);
	const feet = (measured ?? requested ?? []).filter((p) => p.label.endsWith(' LEG'));
	const track = rig.anchors?.hip?.[clip];
	const own = track?.[dir]?.[cell],
		anchor = own ?? (mirror ? track?.[mirror]?.[cell] : undefined);
	if (anchor?.every(Number.isFinite))
		return {
			hip: { x: own ? anchor[0] : rig.cell.w - 1 - anchor[0], y: anchor[1] },
			feet,
			source: 'anchor'
		};
	for (const kind of /** @type {const} */ (['measured', 'requested'])) {
		const hips = (kind === 'measured' ? measured : requested)?.filter((p) =>
			p.label.endsWith(' HIP')
		);
		if (hips?.length)
			return {
				hip: {
					x: hips.reduce((sum, p) => sum + p.x, 0) / hips.length,
					y: hips.reduce((sum, p) => sum + p.y, 0) / hips.length
				},
				feet,
				source: kind
			};
	}
	return null;
}

/** @param {number} waist */
export function actionWaist(waist) {
	return Number.isFinite(waist) ? Math.max(-4, Math.min(4, Math.round(waist))) : 0;
}

/** @param {Set<number>} ids @param {number} width */
export function actionComponents(ids, width) {
	const unseen = new Set(ids);
	const parts = [];
	for (const first of unseen) {
		const part = [first];
		unseen.delete(first);
		for (const pixel of part) {
			const x = pixel % width;
			const neighbors = [pixel - width, pixel + width];
			if (x > 0) neighbors.push(pixel - 1);
			if (x + 1 < width) neighbors.push(pixel + 1);
			for (const next of neighbors) if (unseen.delete(next)) part.push(next);
		}
		parts.push(part);
	}
	return parts;
}

/** @param {Img} image @param {number} first */
function actionOpaque(image, first) {
	const ids = new Set();
	for (let i = first; i < image.w * image.h; i++) if (image.data[i * 4 + 3]) ids.add(i);
	return ids;
}

/** @param {Img} image @param {DollHip} geometry @param {number} waist */
export function splitLower(image, geometry, waist = 0) {
	const row = Math.max(0, Math.min(image.h, Math.round(geometry.hip.y) + actionWaist(waist)));
	const lower = makeImg(image.w, image.h);
	const cut = row * image.w * 4;
	lower.data.set(image.data.subarray(cut), cut);
	return { image: lower, hip: geometry.hip, waist: row, source: geometry.source };
}

/** @param {Img} image @param {DollHip} geometry @param {number} waist */
export function splitUpper(image, geometry, waist = 0) {
	const row = Math.max(0, Math.min(image.h, Math.round(geometry.hip.y) + actionWaist(waist)));
	const below = actionOpaque(image, row * image.w);
	const seeds = new Set();
	for (const foot of geometry.feet) {
		let closest = Infinity;
		let seed = -1;
		for (const pixel of below) {
			const distance =
				((pixel % image.w) + 0.5 - foot.x) ** 2 + (Math.floor(pixel / image.w) + 0.5 - foot.y) ** 2;
			if (distance < closest) {
				closest = distance;
				seed = pixel;
			}
		}
		seeds.add(seed);
	}
	if (!geometry.feet.length) {
		let bottom = -1;
		for (const pixel of below) bottom = Math.floor(pixel / image.w);
		for (const pixel of below) if (Math.floor(pixel / image.w) === bottom) seeds.add(pixel);
	}
	const kept = actionOpaque(image, 0);
	for (const part of actionComponents(below, image.w))
		if (part.some((pixel) => seeds.has(pixel))) for (const pixel of part) kept.delete(pixel);
	const upper = makeImg(image.w, image.h);
	for (const part of actionComponents(kept, image.w))
		if (part.length >= 40)
			for (const pixel of part)
				upper.data.set(image.data.subarray(pixel * 4, pixel * 4 + 4), pixel * 4);
	return { image: upper, hip: geometry.hip, waist: row, source: geometry.source };
}

/**
 * @param {DollFragment} lower
 * @param {DollFragment} upper
 * @param {number} cellWidth Width of the unpadded rig cell.
 */
export function layerOffset(lower, upper, cellWidth = lower.image.w) {
	const range = Math.round(cellWidth / 8);
	/** @param {Img} image @param {number} row @param {number} dx */
	const extent = (image, row, dx) => {
		if (row < 0 || row >= image.h) return null;
		const center = Math.round(lower.hip.x);
		let first = Infinity,
			last = -Infinity;
		for (let x = center - range; x <= center + range; x++) {
			const sx = x - dx;
			if (sx >= 0 && sx < image.w && image.data[(row * image.w + sx) * 4 + 3]) {
				first = Math.min(first, x);
				last = x;
			}
		}
		return first <= last ? { first, last } : null;
	};
	const bottom = extent(lower.image, lower.waist, 0);
	/** @param {number} x @param {number} y */
	const step = (x, y) => {
		const top = extent(upper.image, lower.waist - 1 - y, x);
		return top && bottom
			? Math.abs(top.first - bottom.first) + Math.abs(top.last - bottom.last)
			: Infinity;
	};
	let x = Math.round(lower.hip.x - upper.hip.x),
		y = Math.round(lower.hip.y - upper.hip.y);
	let seam = step(x, y),
		source = lower.source === upper.source ? lower.source : lower.source + '/' + upper.source;
	if (seam > 0) {
		let bestDistance = Infinity;
		for (let dx = -5; dx <= 5; dx++)
			for (let dy = -5; dy <= 5; dy++) {
				const score = step(dx, dy);
				const distance = Math.abs(dx) + Math.abs(dy);
				if (score < seam || (source === 'fit' && score === seam && distance < bestDistance)) {
					x = dx;
					y = dy;
					seam = score;
					source = 'fit';
					bestDistance = distance;
				}
			}
	}
	return { x, y, seam, source };
}

/** @param {number} seam @param {number} gearLoss */
export function actionPairFallback(seam, gearLoss) {
	if (!Number.isFinite(seam) || seam > ACTION_SEAM_LIMIT) return 'seam';
	return gearLoss ? 'gear-loss' : null;
}

/** @param {Img} lower @param {Img} upper @param {DollPoint} offset */
export function compositeAction(lower, upper, offset) {
	const out = makeImg(lower.w, lower.h);
	out.data.set(lower.data);
	over(out, upper, offset.x, offset.y);
	return out;
}

/** @typedef {{clip: string, direction: DirectionName, cell: number}} DollActionCell */

/** @param {string} slot */
export const actionLowerSlot = (slot) => slot === 'feet' || slot === 'legs' || slot === 'underwear';

/**
 * @param {Img} image
 * @param {Frame} frame
 * @param {Frame} base
 * @param {DollFragment} fragment
 * @param {'lower' | 'upper'} part
 * @param {boolean} body
 */
export function actionLayerFragment(image, frame, base, fragment, part, body) {
	if (part === 'upper' && !body) return { image, lost: 0 };
	const output = makeImg(image.w, image.h);
	let lost = 0;
	for (let i = 0; i < image.w * image.h; i++) {
		const pixel = i * 4;
		if (!image.data[pixel + 3]) continue;
		const x = (i % image.w) + base.x - frame.x;
		const y = Math.floor(i / image.w) + base.y - frame.y;
		const keep =
			part === 'lower'
				? y >= fragment.waist
				: x >= 0 &&
					x < fragment.image.w &&
					y >= 0 &&
					y < fragment.image.h &&
					fragment.image.data[(y * fragment.image.w + x) * 4 + 3];
		if (keep) output.data.set(image.data.subarray(pixel, pixel + 4), pixel);
		else lost++;
	}
	return { image: output, lost };
}

/** @param {Img} image */
export function actionPixelBounds(image) {
	let left = image.w,
		top = image.h,
		right = -1,
		bottom = -1;
	for (let i = 0; i < image.w * image.h; i++) {
		if (!image.data[i * 4 + 3]) continue;
		const x = i % image.w,
			y = Math.floor(i / image.w);
		left = Math.min(left, x);
		top = Math.min(top, y);
		right = Math.max(right, x);
		bottom = Math.max(bottom, y);
	}
	return right < 0 ? null : { left, top, right, bottom };
}

/** @param {ReturnType<typeof actionPixelBounds>} bounds @param {Frame} from @param {Frame} target @param {DollPoint} offset */
export function actionClipsGear(bounds, from, target, offset) {
	const x = target.x - from.x + offset.x,
		y = target.y - from.y + offset.y;
	return (
		!!bounds &&
		(bounds.left + x < 0 ||
			bounds.top + y < 0 ||
			bounds.right + x >= target.w ||
			bounds.bottom + y >= target.h)
	);
}

/**
 * @param {Project} project
 * @param {DollActionCell} pose
 * @param {number} waist
 * @param {'lower' | 'upper'} part
 */
export function actionFragment(project, pose, waist, part) {
	const hip = actionHip(project.manifest.rig, pose.clip, pose.direction, pose.cell);
	if (!hip) return null;
	const body = composeCell(project, {}, pose.clip, pose.direction, pose.cell);
	const fragment = part === 'lower' ? splitLower(body, hip, waist) : splitUpper(body, hip, waist);
	return fragment;
}

/**
 * @param {Project} project
 * @param {Preset['items']} items
 * @param {DollActionCell} walk
 * @param {DollActionCell} action
 * @param {number} waist
 * @param {Frame} frame
 */
export function composeLayeredAction(project, items, walk, action, waist, frame) {
	if (walk.direction !== action.direction) return { image: null, fallback: 'direction' };
	const base = rigFrame(project.manifest.rig);
	const lower = actionFragment(project, walk, waist, 'lower');
	const upper = actionFragment(project, action, waist, 'upper');
	if (!lower || !upper) return { image: null, fallback: 'hip' };
	const offset = layerOffset(lower, upper);
	if (actionPairFallback(offset.seam, 0)) return { image: null, fallback: 'seam' };
	const legs = makeImg(frame.w, frame.h),
		torso = makeImg(frame.w, frame.h);
	for (const draw of dollPixels(project, items, walk.clip, walk.direction, walk.cell)) {
		if (!draw.body && !actionLowerSlot(draw.slot.id)) continue;
		const { image, lost } = actionLayerFragment(
			draw.image,
			draw.frame,
			base,
			lower,
			'lower',
			draw.body
		);
		if (lost && actionLowerSlot(draw.slot.id)) return { image: null, fallback: 'gear-loss' };
		over(legs, image, frame.x - draw.frame.x, frame.y - draw.frame.y);
	}
	for (const draw of dollPixels(project, items, action.clip, action.direction, action.cell)) {
		if (!draw.body && actionLowerSlot(draw.slot.id)) continue;
		const { image } = actionLayerFragment(draw.image, draw.frame, base, upper, 'upper', draw.body);
		if (!draw.body && actionClipsGear(actionPixelBounds(image), draw.frame, frame, offset))
			return { image: null, fallback: 'gear-loss' };
		over(torso, image, frame.x - draw.frame.x, frame.y - draw.frame.y);
	}
	return { image: compositeAction(legs, torso, offset), fallback: null };
}

/** @param {Manifest} manifest @param {Preset['items']} items @param {string} walk @param {DirectionName} facing @param {number} lower @param {string} action @param {number} upper */
export function exportedActionOffset(manifest, items, walk, facing, lower, action, upper) {
	const layers = manifest.actionLayers;
	const pair = layers?.pairs.find(
		(p) => p.walk === walk && p.action === action && p.direction === facing
	);
	const data = pair?.cells[lower * pair.upperCells + upper];
	if (
		!data ||
		drawList(manifest, items, action, facing, upper).some(({ item }) =>
			data.blocked.includes(item.id)
		)
	)
		return null;
	/** @param {string} clip @param {'lower' | 'upper'} part @param {number} cell */
	const hip = (clip, part, cell) =>
		layers?.planes
			.find((plane) => plane.clip === clip && plane.part === part)
			?.anchors.find(({ direction }) => direction === facing)?.cells[cell];
	const lo = hip(walk, 'lower', lower),
		hi = hip(action, 'upper', upper);
	return lo && hi ? { x: lo[0] - hi[0] + data.x, y: lo[1] - hi[1] + data.y } : null;
}

/**
 * @param {Manifest} manifest
 * @param {Preset['items']} items
 * @param {DollActionCell} action
 * @param {DollActionCell | null} walk
 * @param {boolean} layering
 */
export function exportedActionDraws(manifest, items, action, walk, layering) {
	const offset =
		layering && walk?.direction === action.direction
			? exportedActionOffset(
					manifest,
					items,
					walk.clip,
					walk.direction,
					walk.cell,
					action.clip,
					action.cell
				)
			: null;
	/** @param {DollActionCell} pose @param {'upper' | 'lower' | null} part @param {DollPoint} point */
	const draws = (pose, part, point) =>
		drawList(manifest, items, pose.clip, pose.direction, pose.cell)
			.filter(({ layer }) => !part || !!layer.actionSheets?.[part]?.[pose.clip])
			.map((draw) => ({ ...draw, ...pose, part, point }));
	const origin = { x: 0, y: 0 };
	return offset && walk
		? [...draws(walk, 'lower', origin), ...draws(action, 'upper', offset)]
		: draws(action, null, origin);
}
