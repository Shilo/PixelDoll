// Recently deleted: one durable entry per deletion, written in the same transaction as the delete. It holds the saved
// record exactly as it was (JSON and artwork hashes only, never pixel copies), so a restore can put back what was removed
// after a reload, a later delete or an accidental tap. The entry is a projects-store record, and blobs are kept alive by
// reference (gcBlobs scans every record), so the artwork a restore needs cannot be swept while the entry lives.
import * as db from './db.ts';
import { LocalizedError } from '../message.ts';
import type { StoredProject } from './project.ts';
import { restoreRemoved, type DressedRecord } from './project.ts';
import { supportedFormat } from './manifest.ts';
import { artworkRefs, pruneHistory } from './workspace.ts';
import { restoreMove } from '../rig/moves.ts';
import { stableStringify } from '../image/hash.ts';

export const RECENTLY_DELETED_PREFIX = 'recently-deleted:';
/** How long an entry stays restorable. */
export const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
/** How many entries are kept, newest first: the oldest goes when a new one would exceed this. */
export const MAX_ENTRIES = 50;

/** What was deleted. `character` removes a whole saved character; the rest are parts of one. */
export type DeletedKind = 'character' | 'items' | 'category' | 'move';

/** Exactly what was removed inside the character record. */
export interface DeletedScope {
	itemIds?: string[];
	slot?: string;
	moveId?: string;
}

/** One removed draft entry, with the shared list it came from. */
export interface DeletedDraft {
	list: 'gens' | 'drafts';
	entry: unknown;
}

export interface RecentlyDeleted {
	id: string;
	version: 1;
	kind: DeletedKind;
	/** The projects key it was removed from. */
	projectId: string;
	/** The character's lineage, kept when a restore has to use a new key: child entries follow it. */
	lineageId: string;
	/** The deleted thing's own name. */
	name: string;
	/** The character it belonged to, for the list ("from Knight"). Empty for a character. */
	context: string;
	deletedAt: string;
	scope: DeletedScope;
	/** The whole character record as it was just before the delete. */
	before: StoredProject;
	/** A character's unkept item drafts, which its delete removed with it. */
	drafts?: DeletedDraft[];
}

const KIND_NAMES: readonly DeletedKind[] = ['character', 'items', 'category', 'move'];

/** A character's lineage: the original it was restored from, or itself. */
export const lineageOf = (record: StoredProject) => record.restoredFrom?.id ?? record.id;

export const entryKey = () => `${RECENTLY_DELETED_PREFIX}${crypto.randomUUID()}`;

/** The ledger record ids a deleted character entry's drafts still need, so pruning never sweeps the paid results they
 *  resolve to while the entry can still bring the drafts back. */
export function draftCallIds(entry: RecentlyDeleted): string[] {
	const out = new Set<string>();
	const walk = (value: unknown, seen = new Set<object>()): void => {
		if (!value || typeof value !== 'object' || seen.has(value)) return;
		seen.add(value);
		if (Array.isArray(value)) {
			for (const item of value) walk(item, seen);
			return;
		}
		for (const [key, child] of Object.entries(value)) {
			if (key === 'recId' && typeof child === 'string') out.add(child);
			else if (key === 'old' && Array.isArray(child)) {
				for (const id of child) if (typeof id === 'string') out.add(id);
			} else walk(child, seen);
		}
	};
	for (const draft of entry.drafts ?? []) walk(draft.entry);
	return [...out];
}

/** Build the entry for a deletion. `record` is the character exactly as it was before the delete. */
export function deletedEntry(o: {
	kind: DeletedKind;
	record: StoredProject;
	name: string;
	context: string;
	scope: DeletedScope;
	drafts?: DeletedDraft[];
}): RecentlyDeleted {
	return {
		id: entryKey(),
		version: 1,
		kind: o.kind,
		projectId: o.record.id,
		lineageId: lineageOf(o.record),
		name: o.name,
		context: o.context,
		deletedAt: new Date().toISOString(),
		scope: o.scope,
		before:
			o.kind === 'character' ? structuredClone(o.record) : trimBefore(o.record, o.kind, o.scope),
		...(o.drafts?.length ? { drafts: structuredClone(o.drafts) } : {})
	};
}

/** Keep only what this kind's inverse reads, so an entry does not pin the frame history of everything else on the
 *  character (which Adjust frame and Fix frames replace, doubling storage for no restore value). */
