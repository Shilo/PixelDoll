// Synthetic characters shaped like pixeldoll/3 manifests: keyed slots, materials, items and presets, and per item a layer
// whose cells map move -> direction -> frame hashes. Cell bytes are seeded noise sized like small pixel-art PNGs.
import type { Local } from './engine.ts';

let seed = 1;
const rand = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32;
export function reseed(s: number) {
	seed = s;
}
export function noise(n: number) {
	const b = new Uint8Array(n);
	for (let i = 0; i < n; i++) b[i] = (rand() * 256) | 0;
	return b;
}

export interface Shape {
	items: number;
	moves: number;
	dirs: number;
	frames: number;
	cellBytes: number;
}
export const DIRS = ['south', 'west', 'east', 'north', 'south-west', 'south-east', 'north-west', 'north-east'];

export async function cell(local: Local, bytes = 900) {
	return local.putBlob(noise(bytes + ((rand() * 400) | 0)));
}

export async function character(local: Local, name: string, s: Shape) {
	const moves = Array.from({ length: s.moves }, (_, i) => `move${i}`);
	const items = [];
	for (let i = 0; i < s.items; i++) {
		const cells: Record<string, Record<string, string[]>> = {};
		for (const m of moves) {
			cells[m] = {};
			for (const d of DIRS.slice(0, s.dirs))
				cells[m][d] = await Promise.all(Array.from({ length: s.frames }, () => cell(local, s.cellBytes)));
		}
		items.push({
			id: `item${i}`,
			name: i ? `Item ${i}` : 'Body',
			slot: i ? `slot${i}` : 'body',
			status: 'accepted',
			materials: [`mat${i}`],
			prompt: `a pixel art item number ${i}`,
			layers: [{ id: 'main', role: 'fg', z: i, cells }]
		});
	}
	return {
		format: 'pixeldoll/3',
		name,
		slots: items.map((it, i) => ({ id: it.slot, z: i, class: i ? 'worn' : 'base' })),
		materials: items.map((_, i) => ({ id: `mat${i}`, label: `Material ${i}`, ramp: ['#111111', '#555555', '#999999'], variants: {} })),
		items,
		presets: [{ id: 'default', name: 'Default', items: Object.fromEntries(items.map((it) => [it.slot, it.id])), variants: {} }]
	};
}

/** The manifest rules a field merge could break: outfits and items must name things that exist. */
export function validate(body: unknown): string[] {
	const m = body as { slots: { id: string }[]; items: { id: string; slot: string; materials: string[] }[]; materials: { id: string }[]; presets: { items: Record<string, string | null> }[] };
	const slots = new Set(m.slots.map((s) => s.id)),
		items = new Set(m.items.map((i) => i.id)),
		mats = new Set(m.materials.map((x) => x.id));
	const bad: string[] = [];
	for (const it of m.items) {
		if (!slots.has(it.slot)) bad.push(`${it.id}: slot ${it.slot} missing`);
		for (const x of it.materials) if (!mats.has(x)) bad.push(`${it.id}: material ${x} missing`);
	}
	for (const p of m.presets) for (const id of Object.values(p.items)) if (id && !items.has(id)) bad.push(`preset names missing item ${id}`);
	return bad;
}
