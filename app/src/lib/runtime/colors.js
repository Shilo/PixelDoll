/** @typedef {import('./types.d.ts').Layer} ColorLayer */
/** @typedef {import('./types.d.ts').Manifest} ColorManifest */
/** @typedef {import('./types.d.ts').Item} ColorItem */
/** @typedef {import('./types.d.ts').Material} ColorMaterial */
/** @typedef {import('./types.d.ts').Preset} ColorPreset */
/** @typedef {import('./types.d.ts').Hex} ColorHex */
/** @typedef {import('./types.d.ts').Img} ColorImg */

/** @param {ColorManifest} manifest @param {ColorPreset['variants']} variants @param {string} id @param {Set<string>} [seen] @returns {string | undefined} */
export function variantOf(manifest, variants, id, seen = new Set()) {
	const material = manifest.materials.find((entry) => entry.id === id);
	if (!material || seen.has(id)) return undefined;
	seen.add(id);
	return material.linkTo
		? variantOf(manifest, variants, material.linkTo, seen)
		: (variants[id] ?? material.defaultVariant);
}

/** @type {WeakMap<ColorImg, {sig: string, idx: Int16Array, table?: string, out?: ColorImg}>} */
const cache = new WeakMap();

/** @param {import('./types.d.ts').Project} p @param {ColorPreset['variants']} variants @param {(material: ColorMaterial, name: string) => ColorHex[] | undefined} [resolveRamp] @returns {import('./types.d.ts').Project} */
export function recolor(p, variants, resolveRamp = (material, name) => material.variants[name]) {
	const m = p.manifest;
	let images = null;
	const layerImages = new Map();
	for (const it of m.items) {
		const mats = it.materials.flatMap(
			(id) =>
				m.materials.find((x) => x.id === id && (x.owner === it.id || x.owner === it.variantOf)) ??
				[]
		);
		const colors = materialPalette(m, it, variants, resolveRamp),
			ids = new Map([...colors.keys()].map((color, index) => [color, index])),
			table = [...colors.values()];
		if (!table.some((c) => c >= 0)) continue;
		images ??= new Map(p.images);
		const sig = mats.map((x) => x.ramp.join()).join('|'),
			t = Int32Array.from(table),
			tsig = table.join();
		for (const l of it.layers) {
			const local = new Map();
			for (const d of Object.values(l.cells ?? {}))
				for (const h of Object.values(d ?? {}).flat()) {
					const im = h && p.images.get(h);
					if (!im) continue;
					let c = cache.get(im);
					if (!c || c.sig !== sig) cache.set(im, (c = { sig, idx: indexImg(im, ids) }));
					if (c.table !== tsig) {
						c.table = tsig;
						c.out = applyIndex(im, c.idx, t);
					}
					const rendered = /** @type {ColorImg} */ (c.out);
					local.set(h, rendered);
					images.set(h, rendered);
				}
			layerImages.set(l, local);
		}
	}
	if (images)
		for (const it of m.items)
			for (const l of it.layers)
				if (!layerImages.has(l)) {
					const local = new Map();
					for (const dirs of Object.values(l.cells ?? {}))
						for (const cells of Object.values(dirs ?? {}))
							for (const h of cells ?? []) {
								const im = h && p.images.get(h);
								if (h && im) local.set(h, im);
							}
					layerImages.set(l, local);
				}
	return images ? { manifest: m, images, layerImages } : p;
}

/** @param {ColorManifest} manifest @param {ColorItem} item @param {ColorPreset['variants']} variants @param {(material: ColorMaterial, name: string) => ColorHex[] | undefined} [resolveRamp] */
function materialPalette(
	manifest,
	item,
	variants,
	resolveRamp = (material, name) => material.variants[name]
) {
	const table = new Map();
	for (const id of item.materials) {
		const material = manifest.materials.find(
			(entry) => entry.id === id && (entry.owner === item.id || entry.owner === item.variantOf)
		);
		if (!material) continue;
		const name = variantOf(manifest, variants, id);
		const ramp = name ? resolveRamp(material, name) : undefined;
		material.ramp.forEach((color, index) =>
			table.set(parseInt(color.slice(1), 16), ramp ? parseInt(ramp[index].slice(1), 16) : -1)
		);
	}
	return table;
}

/** Active exact RGB swaps only; colors without a selected ramp are omitted.
 * @param {ColorManifest} manifest @param {ColorItem} item @param {ColorPreset['variants']} variants @param {(material: ColorMaterial, name: string) => ColorHex[] | undefined} [resolveRamp] */
export function paletteMap(manifest, item, variants, resolveRamp) {
	return new Map(
		[...materialPalette(manifest, item, variants, resolveRamp)].filter(([, color]) => color >= 0)
	);
}

/** @param {ColorImg} image @param {Map<number, number>} ids */
export function indexImg(image, ids) {
	const out = new Int16Array(image.w * image.h).fill(-1);
	for (let offset = 0, pixel = 0; offset < image.data.length; offset += 4, pixel++)
		if (image.data[offset + 3])
			out[pixel] =
				ids.get(
					(image.data[offset] << 16) | (image.data[offset + 1] << 8) | image.data[offset + 2]
				) ?? -1;
	return out;
}

/** @param {ColorImg} image @param {Int16Array} indices @param {Int32Array} table @returns {ColorImg} */
export function applyIndex(image, indices, table) {
	const data = image.data.slice();
	for (let pixel = 0; pixel < indices.length; pixel++) {
		const index = indices[pixel],
			color = index < 0 ? -1 : table[index];
		if (color >= 0) {
			data[pixel * 4] = color >> 16;
			data[pixel * 4 + 1] = (color >> 8) & 255;
			data[pixel * 4 + 2] = color & 255;
		}
	}
	return { w: image.w, h: image.h, data };
}

/** @param {ColorImg} image @param {Map<number, number>} colors @returns {ColorImg} */
export function applyPalette(image, colors) {
	return applyIndex(
		image,
		indexImg(image, new Map([...colors.keys()].map((color, index) => [color, index]))),
		Int32Array.from(colors.values())
	);
}
