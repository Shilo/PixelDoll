// The only part of sync that knows PixelDoll's data: which records sync, which fields stay on this device, how a
// character's artwork is found and verified, and how a remote change is written (through the same idle-character write
// as local edits, refused while generation work holds the character).
import { stableStringify } from '../image/hash.ts';
import { LocalizedError } from '../message.ts';
import { decodePngBytes } from '../image/pngraw.ts';
import { cellHash } from '../rig/rig.ts';
import * as db from '../store/db.ts';
import { checkExportIdentity } from '../store/identity.ts';
import { manifestShape } from '../store/import.ts';
import { blobReferences } from '../store/incompatible.ts';
import { CURRENT_FORMAT, supportedFormat, type Manifest } from '../store/manifest.ts';
import type { StoredProject } from '../store/project.ts';
import { RECENTLY_DELETED_PREFIX, type RecentlyDeleted } from '../store/recently-deleted.ts';
import { studioCharacter } from '../store/workspace.ts';
import type { Library } from './core/engine.ts';
import type { Path } from './core/merge.ts';
import { studioHooks } from './connection.ts';

/** Receipts of paid attempts and other state that only makes sense on the device that made it (exports strip them too),
 *  plus savedAt, which every save changes. */
const LOCAL_FIELDS = [
	'creationSpec',
	'moveRecovery',
	'moveReviews',
	'stateGeneration',
	'savedAt'
] as const;

export function syncedBody(record: StoredProject): Record<string, unknown> {
	const body: Record<string, unknown> = { ...record };
	for (const field of LOCAL_FIELDS) delete body[field];
	return body;
}

const formatNumber = (format: unknown) =>
	typeof format === 'string' ? Number(/^pixeldoll\/(\d+)$/.exec(format)?.[1] ?? NaN) : NaN;

class Refused extends Error {}

export const pixeldollLibrary: Library = {
	async read() {
		const { projects } = await db.readWorkspaceSnapshot(
			(key, value) => studioCharacter(key, value) || key.startsWith(RECENTLY_DELETED_PREFIX),
			() => new Map(),
			false
		);
		const bodies = new Map<string, unknown>(),
			deleted = new Set<string>();
		for (const [key, value] of projects) {
			if (key.startsWith(RECENTLY_DELETED_PREFIX)) {
				const entry = value as Partial<RecentlyDeleted>;
				if (entry.kind === 'character' && typeof entry.projectId === 'string')
					deleted.add(entry.projectId);
			} else if (supportedFormat((value as StoredProject).manifest?.format))
				bodies.set(key, syncedBody(value as StoredProject));
		}
		return { bodies, deleted };
	},
	refs: (body) => [...blobReferences([body])],
	async blob(hash) {
		const blob = await db.getBlob(hash);
		return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
	},
	async verify(hash, bytes) {
		try {
			return (await cellHash(await decodePngBytes(bytes))) === `sha256:${hash}`;
		} catch {
			return false; // not a readable PNG: never stored
		}
	},
	async apply(id, expected, next, art) {
		if (!studioHooks.mayWrite(id)) return false;
		const blobs = new Map(
			[...art].map(([hash, bytes]) => [
				hash,
				new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' })
			])
		);
		try {
			await db.editIdleCharacter(
				id,
				'restore',
				(projects, records) => {
					const current = records.find((r) => r?.id === id) as StoredProject | undefined;
					const now = current && studioCharacter(id, current) ? syncedBody(current) : undefined;
					if (stableStringify(now) !== stableStringify(expected)) throw new Refused();
					if (next === undefined) {
						projects.delete(id);
						for (const record of records) {
							const change = db.withoutCharacters(record, new Set([id]));
							if (change) projects.put(change, record.id);
						}
						return;
					}
					const kept: Record<string, unknown> = {};
					for (const field of LOCAL_FIELDS)
						if (current?.[field] !== undefined) kept[field] = current[field];
					projects.put({ ...(next as object), ...kept, savedAt: new Date().toISOString() }, id);
				},
				blobs
			);
		} catch (error) {
			// Busy (generation work holds it) or changed since the sync read it: the next sync tries again.
			if (error instanceof Refused || error instanceof LocalizedError) return false;
			throw error;
		}
		studioHooks.applied([id]);
		return true;
	},
	check(body) {
		const manifest = (body as { manifest?: Manifest } | null)?.manifest;
		if (!supportedFormat(manifest?.format))
			return formatNumber(manifest?.format) > formatNumber(CURRENT_FORMAT) ? 'newer' : 'invalid';
		try {
			manifestShape(manifest);
			checkExportIdentity(manifest);
			const items = new Set(manifest.items.map((item) => item.id));
			for (const preset of manifest.presets ?? [])
				for (const id of Object.values(preset.items ?? {}))
					if (id && !items.has(id)) return 'invalid';
			return 'ok';
		} catch {
			return 'invalid';
		}
	},
	policy: {
		// What a character wears right now: the latest pick wins, it is never worth a question.
		quiet: (path: Path) => path.length === 1 && path[0] === 'dress'
	}
};
