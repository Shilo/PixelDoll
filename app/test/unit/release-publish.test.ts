import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { Source } from '../../scripts/release/data.ts';
import type { Asset, Release } from '../../scripts/release/github.ts';
import { emptyNotes } from '../../scripts/release/notes.ts';
import { publishRelease } from '../../scripts/release/publish.ts';

const source = {
	version: '1.2.3',
	date: '2026-11-27',
	cutoff: '2026-11-27T15:00:00.000Z',
	sha: 'a'.repeat(40),
	previousSha: 'b'.repeat(40),
	model: null,
	commits: [],
	notes: emptyNotes
} satisfies Source;
const draft = { id: 1, draft: true, tag_name: 'v1.2.3', upload_url: '' } satisfies Release;
const banner = new Uint8Array([1, 2, 3]);
const asset = {
	id: 2,
	name: 'banner.4x.png',
	label: 'banner@4x.png',
	size: banner.length,
	state: 'uploaded',
	digest: 'sha256:' + createHash('sha256').update(banner).digest('hex'),
	browser_download_url:
		'https://github.com/Shilo/PixelDoll/releases/download/untagged-1a2b3c/banner.4x.png'
} satisfies Asset;
const publish = (github: Parameters<typeof publishRelease>[0]) =>
	publishRelease(github, source, emptyNotes, { total: 0, groups: [] }, banner, true);

function fakeGitHub() {
	let tag: string | undefined;
	let release: Release | undefined;
	let assets: Asset[] = [];
	return {
		repository: 'Shilo/PixelDoll',
		tagCommit: vi.fn(async () => tag),
		release: vi.fn(async () => release),
		createDraft: vi.fn(async () => {
			release = draft;
			return draft;
		}),
		assets: vi.fn(async function* () {
			yield* assets;
		}),
		deleteStarterAsset: vi.fn(async (id: number) => {
			assets = assets.filter((item) => item.id !== id);
		}),
		uploadAsset: vi.fn(async () => {
			assets.push(asset);
			return asset;
		}),
		assetBytes: vi.fn(async () => Buffer.from(banner)),
		// Publishing a draft creates its tag on the draft's target commit, as GitHub does.
		publish: vi.fn(async (_id, _name, _body, _latest) => {
			release = { ...draft, draft: false };
			tag = source.sha;
		})
	};
}

it('creates the tag by publishing, once, resuming an already published release without mutations', async () => {
	const github = fakeGitHub();
	await publish(github);
	await publish(github);
	expect(github.createDraft).toHaveBeenCalledTimes(1);
	expect(github.uploadAsset).toHaveBeenCalledExactlyOnceWith(draft, 'banner@4x.png', banner);
	expect(github.publish).toHaveBeenCalledExactlyOnceWith(
		draft.id,
		'PixelDoll 1.2.3: A PixelDoll maintenance release',
		expect.stringContaining(
			'https://github.com/Shilo/PixelDoll/releases/download/v1.2.3/banner.4x.png'
		),
		true
	);
	expect(github.tagCommit).toHaveBeenCalledTimes(4);
});

it('fails before writing when the release tag points at a different build', async () => {
	const github = fakeGitHub();
	github.tagCommit.mockResolvedValue(source.previousSha);
	await expect(publish(github)).rejects.toThrow(/expected/);
	expect(github.createDraft).not.toHaveBeenCalled();
});

it('retries a draft with an interrupted upload, checking the uploaded asset before publishing', async () => {
	const github = fakeGitHub();
	github.tagCommit.mockResolvedValue(source.sha);
	github.release.mockResolvedValue(draft);
	github.assets.mockImplementationOnce(async function* () {
		yield { ...asset, state: 'starter' };
	});
	await publish(github);
	expect(github.deleteStarterAsset).toHaveBeenCalledExactlyOnceWith(asset.id);
	expect(github.uploadAsset).toHaveBeenCalledTimes(1);
	expect(github.publish).toHaveBeenCalledTimes(1);
});
