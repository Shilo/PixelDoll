import { createHash } from 'node:crypto';
import { decodePngBytes } from '../../src/lib/runtime/png.js';
import { bannerAssetName } from './banner.ts';
import type { Changes } from './changes.ts';
import type { Source } from './data.ts';
import type { Asset, GitHub, Release } from './github.ts';
import { releaseMarkdown } from './markdown.ts';
import type { Notes } from './notes.ts';

type Assets = Pick<GitHub, 'assets' | 'assetBytes' | 'deleteAsset' | 'uploadAsset'>;
type Publisher = Assets &
	Pick<GitHub, 'repository' | 'tagCommit' | 'release' | 'createDraft' | 'publish'>;

async function matches(github: Assets, asset: Asset, expected: Uint8Array) {
	if (asset.state !== 'uploaded' || !asset.browser_download_url) return false;
	const digest = 'sha256:' + createHash('sha256').update(expected).digest('hex');
	if (asset.size === expected.byteLength && asset.digest === digest) return true;
	// The same pixels can be encoded as different PNG bytes.
	const [actual, target] = await Promise.all([
		github.assetBytes(asset.id).then(decodePngBytes),
		decodePngBytes(expected)
	]);
	return (
		actual.w === target.w &&
		actual.h === target.h &&
		Buffer.from(actual.data).equals(Buffer.from(target.data))
	);
}

async function findBanner(github: Assets, release: Release) {
	let found: Asset | undefined;
	for await (const entry of github.assets(release.id)) {
		// GitHub may rename an upload; the label keeps the requested name.
		if (entry.name !== bannerAssetName && entry.label !== bannerAssetName) continue;
		if (found) throw new Error(`Release ${release.tag_name} has several banner assets`);
		found = entry;
	}
	return found;
}

/**
 * Makes the release's banner asset show exactly `banner`, replacing an unfinished upload or a different picture (an
 * edited banner, or a default banner changed while the release was staged). Returns the verified asset.
 */
export async function syncBanner(
	github: Assets,
	release: Release,
	banner: Uint8Array<ArrayBuffer>
) {
	const current = await findBanner(github, release);
	if (current && (await matches(github, current, banner))) return current;
	if (current) await github.deleteAsset(current.id);
	await github.uploadAsset(release, bannerAssetName, banner);
	const uploaded = await findBanner(github, release);
	if (!uploaded || !(await matches(github, uploaded, banner)))
		throw new Error(`Cannot verify the banner upload for ${release.tag_name}`);
	if (current) console.log(`Replaced the banner of ${release.tag_name}.`);
	return uploaded;
}

/** The public download URL, not a draft's asset URL, so the banner keeps working after publication. */
export const bannerUrl = (repository: string, tag: string, asset: Pick<Asset, 'name'>) =>
	`https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(asset.name)}`;

export async function publishRelease(
	github: Publisher,
	source: Source,
	notes: Notes,
	changes: Changes,
	banner: Uint8Array<ArrayBuffer>,
	latest: boolean
) {
	const tag = 'v' + source.version;
	// Publishing the draft creates the tag on the build's commit. Creating it directly through the refs API is refused
	// for the workflow token whenever that old commit's workflow files differ from today's.
	const checkTag = async (required: boolean) => {
		const found = await github.tagCommit(tag);
		if (found ? found !== source.sha : required)
			throw new Error(`Tag ${tag} points to ${found ?? 'nothing'}; expected ${source.sha}`);
	};
	const name = `PixelDoll ${source.version}: ${notes.headline}`;
	const render = (url: string) =>
		releaseMarkdown(
			source.version,
			source.date,
			notes,
			changes,
			github.repository,
			url,
			`https://github.com/${github.repository}/compare/${source.previousSha}...${source.sha}`
		);
	// Detect oversize notes before creating a tag or a draft.
	render(bannerUrl(github.repository, tag, { name: bannerAssetName }));
	await checkTag(false);
	const release = (await github.release(tag)) ?? (await github.createDraft(tag, source.sha, name));
	const asset = await syncBanner(github, release, banner);
	if (release.draft)
		await github.publish(
			release.id,
			name,
			render(bannerUrl(github.repository, tag, asset)),
			latest
		);
	await checkTag(true);
}
