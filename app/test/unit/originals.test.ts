import { expect, test } from 'vitest';
import {
	isOriginRequest,
	originalsZip,
	originRequests,
	planOrigins,
	type CharacterOrigin
} from '../../src/lib/pixellab/originals.ts';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';
import { LocalizedError } from '../../src/lib/message.ts';

const character = (
	name: string,
	provenance: { requestHash?: string; jobId?: string }[]
): CharacterOrigin => ({
	name,
	manifest: { name, items: [{ provenance }] } as unknown as Manifest
});

const record = (id: string, requestHash: string, remoteIds: string[]): JobRec =>
	({
		id,
		label: id,
		method: 'POST',
		endpoint: '/characters/animations',
		params: {},
		inputs: [],
		requestHash,
		state: 'done',
		attempts: 1,
		nextAt: 0,
		createdAt: 0,
		gens: 1,
		usd: 0,
		jobs: remoteIds.map((remote) => ({
			id: remote,
			status: 'completed',
			done: true,
			results: [{ label: 'frame', sha: `sha-${remote}` }]
		}))
	}) as unknown as JobRec;

test('a character names its requests by hash and remote job id', () => {
	const requests = originRequests(
		character('Hero', [{ requestHash: 'sha256:aa', jobId: 'remote-1' }]).manifest
	);
	expect(requests.hashes).toEqual(new Set(['sha256:aa']));
	expect(requests.jobs).toEqual(new Set(['remote-1']));
	expect(isOriginRequest(requests, record('a', 'aa', []))).toBe(true);
	expect(isOriginRequest(requests, record('b', 'bb', ['remote-1']))).toBe(true);
	expect(isOriginRequest(requests, record('c', 'cc', ['remote-2']))).toBe(false);
	// A damaged stored row never stops the ledger read.
	expect(isOriginRequest(requests, { id: 'damaged', jobs: null } as unknown as JobRec)).toBe(false);
});

test('planning splits characters with kept originals from those without and counts each record once', () => {
	const shared = record('shared', 'aa', ['remote-1']);
	const own = record('own', 'bb', []);
	const plan = planOrigins(
		[
			character('Hero', [{ requestHash: 'sha256:aa', jobId: 'remote-1' }]),
			character('Villain', [{ requestHash: 'sha256:aa' }, { requestHash: 'sha256:bb' }]),
			character('Imported', [])
		],
		[shared, own, record('unrelated', 'zz', [])]
	);
	expect(plan.records.map((entry) => entry.id)).toEqual(['shared', 'own']);
	expect(plan.withOriginals.map((entry) => entry.name)).toEqual(['Hero', 'Villain']);
	expect(plan.withoutOriginals.map((entry) => entry.name)).toEqual(['Imported']);
});

test('the originals ZIP keeps each character in its own folder with the returned bytes', async () => {
	const plan = planOrigins(
		[character('Hero', [{ requestHash: 'sha256:aa' }]), character('Imported', [])],
		[record('a', 'aa', ['remote-1'])]
	);
	const bytes = new Uint8Array([7, 8, 9]);
	const { entries, images, withoutImages } = await originalsZip(
		plan,
		(entry, index) => `0${index + 1}-${entry.name}`,
		async () => new Blob([bytes])
	);
	expect(images).toBe(1);
	expect(withoutImages).toEqual([]);
	expect(entries.map((entry) => entry.name)).toEqual([
		'01-Hero/01-characters-animations/frame.png',
		'01-Hero/requests.json'
	]);
	expect(entries[0].data).toEqual(bytes);
});

test('a character whose images are gone is reported, not shown as complete', async () => {
	const plan = planOrigins(
		[character('Hero', [{ requestHash: 'sha256:aa' }])],
		[record('a', 'aa', ['remote-1'])]
	);
	const { entries, images, withoutImages } = await originalsZip(
		plan,
		() => 'folder',
		async () => undefined
	);
	expect(images).toBe(0);
	expect(withoutImages.map((entry) => entry.name)).toEqual(['Hero']);
	expect(entries.map((entry) => entry.name)).toEqual(['folder/requests.json']);
});

test('an archive over the size limit stops instead of building it', async () => {
	const plan = planOrigins(
		[character('Hero', [{ requestHash: 'sha256:aa' }])],
		[record('a', 'aa', ['remote-1'])]
	);
	await expect(
		originalsZip(
			plan,
			() => 'folder',
			async () => new Blob([new Uint8Array(4)]),
			3
		)
	).rejects.toBeInstanceOf(LocalizedError);
});