function trimBefore(record: StoredProject, kind: DeletedKind, scope: DeletedScope): StoredProject {
	const trimmed = structuredClone(record),
		m = trimmed.manifest,
		ids = new Set(scope.itemIds ?? []);
	if (kind === 'move') {
		m.items = m.items.map((item) => {
			const copy = structuredClone(item);
			for (const layer of copy.layers)
				for (const key of ['cells', 'sheets', 'sourceSheets'] as const) {
					const only = layer[key]?.[scope.moveId!];
					const target = (layer[key] ??= {}) as Record<string, unknown>;
					for (const name of Object.keys(target)) delete target[name];
					if (only !== undefined) target[scope.moveId!] = only;
				}
			copy.baseCut = copy.baseCut?.[scope.moveId!]
				? { [scope.moveId!]: copy.baseCut[scope.moveId!] }
				: undefined;
			copy.coverage = copy.coverage?.filter((cell) => cell.split('/')[0] === scope.moveId);
			copy.pending = copy.pending?.filter((cell) => cell.split('/')[0] === scope.moveId);
			copy.refit = copy.refit?.filter((note) => note.anim === scope.moveId);
			if (copy.anchorCell && copy.anchorCell.split('/')[0] !== scope.moveId) delete copy.anchorCell;
			if (copy.standing !== scope.moveId) delete copy.standing;
			if (copy.qa) {
				copy.qa.clips = Object.fromEntries(
					Object.entries(copy.qa.clips).filter(([key]) => key.split('/')[0] === scope.moveId)
				);
				copy.qa.cells = Object.fromEntries(
					Object.entries(copy.qa.cells).filter(([key]) => key.split('/')[0] === scope.moveId)
				);
				if (copy.qa.inherited)
					copy.qa.inherited.clips = copy.qa.inherited.clips.filter(
						(key) => key.split('/')[0] === scope.moveId
					);
			}
			delete copy.frameEdits;
			delete copy.paletteRepairs;
			return copy;
		});
		for (const slot of m.slots)
			slot.zOverrides = slot.zOverrides?.filter(
				(entry) => !entry.anim || entry.anim === scope.moveId
			);
		m.rig.animations = m.rig.animations.filter((clip) => clip.id === scope.moveId);
		for (const track of Object.values(m.rig.anchors ?? {}))
			for (const key of Object.keys(track)) if (key !== scope.moveId) delete track[key];
		trimmed.skeletons = Object.fromEntries(
			Object.entries(trimmed.skeletons ?? {}).filter(([key]) => key.split('/')[0] === scope.moveId)
		);
		const qa = trimmed.rigQa as
			{ clips?: Record<string, unknown>; warnings?: string[] } | undefined;
		if (qa) {
			qa.clips = Object.fromEntries(
				Object.entries(qa.clips ?? {}).filter(([key]) => key.split('/')[0] === scope.moveId)
			);
			qa.warnings = (qa.warnings ?? []).filter(
				(warning) =>
					warning.startsWith(`${scope.moveId}/`) || warning.startsWith(`${scope.moveId} `)
			);
		}
	} else {
		// The scoped items whole, the others as identity only: their `hides` and `clips` edges name the restored category,
		// but their artwork is still live in the record and must not be pinned here.
		m.items = m.items.map((item) =>
			ids.has(item.id)
				? structuredClone(item)
				: {
						...structuredClone(item),
						layers: [],
						coverage: undefined,
						pending: undefined,
						frameEdits: undefined,
						paletteRepairs: undefined,
						baseCut: undefined,
						refit: undefined,
						qa: undefined
					}
		);
		// Materials stay whole: a surviving material may link into one of these, and restore puts that link back.
	}
	return trimmed;
}

/** An entry this version can restore, or undefined for anything else (an older or damaged record is still listed for
 *  Delete forever, but is never opened). */
export function readEntry(value: unknown): RecentlyDeleted | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const e = value as Partial<RecentlyDeleted>;
	if (
		e.version !== 1 ||
		typeof e.id !== 'string' ||
		!e.id.startsWith(RECENTLY_DELETED_PREFIX) ||
		typeof e.kind !== 'string' ||
		!KIND_NAMES.includes(e.kind as DeletedKind) ||
		typeof e.projectId !== 'string' ||
		!e.projectId.startsWith('rig-') ||
		typeof e.lineageId !== 'string' ||
		typeof e.name !== 'string' ||
		typeof e.context !== 'string' ||
		typeof e.deletedAt !== 'string' ||
		!Number.isFinite(Date.parse(e.deletedAt)) ||
		!e.scope ||
		typeof e.scope !== 'object' ||
		!e.before ||
		typeof e.before !== 'object' ||
		e.before.id !== e.projectId ||
		!supportedFormat(e.before.manifest?.format) ||
		!Array.isArray(e.before.manifest?.items) ||
		!Array.isArray(e.before.manifest?.slots) ||
		(e.drafts !== undefined &&
			(!Array.isArray(e.drafts) ||
				e.drafts.some(
					(d) => !d || typeof d !== 'object' || !['gens', 'drafts'].includes(d.list as string)
				)))
	)
		return undefined;
	return e as RecentlyDeleted;
}

