import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { Claude } from '../../scripts/release/claude.ts';
import type { Asset, Release } from '../../scripts/release/github.ts';
import { publicNotes, type CitedNotes } from '../../scripts/release/notes.ts';
import { updateRelease } from '../../scripts/release/update.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';

const version = '1.2.3';
const cited: CitedNotes = {
	headline: 'Dress faster',
	intro: 'You can now dress your characters faster.',
	highlights: [
		{ title: 'Quick outfits', text: 'Save an outfit in one tap.', commits: ['abc1234'] }
	],
	fixes: []
};
const release: Release = {
	id: 7,
	draft: false,
	tag_name: 'v1.2.3',
	upload_url: 'https://x/{?name}'
};
const folders: string[] = [];
afterEach(() => {
	for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const banner = (w: number, h: number, shade: number) =>
	encodePngBytes({
		w,
		h,
		data: Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? 255 : shade))
	});

async function setUp() {
	const folder = mkdtempSync(join(tmpdir(), 'pixeldoll-update-'));
	folders.push(folder);
	const dir = join(folder, version);
	mkdirSync(dir);
	const json = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value));
	json(join(dir, 'source.json'), {
		version,
		date: '2026-11-27',
		cutoff: '2026-11-27T15:00:00.000Z',
		sha: 'b'.repeat(40),
		previousSha: 'a'.repeat(40),
		model: 'claude-sonnet-5-5',
		commits: [],
		notes: cited
	});
	json(join(dir, 'notes.en.json'), publicNotes(cited));
	json(join(dir, 'notes.de.json'), { ...publicNotes(cited), headline: 'Schneller anziehen' });
	json(join(dir, 'changes.json'), { total: 0, groups: [] });
	writeFileSync(join(dir, 'banner.png'), await banner(320, 160, 200));
	writeFileSync(join(folder, 'banner.png'), await banner(320, 160, 90));
	json(join(folder, 'index.json'), {
		releases: [
			{
				version,
				date: '2026-11-27',
				features: 1,
				banner: true,
				headline: { en: 'Dress faster', de: 'Schneller anziehen' }
			}
		]
	});
	// Like GitHub: an upload may be stored under a normalized name with the requested name as its label.
	const stored = new Map<number, Uint8Array>([[1, await banner(4, 4, 10)]]);
	const asset = (id: number, bytes: Uint8Array): Asset => ({
		id,
		name: 'banner.4x.png',
		label: 'banner@4x.png',
		state: 'uploaded',
		size: bytes.length,
		digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
		browser_download_url: 'u'
	});
	let assets = [asset(1, stored.get(1)!)];
	const github = {
		repository: 'Shilo/PixelDoll',
		release: vi.fn(async () => release),
		assets: vi.fn(async function* () {
			yield* assets;
		}),
		assetBytes: vi.fn(async (id: number) => Buffer.from(stored.get(id)!)),
		deleteAsset: vi.fn(async (id: number) => {
			assets = assets.filter((item) => item.id !== id);
		}),
		uploadAsset: vi.fn(async (_release: Release, _name: string, bytes: Uint8Array) => {
			const id = Math.max(0, ...stored.keys()) + 1;
			stored.set(id, bytes);
			assets.push(asset(id, bytes));
			return assets.at(-1)!;
		}),
		updateRelease: vi.fn(async () => undefined)
	};
	return { folder, dir, github };
}

it('re-publishes an edited banner and body without translating unchanged English notes', async () => {
	const { folder, github } = await setUp();
	const claude = vi.fn((): Claude => {
		throw new Error('unchanged notes must not call Claude');
	});
	await expect(updateRelease(github, folder, version, claude)).resolves.toBe(false);
	expect(claude).not.toHaveBeenCalled();
	expect(github.deleteAsset).toHaveBeenCalledExactlyOnceWith(1);
	expect(github.uploadAsset).toHaveBeenCalledOnce();
	expect(github.updateRelease).toHaveBeenCalledExactlyOnceWith(
		7,
		'PixelDoll 1.2.3: Dress faster',
		expect.stringContaining('releases/download/v1.2.3/banner.4x.png')
	);
	// The same banner again is left alone.
	await updateRelease(github, folder, version, claude);
	expect(github.uploadAsset).toHaveBeenCalledOnce();
});

it('re-translates edited English notes, updates the index headlines and records what was published', async () => {
	const { folder, dir, github } = await setUp();
	const edited = { ...publicNotes(cited), headline: 'Dress your cast faster' };
	writeFileSync(join(dir, 'notes.en.json'), JSON.stringify(edited));
	const stream = vi.fn(() => ({
		finalMessage: async () => ({
			stop_reason: 'end_turn',
			content: [{ type: 'text', text: JSON.stringify({ ...edited, headline: 'Übersetzt' }) }]
		})
	}));
	const claude = { beta: { messages: { stream } } } as unknown as Claude;
	await expect(updateRelease(github, folder, version, () => claude)).resolves.toBe(true);
	expect(stream).toHaveBeenCalledTimes(9);
	expect(JSON.parse(readFileSync(join(dir, 'notes.de.json'), 'utf8')).headline).toBe('Übersetzt');
	const index = JSON.parse(readFileSync(join(folder, 'index.json'), 'utf8'));
	expect(index.releases[0].headline).toMatchObject({
		en: 'Dress your cast faster',
		de: 'Übersetzt'
	});
	expect(JSON.parse(readFileSync(join(folder, 'latest.json'), 'utf8'))).toEqual({
		version,
		features: 1
	});
	expect(JSON.parse(readFileSync(join(dir, 'source.json'), 'utf8')).publishedEn).toEqual(edited);
	// A second run sees nothing new to translate.
	stream.mockClear();
	await updateRelease(github, folder, version, () => claude);
	expect(stream).not.toHaveBeenCalled();
});

it('rejects invalid edited notes before touching GitHub', async () => {
	const { folder, dir, github } = await setUp();
	writeFileSync(
		join(dir, 'notes.en.json'),
		JSON.stringify({ ...publicNotes(cited), headline: '' })
	);
	await expect(updateRelease(github, folder, version, vi.fn())).rejects.toThrow(/not valid/);
	expect(github.updateRelease).not.toHaveBeenCalled();
});

it('shows the default banner once a release drops its own, and refuses a banner of the wrong size', async () => {
	const { folder, dir, github } = await setUp();
	unlinkSync(join(dir, 'banner.png'));
	await expect(updateRelease(github, folder, version, vi.fn())).resolves.toBe(true);
	expect(JSON.parse(readFileSync(join(folder, 'index.json'), 'utf8')).releases[0].banner).toBe(
		false
	);
	expect(github.uploadAsset).toHaveBeenCalledOnce();
	writeFileSync(join(dir, 'banner.png'), await banner(640, 320, 200));
	github.updateRelease.mockClear();
	await expect(updateRelease(github, folder, version, vi.fn())).rejects.toThrow(
		'releases/1.2.3/banner.png is 640x320; banners are 320x160'
	);
	expect(github.updateRelease).not.toHaveBeenCalled();
});
