// Recently deleted: one durable entry per deletion, written in the same transaction as the delete. It holds the saved
// record exactly as it was (JSON and artwork hashes only, never pixel copies), so a restore can put back what was removed
// after a reload, a later delete or an accidental tap. The entry is a projects-store record, and blobs are kept alive by
// reference (gcBlobs scans every record), so the artwork a restore needs cannot be swept while the entry lives.
import * as db from './db.ts';
import { LocalizedError } from '../message.ts';
import type { StoredProject } from './project.ts';
import { restoreRemoved, type DressedRecord } from './project.ts';
import { supportedFormat } from './manifest.ts';
import { artworkRefs } from './workspace.ts';
import { restoreMove } from '../rig/moves.ts';
import { stableStringify } from '../image/hash.ts';

export const RECENTLY_DELETED_PREFIX = 'recently-deleted:';
/** How long an entry stays restorable. */
export const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
/** How many entries are kept, newest first: the oldest goes when a new one would exceed this. */
export const MAX_ENTRIES = 50;

/** What was deleted. `character` removes a whole saved character; the rest are parts of one. */
export type DeletedKind = 'character' | 'items' | 'category' | 'move' | 'directions';

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

const KIND_NAMES: readonly DeletedKind[] = ['character', 'items', 'category', 'move', 'directions'];

/** A character's lineage: the original it was restored from, or itself. */
export const lineageOf = (record: StoredProject) => record.restoredFrom?.id ?? record.id;

export const entryKey = () => `${RECENTLY_DELETED_PREFIX}${crypto.randomUUID()}`;

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
		before: structuredClone(o.record),
		...(o.drafts?.length ? { drafts: structuredClone(o.drafts) } : {})
	};
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

/** Keys to remove before writing one more entry: expired ones, and the oldest while at the cap. Only entries this version
 *  can read are pruned; nothing else writes this prefix. */
export function pruneKeys(values: readonly unknown[], now = Date.now(), room = 1): string[] {
	const all = readable(values).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
	const kept = all.filter((e) => !expired(e, now)).slice(0, Math.max(0, MAX_ENTRIES - room));
	const keep = new Set(kept.map((e) => e.id));
	return all.filter((e) => !keep.has(e.id)).map((e) => e.id);
}

export async function readDeleted(): Promise<RecentlyDeleted[]> {
	return listEntries(await db.all<unknown>('projects'));
}

/** Entries a new one would push out, so a delete can remove them in its own transaction. */
export async function keysToPrune(): Promise<string[]> {
	return pruneKeys(await db.all<unknown>('projects'));
}

/** Permanently delete one entry. Its artwork is released by the next idle sweep, which is where every delete leaves it. */
export async function deleteForever(id: string): Promise<void> {
	if (!id.startsWith(RECENTLY_DELETED_PREFIX)) throw new Error('Not a recently deleted entry.');
	await db.del('projects', id);
}

/** How many of the entry's artwork files are no longer on this device, so the list can explain a blocked restore. */
export async function missingArtwork(e: RecentlyDeleted): Promise<number> {
	const hexes = new Set<string>();
	for (const [hash] of artworkRefs(e.before.manifest, true)) {
		const hex =
			typeof hash === 'string' ? /^(?:sha256:)?([0-9a-f]{64})$/.exec(hash)?.[1] : undefined;
		if (hex) hexes.add(hex);
	}
	if (!hexes.size) return 0;
	const { stored } = await db.readCharacters([...hexes]);
	return hexes.size - stored.size;
}

export const gone = (key: string) =>
	new LocalizedError('That deleted item is no longer available.', 'recentlyDeleted.errors.gone', {
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
	const away = await missingArtwork(entry);
	if (away) throw missingArtworkError(entry.name, away);
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
			if (!rec?.manifest)
				throw new LocalizedError('This character is no longer saved.', 'detailsSheet.notSaved');
			const restored = restoreRemoved(rec, e.before as DressedRecord, {
				itemIds: e.scope.itemIds ?? [],
				slot: e.scope.slot
			});
			out = { ...restored, name: e.name, projectId: e.projectId };
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
	const away = await missingArtwork(entry);
	if (away) throw missingArtworkError(entry.name, away);
	const live = await db.get<StoredProject>('projects', entry.projectId);
	if (!live?.manifest)
		throw new LocalizedError('This character is no longer saved.', 'detailsSheet.notSaved');
	// The frame hash is work done outside the transaction; the write below refuses if the character changed meanwhile.
	const version = stableStringify(live.manifest);
	const next = structuredClone(live);
	const result = await restoreMove(next, entry.before, entry.scope.moveId);
	if (result === 'exists')
		throw new LocalizedError(
			'This move is already on the character.',
			'recentlyDeleted.errors.movePresent'
		);
	if (result === 'missing') throw gone(id);
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
			if (stableStringify(rec.manifest) !== version)
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
	const away = await missingArtwork(entry);
	if (away) throw missingArtworkError(entry.name, away);
	let out: RestoredCharacter | undefined;
	await db.editIdleCharacter(entry.projectId, 'restore', (projects, records) => {
		const e = readEntry(records.find((r) => r?.id === id));
		if (!e) throw gone(id);
		if (expired(e)) throw expiredError();
		const taken = records.some((r) => r?.id === e.projectId),
			next = taken ? `rig-${crypto.randomUUID()}` : e.projectId;
		const record = structuredClone(e.before);
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
		// Child entries belong to the character's lineage: point them at where it lives now.
		for (const r of records) {
			const child = readEntry(r);
			if (!child || child.kind === 'character' || child.projectId !== e.projectId) continue;
			projects.put({ ...child, projectId: next }, child.id);
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
