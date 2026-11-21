// Saved records an earlier preview version made that this version cannot use. They are never upgraded, opened or run, and
// never removed automatically: they stay exactly as stored, with the artwork they mention, until the user removes them.
// Kept free of IndexedDB so startup code and test mocks of db.ts can classify records without the database.
import { supportedFormat } from './manifest.ts';

export const CREATE_DRAFT_PREFIX = 'studio-create:';

/** characters: a character in an earlier format; outfits: the demo's saved outfit in an earlier format; creations: an
 *  unfinished character creation saved before explicit direction plans (its paid pipeline is never re-keyed); retired:
 *  shared-design and fit records whose feature was removed. */
export type IncompatibleKind = 'characters' | 'outfits' | 'creations' | 'retired';
export const INCOMPATIBLE_KINDS: readonly IncompatibleKind[] = [
	'characters',
	'outfits',
	'creations',
	'retired'
];

interface Candidate {
	id?: unknown;
	kind?: unknown;
	format?: unknown;
	manifest?: { format?: unknown };
	spec?: { directions?: unknown };
}

/** The kind of incompatible record this projects-store value is, or undefined for a record this version uses (or one that
 *  is not a saved record at all). */
export function incompatibleKind(value: unknown): IncompatibleKind | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const r = value as Candidate;
	if (typeof r.id !== 'string') return undefined;
	if (r.kind === 'equipment-design' || r.kind === 'equipment-fit-draft') return 'retired';
	if (r.manifest) return supportedFormat(r.format ?? r.manifest.format) ? undefined : 'characters';
	if (r.kind === 'dress') return supportedFormat(r.format) ? undefined : 'outfits';
	if (
		r.id === 'studio-create' ||
		(r.id.startsWith(CREATE_DRAFT_PREFIX) && !Array.isArray(r.spec?.directions))
	)
		return 'creations';
	return undefined;
}

export type IncompatibleCounts = Record<IncompatibleKind, number> & { total: number };

/** What the user sees about the incompatible records among these projects-store values. */
export function incompatibleCounts(values: Iterable<unknown>): IncompatibleCounts {
	const counts: IncompatibleCounts = {
		characters: 0,
		outfits: 0,
		creations: 0,
		retired: 0,
		total: 0
	};
	for (const value of values) {
		const kind = incompatibleKind(value);
		if (!kind) continue;
		counts[kind]++;
		counts.total++;
	}
	return counts;
}

const BLOB_REFERENCE = /^(?:sha256:)?([0-9a-f]{64})$/;

/** Every blob key a stored value mentions (as "<hex>" or "sha256:<hex>"), found by a conservative deep string scan: a
 *  request hash can match too, which only keeps a blob longer. */
export function blobReferences(values: Iterable<unknown>, refs = new Set<string>()): Set<string> {
	const scan = (v: unknown): void => {
		if (typeof v === 'string') {
			const m = BLOB_REFERENCE.exec(v);
			if (m) refs.add(m[1]);
		} else if (v && typeof v === 'object' && !(v instanceof Blob))
			for (const x of Object.values(v)) scan(x);
	};
	for (const value of values) scan(value);
	return refs;
}
