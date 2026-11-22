// Deterministic three-way JSON merge for PixelDoll manifests.
// Objects merge per key, arrays of objects with unique string `id`s (items, slots, materials, presets) merge per id, and
// equal-length arrays of scalars (a move's frame hashes per direction) merge per position. Anything both sides changed
// differently is a conflict: the merge keeps side A's value (A is chosen by the caller by revision id, so every device
// computes the same result) unless A removed it and B edited it, in which case the edit survives. Every conflict records
// both values, so nothing is lost.

export type Path = (string | number)[];
export interface Conflict {
	path: Path;
	base: unknown;
	a: unknown;
	b: unknown;
}

export function stableStringify(v: unknown): string {
	if (v === undefined) return 'null';
	if (v === null || typeof v !== 'object') return JSON.stringify(v);
	if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
	const o = v as Record<string, unknown>;
	return `{${Object.keys(o)
		.filter((k) => o[k] !== undefined)
		.sort()
		.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
		.join(',')}}`;
}
/** Small deterministic hash (FNV-1a) for derived ids; every device derives the same one. */
function shortHash(text: string) {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
	return (h >>> 0).toString(36);
}
const eq = (x: unknown, y: unknown) => x === y || stableStringify(x) === stableStringify(y);
const isObj = (v: unknown): v is Record<string, unknown> =>
	v !== null && typeof v === 'object' && !Array.isArray(v);
const keyed = (v: unknown): v is Record<string, unknown>[] =>
	Array.isArray(v) &&
	v.every((x) => isObj(x) && typeof x.id === 'string') &&
	new Set(v.map((x) => (x as { id: string }).id)).size === v.length;
const scalars = (v: unknown): v is unknown[] =>
	Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object');

/** Which scalar arrays merge per position. Most arrays (a palette ramp, a coverage list) only make sense whole; PixelDoll's
 *  frame lists (items/<id>/layers/<id>/cells/<move>/<direction>) are the exception: frame 1 and frame 2 are independent. */
export type Positional = (path: Path) => boolean;
export const frameLists: Positional = (p) => p.length === 7 && p[0] === 'items' && p[2] === 'layers' && p[4] === 'cells';

export function merge3(
	base: unknown,
	a: unknown,
	b: unknown,
	path: Path = [],
	out: Conflict[] = [],
	positional: Positional = frameLists
): unknown {
	if (eq(a, b)) return a;
	if (eq(base, a)) return b;
	if (eq(base, b)) return a;
	if (isObj(a) && isObj(b)) {
		const o = isObj(base) ? base : {};
		const res: Record<string, unknown> = {};
		for (const k of new Set([...Object.keys(o), ...Object.keys(a), ...Object.keys(b)])) {
			const v = merge3(o[k], a[k], b[k], [...path, k], out, positional);
			if (v !== undefined) res[k] = v;
		}
		return res;
	}
	if (keyed(a) && keyed(b) && (base === undefined || keyed(base))) {
		const byId = (arr: Record<string, unknown>[] | undefined) =>
			new Map((arr ?? []).map((x) => [x.id as string, x]));
		const o = byId(base as Record<string, unknown>[] | undefined),
			A = byId(a),
			B = byId(b);
		const ids = (m: Map<string, unknown>) => [...m.keys()];
		const merged = new Map<string, unknown>();
		for (const id of new Set([...ids(o), ...ids(A), ...ids(B)])) {
			if (!o.has(id) && A.has(id) && B.has(id) && !eq(A.get(id), B.get(id))) {
				// Added on both sides under one id (PixelDoll item ids are name slugs, so two devices adding "Helmet" collide):
				// these are two different things. Keep both; B's copy gets a derived id and the pair is flagged.
				const copy = `${id}~${shortHash(stableStringify(B.get(id)))}`;
				merged.set(id, A.get(id));
				merged.set(copy, { ...(B.get(id) as object), id: copy });
				B.set(copy, merged.get(copy) as Record<string, unknown>);
				out.push({ path: [...path, id], base: undefined, a: A.get(id), b: B.get(id) });
				continue;
			}
			const v = merge3(o.get(id), A.get(id), B.get(id), [...path, id], out, positional);
			if (v !== undefined) merged.set(id, v);
		}
		// Order: whichever side reordered wins; if both did, A's order. Ids only one side has go after, in its order.
		const order = eq(ids(o), ids(A)) ? ids(B) : ids(A);
		const seen = new Set<string>();
		const res: unknown[] = [];
		for (const id of [...order, ...ids(A), ...ids(B)])
			if (merged.has(id) && !seen.has(id)) {
				seen.add(id);
				res.push(merged.get(id));
			}
		return res;
	}
	if (positional(path) && scalars(a) && scalars(b) && scalars(base) && a.length === b.length && a.length === base.length)
		return a.map((_, i) => merge3(base[i], a[i], b[i], [...path, i], out, positional));
	out.push({ path, base, a, b });
	return a === undefined ? b : a;
}