export const expired = (e: RecentlyDeleted, now = Date.now()) =>
	Date.parse(e.deletedAt) + KEEP_MS <= now;

/** The entries to show, newest first, with anything this version cannot read left out of restores by readEntry. */
export function listEntries(values: readonly unknown[], now = Date.now()): RecentlyDeleted[] {
	return readable(values)
		.filter((e) => !expired(e, now))
		.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

const readable = (values: readonly unknown[]) =>
	values.map(readEntry).filter((e): e is RecentlyDeleted => !!e);

/** The key an entry claims, even when the rest of it is unreadable: a record this version cannot open must still expire,
 *  or a format change would pin a whole library's artwork forever. */
const claimedId = (value: unknown) => {
	const id = (value as { id?: unknown })?.id;
	return typeof id === 'string' && id.startsWith(RECENTLY_DELETED_PREFIX) ? id : undefined;
};
const claimedAt = (value: unknown) => {
	const at = Date.parse((value as { deletedAt?: unknown })?.deletedAt as string);
	return Number.isFinite(at) ? at : undefined;
};

/** Keys to remove before writing one more entry: expired ones (readable or not), the oldest while at the cap, and the
 *  child entries of a character entry that goes, which could never be restored once their character is gone. */
export function pruneKeys(values: readonly unknown[], now = Date.now(), room = 1): string[] {
	const all = readable(values).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
	const kept = all.filter((e) => !expired(e, now)).slice(0, Math.max(0, MAX_ENTRIES - room));
	const keep = new Set(kept.map((e) => e.id));
	const doomed = all.filter((e) => !keep.has(e.id));
	const gone = new Set(doomed.map((e) => e.id));
	for (const value of values) {
		const id = claimedId(value);
		if (!id || keep.has(id)) continue;
		const at = claimedAt(value);
		if (at !== undefined && at + KEEP_MS <= now) gone.add(id);
	}
	// A child entry is useless without the character it came from, so it leaves with it rather than lingering as an error.
	// Only entries of the same saved character: a copy restored under a new key keeps its own children.
	for (const e of all) {
		if (e.kind === 'character') continue;
		if (
			doomed.some(
				(d) => d.kind === 'character' && d.projectId === e.projectId && d.lineageId === e.lineageId
			)
		)
			gone.add(e.id);
	}
	for (const value of values) {
		const child = value as { kind?: unknown; projectId?: unknown };
		if (child?.kind === 'character' || typeof child?.projectId !== 'string') continue;
		const id = claimedId(value);
		if (!id || keep.has(id)) continue;
		if (doomed.some((d) => d.kind === 'character' && d.projectId === child.projectId)) gone.add(id);
	}
	return [...gone];
}

export async function readDeleted(): Promise<RecentlyDeleted[]> {
	return listEntries(await db.all<unknown>('projects'));
}

/** Entries a new one would push out, so a delete can remove them in its own transaction. */
export async function keysToPrune(): Promise<string[]> {
	return pruneKeys(await db.all<unknown>('projects'));
}

/** Permanently delete one entry, with the child entries of a character (they could never be restored without it). Its
 *  artwork is released by the next idle sweep, which is where every delete leaves it. */
export async function deleteForever(id: string): Promise<void> {
	if (!id.startsWith(RECENTLY_DELETED_PREFIX)) throw new Error('Not a recently deleted entry.');
	const values = await db.all<unknown>('projects');
	const entry = readEntry(values.find((value) => claimedId(value) === id));
	const doomed = new Set([id]);
	if (entry?.kind === 'character')
		for (const value of values) {
			const child = readEntry(value);
			const loose = value as { kind?: unknown; projectId?: unknown };
			const projectId = child?.projectId ?? loose?.projectId;
			const kind = child?.kind ?? loose?.kind;
			if (kind === 'character' || projectId !== entry.projectId) continue;
			if (child && child.lineageId !== entry.lineageId) continue;
			const childId = child?.id ?? claimedId(value);
			if (childId && childId !== entry.id) doomed.add(childId);
		}
	await Promise.all([...doomed].map((key) => db.del('projects', key)));
}

const artworkHexes = (e: RecentlyDeleted) => {
	const hexes = new Set<string>();
	for (const [hash] of artworkRefs(e.before.manifest)) {
		const hex =
			typeof hash === 'string' ? /^(?:sha256:)?([0-9a-f]{64})$/.exec(hash)?.[1] : undefined;
		if (hex) hexes.add(hex);
	}
	return hexes;
};

/** Drop the entry's Undo history whose artwork is no longer on this device, then refuse it when artwork it shows is gone too.
 *  History is never drawn or exported, while a reference to absent artwork would break Undo and Adjust frame on the restored
 *  character. Returns what is stored, so the restore can drop the same history from the entry its transaction reads. */
async function availableArtwork(e: RecentlyDeleted): Promise<(hex: string) => boolean> {
	const hexes = artworkHexes(e);
	const { stored } = hexes.size ? await db.readCharacters([...hexes]) : { stored: new Set() };
	const has = (hex: string) => stored.has(hex);
	pruneHistory(e.before.manifest, has);
	const away = [...artworkHexes(e)].filter((hex) => !has(hex)).length;
	if (away) throw missingArtworkError(e.name, away);
	return has;
}

export const gone = (key: string) =>
	new LocalizedError('This is no longer in Trash.', 'recentlyDeleted.errors.gone', {
		key
	}) as LocalizedError & { key: string };

export const expiredError = () =>
	new LocalizedError(
		'Deleted items are kept for 30 days. This one has expired.',
		'recentlyDeleted.errors.expired'
	);

export const missingArtworkError = (name: string, count: number) =>
	new LocalizedError(
		'Some saved artwork for this is no longer on this device, so it cannot be restored.',
		'recentlyDeleted.errors.missingArtwork',
		{ name, count }
	);

export const quotaError = () =>
	new LocalizedError(
		'Your browser is out of space, so nothing was deleted. Restore or permanently delete something in Recently deleted, then try again.',
		'recentlyDeleted.errors.full'
	);

export const wrongKind = () =>
	new LocalizedError(
		'That deleted item belongs to a character. Restore the character first.',
		'recentlyDeleted.errors.wrongKind'
	);

export async function restoreParts(id: string): Promise<{
	items: number;
	outfits: number;
	skipped: number;
	worn: { slot: string; item: string }[];
	name: string;
	projectId: string;
}> {
	const entry = readEntry(await db.get<unknown>('projects', id));
	if (!entry) throw gone(id);
	if (entry.kind === 'character') throw wrongKind();
	if (expired(entry)) throw expiredError();
	const has = await availableArtwork(entry);
	let out:
		| {
				items: number;
				outfits: number;
				skipped: number;
				worn: { slot: string; item: string }[];
				name: string;
				projectId: string;
		  }
		| undefined;
	await db.update<DressedRecord>(
		'projects',
		entry.projectId,
		(rec, related) => {
			const e = readEntry(related(id));
			if (!e) throw gone(id);
			if (e.kind === 'character') throw wrongKind();
			pruneHistory(e.before.manifest, has);
			if (!rec?.manifest)
				throw new LocalizedError('This character is no longer saved.', 'detailsSheet.notSaved');
			const restored = restoreRemoved(rec, e.before as DressedRecord, {
				itemIds: e.scope.itemIds ?? [],
				slot: e.scope.slot
			});
			out = { ...restored, name: e.name, projectId: e.projectId };
			if (restored.refused === 'geometry')
				throw new LocalizedError(
					"This character's frame size or directions changed since this was deleted, so it can no longer line up.",
					'recentlyDeleted.errors.partsGeometry'
				);
			return rec;
		},
		[id],
		undefined,
		[id]
	);
	if (!out) throw gone(id);
	return out;
}

/** Restore a deleted move or state: its clip and every row scoped to it, if the character still fits it. */
export async function restoreMoveEntry(id: string): Promise<{ name: string; projectId: string }> {
	const entry = readEntry(await db.get<unknown>('projects', id));
	if (!entry) throw gone(id);
	if (expired(entry)) throw expiredError();
	if (!entry.scope.moveId) throw gone(id);
	await availableArtwork(entry);
	const live = await db.get<StoredProject>('projects', entry.projectId);
	if (!live?.manifest)
		throw new LocalizedError('This character is no longer saved.', 'detailsSheet.notSaved');
	// The frame hash is work done outside the transaction; the write below refuses if the character changed meanwhile.
	const version = stableStringify([live.manifest, live.skeletons ?? null, live.rigQa ?? null]);
	const next = structuredClone(live);
	const result = await restoreMove(next, entry.before, entry.scope.moveId);
	if (result === 'exists')
		throw new LocalizedError(
			'This move is already on the character.',
			'recentlyDeleted.errors.movePresent'
		);
	if (result === 'missing') throw gone(id);
	if (result === 'itemsMissing')
		throw new LocalizedError(
			'One of this move’s items is deleted. Restore that item first, then this move.',
			'recentlyDeleted.errors.moveItemsMissing'
		);
	if (result === 'geometry')
		throw new LocalizedError(
			"This character's frame size or directions changed since this move was deleted, so it can no longer line up.",
			'recentlyDeleted.errors.moveGeometry'
		);
	await db.update<StoredProject>(
		'projects',
		entry.projectId,
		(rec, related) => {
			if (!rec?.manifest)
				throw new LocalizedError('This character is no longer saved.', 'detailsSheet.notSaved');
			if (stableStringify([rec.manifest, rec.skeletons ?? null, rec.rigQa ?? null]) !== version)
				throw new LocalizedError(
					'This character changed before the move could be restored. Try again.',
					'moveRemoval.concurrentEdit'
				);
			if (!readEntry(related(id))) throw gone(id);
			rec.manifest = next.manifest;
			rec.skeletons = next.skeletons;
			rec.rigQa = next.rigQa;
			rec.savedAt = new Date().toISOString();
			return rec;
		},
		[id],
		undefined,
		[id]
	);
	return { name: entry.name, projectId: entry.projectId };
}

export interface RestoredCharacter {
	/** The key it is saved under now: its own, or a new one when that key was taken meanwhile. */
	id: string;
	name: string;
	copied: boolean;
	drafts: number;
}

const draftId = (d: any) =>
	d?.draft?.spec?.id ?? d?.id ?? (typeof d === 'object' && d ? JSON.stringify(d) : String(d));

/** Restore a deleted character: under its own key, or as a copy when that key is taken, together with the drafts its
 *  delete removed and the child entries that belong to it. One transaction: all of it comes back or none does. */
export async function restoreCharacter(
	id: string,
	options: { copyName: (name: string) => string }
): Promise<RestoredCharacter> {
	const entry = readEntry(await db.get<unknown>('projects', id));
	if (!entry) throw gone(id);
	if (entry.kind !== 'character') throw wrongKind();
	if (expired(entry)) throw expiredError();
	const has = await availableArtwork(entry);
	let out: RestoredCharacter | undefined;
	await db.editIdleCharacter(entry.projectId, 'restore', (projects, records) => {
		const e = readEntry(records.find((r) => r?.id === id));
		if (!e) throw gone(id);
		if (expired(e)) throw expiredError();
		const taken = records.some((r) => r?.id === e.projectId),
			next = taken ? `rig-${crypto.randomUUID()}` : e.projectId;
		const record = structuredClone(e.before);
		pruneHistory(record.manifest, has);
		record.id = next;
		// The key is a fresh one, so the character is a copy from here on: it says so, and its name says why.
		if (taken) {
			record.manifest.name = options.copyName(record.manifest.name);
			record.restoredFrom = {
				id: e.lineageId,
				fingerprint: e.before.restoredFrom?.fingerprint ?? '',
				at: new Date().toISOString(),
				build: e.before.restoredFrom?.build ?? ''
			};
		}
		record.savedAt = new Date().toISOString();
		projects.put(record, next);
		projects.delete(id);
		// Child entries belong to the character's lineage: point them at where it lives now, before record included, or
		// readEntry would reject them against their new key and they would vanish from the list.
		for (const r of records) {
			const child = readEntry(r);
			if (!child || child.kind === 'character' || child.projectId !== e.projectId) continue;
			projects.put({ ...child, projectId: next, before: { ...child.before, id: next } }, child.id);
		}
		let drafts = 0;
		if (e.drafts?.length) {
			const remap = (d: any) => {
				if (!taken || !d || typeof d !== 'object') return d;
				if (d.draft) return { ...d, draft: { ...d.draft, rigId: next } };
				return 'rigId' in d ? { ...d, rigId: next } : d;
			};
			for (const list of ['gens', 'drafts'] as const) {
				const key = list === 'gens' ? 'studio-drafts' : 'm3-drafts';
				const fresh = e.drafts.filter((d) => d.list === list).map((d) => remap(d.entry));
				if (!fresh.length) continue;
				const saved = records.find((r) => r?.id === key) as any;
				const known = new Set((saved?.[list] ?? []).map(draftId));
				const add = fresh.filter((d) => !known.has(draftId(d)));
				if (!add.length) continue;
				projects.put(
					{ ...(saved ?? { id: key }), [list]: [...(saved?.[list] ?? []), ...add] },
					key
				);
				drafts += add.length;
			}
		}
		out = { id: next, name: record.manifest.name, copied: taken, drafts };
	});
	if (!out) throw gone(id);
	return out;
}
