// Deterministic three-way JSON merge. Objects merge per key. Arrays of objects with unique string `id`s merge per id, and
// each element is atomic: two different changes to one element (one item, one outfit) are a conflict, never a mix. Every
// other array is atomic. A conflict keeps side A's value live (the caller orders A and B by revision id, so every device
// computes the same result), except that an edit beats a removal, and records both values so nothing is lost.
import { stableStringify } from '../../image/hash.ts';

export type Path = (string | number)[];
export interface Conflict {
	path: Path;
	base: unknown;
	a: unknown;
	b: unknown;
}
export interface MergePolicy {
	/** Paths whose changes never raise a conflict: side A simply wins (what a character wears right now). */
	quiet?: (path: Path) => boolean;
}

const eq = (x: unknown, y: unknown) => x === y || stableStringify(x) === stableStringify(y);
const isObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);
const keyed = (value: unknown): value is Record<string, unknown>[] =>
	Array.isArray(value) &&
	value.every((entry) => isObject(entry) && typeof entry.id === 'string') &&
	new Set(value.map((entry) => (entry as { id: string }).id)).size === value.length;

/** One atomic value changed on both sides: A stays, unless A removed what B edited. */
function atomic(
	base: unknown,
	a: unknown,
	b: unknown,
	path: Path,
	out: Conflict[],
	policy: MergePolicy
) {
	if (eq(a, b)) return a;
	if (eq(base, a)) return b;
	if (eq(base, b)) return a;
	if (!policy.quiet?.(path)) out.push({ path, base, a, b });
	return a === undefined ? b : a;
}

export function merge3(
	base: unknown,
	a: unknown,
	b: unknown,
	policy: MergePolicy = {},
	path: Path = [],
	out: Conflict[] = []
): unknown {
	if (eq(a, b)) return a;
	if (eq(base, a)) return b;
	if (eq(base, b)) return a;
	if (policy.quiet?.(path)) return a === undefined ? b : a;
	if (isObject(a) && isObject(b)) {
		const origin = isObject(base) ? base : {};
		const result: Record<string, unknown> = {};
		for (const key of new Set([...Object.keys(origin), ...Object.keys(a), ...Object.keys(b)])) {
			const value = merge3(origin[key], a[key], b[key], policy, [...path, key], out);
			if (value !== undefined) result[key] = value;
		}
		return result;
	}
	if (keyed(a) && keyed(b) && (base === undefined || keyed(base))) {
		const byId = (list: Record<string, unknown>[] | undefined) =>
			new Map((list ?? []).map((entry) => [entry.id as string, entry]));
		const O = byId(base as Record<string, unknown>[] | undefined),
			A = byId(a),
			B = byId(b);
		const ids = (map: Map<string, unknown>) => [...map.keys()];
		const merged = new Map<string, unknown>();
		// Added on both sides under one id with different content (item ids are name slugs) is a conflict like any other:
		// A stays, B waits in the note, and the user can keep both as a copy.
		for (const id of new Set([...ids(O), ...ids(A), ...ids(B)])) {
			const value = atomic(O.get(id), A.get(id), B.get(id), [...path, id], out, policy);
			if (value !== undefined) merged.set(id, value);
		}
		// Order: whichever side reordered wins; if both did, A's order. Ids only one side has follow, in that side's order.
		const order = eq(ids(O), ids(A)) ? ids(B) : ids(A);
		const seen = new Set<string>();
		const result: unknown[] = [];
		for (const id of [...order, ...ids(A), ...ids(B)])
			if (merged.has(id) && !seen.has(id)) {
				seen.add(id);
				result.push(merged.get(id));
			}
		return result;
	}
	return atomic(base, a, b, path, out, policy);
}
