// The raw PixelLab results a saved character's paid requests still have on this device. The manifest keeps only request
// identity (`Provenance`), so a character names its requests by hash and remote job id while the jobs ledger keeps the pixels.
import type { Manifest } from '../store/manifest.ts';
import type { ZipEntry } from '../store/zip.ts';
import { LocalizedError } from '../message.ts';
import { paidResultsZip } from './paid-results.ts';
import type { JobRec } from './queue.ts';

/** One archive is built in memory and read on the main thread: keep the largest library a user can plausibly have. */
export const MAX_ORIGINALS_BYTES = 256 * 1024 * 1024;

/** The paid requests a character's saved artwork names. */
export interface OriginRequests {
	hashes: Set<string>;
	jobs: Set<string>;
}

export function originRequests(manifest: Manifest): OriginRequests {
	const hashes = new Set<string>(),
		jobs = new Set<string>();
	for (const item of manifest.items ?? [])
		for (const entry of item.provenance ?? []) {
			if (entry.requestHash) hashes.add(entry.requestHash);
			if (entry.jobId) jobs.add(entry.jobId);
		}
	return { hashes, jobs };
}

/** A ledger record is one of those requests, by its request hash or any of its remote job ids. */
export const isOriginRequest = (requests: OriginRequests, record: JobRec): boolean =>
	requests.hashes.has(`sha256:${record.requestHash}`) ||
	(Array.isArray(record.jobs) && record.jobs.some((job) => requests.jobs.has(job?.id)));

export interface CharacterOrigin {
	name: string;
	manifest: Manifest;
}

export interface OriginPlan {
	/** Ledger records that belong to a saved character, one per record, in character then ledger order. */
	records: JobRec[];
	withOriginals: CharacterOrigin[];
	withoutOriginals: CharacterOrigin[];
}

export function planOrigins(
	characters: readonly CharacterOrigin[],
	jobs: readonly JobRec[]
): OriginPlan {
	const records: JobRec[] = [],
		withOriginals: CharacterOrigin[] = [],
		withoutOriginals: CharacterOrigin[] = [],
		seen = new Set<string>();
	for (const character of characters) {
		const requests = originRequests(character.manifest),
			mine = jobs.filter((record) => isOriginRequest(requests, record));
		if (mine.length) withOriginals.push(character);
		else withoutOriginals.push(character);
		for (const record of mine)
			if (!seen.has(record.id)) {
				seen.add(record.id);
				records.push(record);
			}
	}
	return { records, withOriginals, withoutOriginals };
}

/** One ZIP: a folder per character with its results as returned plus requests.json, named by `folder`. Characters whose
 *  matched requests have no readable image are reported rather than left to look complete. */
export async function originalsZip(
	plan: OriginPlan,
	folder: (character: CharacterOrigin, index: number) => string,
	read: (sha: string) => Promise<Blob | undefined>,
	maxBytes = MAX_ORIGINALS_BYTES
): Promise<{ entries: ZipEntry[]; images: number; withoutImages: CharacterOrigin[] }> {
	const entries: ZipEntry[] = [],
		withoutImages: CharacterOrigin[] = [];
	let images = 0,
		bytes = 0;
	for (const [index, character] of plan.withOriginals.entries()) {
		const requests = originRequests(character.manifest);
		const mine = plan.records.filter((record) => isOriginRequest(requests, record));
		const prefix = `${folder(character, index)}/`;
		const before = images;
		for (const entry of await paidResultsZip(mine, read)) {
			bytes += entry.data.byteLength;
			if (bytes > maxBytes)
				throw new LocalizedError(
					'The original generations are too large to download at once.',
					'librarySettings.originalsTooLarge'
				);
			if (entry.name.endsWith('.png')) images++;
			entries.push({ ...entry, name: prefix + entry.name });
		}
		if (images === before) withoutImages.push(character);
	}
	return { entries, images, withoutImages };
}
