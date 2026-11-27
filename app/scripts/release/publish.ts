import { createHash } from 'node:crypto';
import { decodePngBytes } from '../../src/lib/runtime/png.js';
import type { Changes } from './changes.ts';
import type { Source } from './data.ts';
import type { Asset, GitHub } from './github.ts';
import { releaseMarkdown } from './markdown.ts';
import type { Notes } from './notes.ts';

const assetName = 'banner@4x.png';
type Publisher = Pick<
	GitHub,
	| 'repository'
	| 'tagCommit'
	| 'createTag'
	| 'release'
	| 'createDraft'
	| 'assets'
	| 'deleteStarterAsset'
	| 'uploadAsset'
	| 'assetBytes'
	| 'publish'
>;

async function verifyAsset(github: Publisher, asset: Asset, expected: Uint8Array) {
	if (asset.state !== 'uploaded' || !asset.browser_download_url)
		throw new Error(`Release asset ${asset.name} has not finished uploading`);
	const digest = 'sha256:' + createHash('sha256').update(expected).digest('hex');
	if (asset.size === expected.byteLength && asset.digest === digest) return;
	// Chromium versions can encode the same pixels with different PNG bytes.
	const [actual, target] = await Promise.all([
		github.assetBytes(asset.id).then(decodePngBytes),
		decodePngBytes(expected)
	]);
	if (
		actual.w !== target.w ||
		actual.h !== target.h ||
		!Buffer.from(actual.data).equals(Buffer.from(target.data))
	)
		throw new Error(`Release asset ${asset.name} does not match the staged banner`);
}

export async function publishRelease(
	github: Publisher,
	source: Source,
	notes: Notes,
	changes: Changes,
	banner: Uint8Array<ArrayBuffer>,
	latest: boolean
) {
	const tag = 'v' + source.version;
	const ensureTag = async (allowCreate: boolean) => {
		let found = await github.tagCommit(tag);
		if (!found && allowCreate) {
			await github.createTag(tag, source.sha);
			found = await github.tagCommit(tag);
		}
		if (found !== source.sha)
			throw new Error(`Tag ${tag} points to ${found ?? 'nothing'}; expected ${source.sha}`);
	};
	const name = `PixelDoll ${source.version}: ${notes.headline}`;
	const render = (url: string) =>
		releaseMarkdown(source.version, source.date, notes, changes, github.repository, url);
	// Detect oversize notes before creating a tag or a draft.
	render(`https://github.com/${github.repository}/releases/download/${tag}/${assetName}`);
	await ensureTag(true);
	const release = (await github.release(tag)) ?? (await github.createDraft(tag, source.sha, name));
	let asset: Asset | undefined;
	for await (const entry of github.assets(release.id)) {
		if (entry.name !== assetName && entry.label !== assetName) continue;
		if (asset) throw new Error(`Release ${tag} has several banner assets`);
		asset = entry;
	}
	if (release.draft && asset?.state === 'starter') {
		await github.deleteStarterAsset(asset.id);
		asset = undefined;
	}
	if (!asset) {
		if (!release.draft) throw new Error(`Published release ${tag} is missing its banner`);
		await github.uploadAsset(release, assetName, banner);
		for await (const entry of github.assets(release.id))
			if (entry.name === assetName || entry.label === assetName) asset = entry;
		if (!asset) throw new Error(`Cannot verify banner upload for ${tag}`);
	}
	await verifyAsset(github, asset, banner);
	if (release.draft)
		await github.publish(release.id, name, render(asset.browser_download_url), latest);
	await ensureTag(false);
}
