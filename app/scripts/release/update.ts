import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { decodePngBytes } from '../../src/lib/runtime/png.js';
import { upscaleBanner } from './banner.ts';
import type { Changes } from './changes.ts';
import { translations, type Claude } from './claude.ts';
import { readJson, readSource, writeIndex, writeJson, type Index } from './data.ts';
import type { GitHub } from './github.ts';
import { releaseMarkdown } from './markdown.ts';
import { publicNotes, validateTranslation, type Notes } from './notes.ts';

const assetName = 'banner@4x.png';
// A banner up to this wide is pixel art at native size; GitHub gets a 4x copy. Wider images are used as they are.
const nativeLimit = 400;

type Updater = Pick<
	GitHub,
	'repository' | 'release' | 'assets' | 'deleteStarterAsset' | 'uploadAsset' | 'updateRelease'
>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Re-publishes an already published release from its folder, the single source for both the GitHub Release and the
 * app: edited English notes are checked and re-translated, an edited banner replaces the release asset, and the
 * release body is rendered again. Returns whether any file in the folder or the index changed.
 */
export async function updateRelease(
	github: Updater,
	folder: string,
	version: string,
	claude: () => Claude
): Promise<boolean> {
	const dir = join(folder, version);
	const sourcePath = join(dir, 'source.json');
	if (!existsSync(sourcePath)) throw new Error(`No published release folder for v${version}`);
	const source = readSource(folder, version);
	const english = readJson<Notes>(join(dir, 'notes.en.json'));
	const errors = validateTranslation(english, english);
	if (errors.length)
		throw new Error(`releases/${version}/notes.en.json is not valid: ${errors.join('; ')}`);
	const changes = readJson<Changes>(join(dir, 'changes.json'));
	let touched = false;

	// Edited English notes replace every translation; edits made only to a translation are kept as they are.
	if (!same(english, source.publishedEn ?? publicNotes(source.notes))) {
		const translated = await translations(claude(), english);
		for (const file of readdirSync(dir).filter((name) => /^notes\.[\w-]+\.json$/.test(name))) {
			const locale = file.slice('notes.'.length, -'.json'.length);
			// A locale that could not be translated again falls back to English rather than showing stale text.
			if (locale !== 'en' && !translated[locale]) rmSync(join(dir, file));
		}
		for (const [locale, notes] of Object.entries(translated))
			if (locale !== 'en') writeJson(join(dir, `notes.${locale}.json`), notes);
		writeJson(sourcePath, { ...source, publishedEn: english });
		touched = true;
	}

	const index = readJson<Index>(join(folder, 'index.json'));
	const entry = index.releases.find((release) => release.version === version);
	if (!entry) throw new Error(`v${version} is not listed in releases/index.json`);
	const headline = Object.fromEntries(
		readdirSync(dir)
			.filter((name) => /^notes\.[\w-]+\.json$/.test(name))
			.map((name) => [
				name.slice('notes.'.length, -'.json'.length),
				readJson<Notes>(join(dir, name)).headline
			])
	);
	const sorted = (map: Record<string, string>) =>
		Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
	if (!same(sorted(entry.headline), sorted(headline))) {
		entry.headline = headline;
		writeIndex(folder, index);
		touched = true;
	}

	const tag = 'v' + version;
	const release = await github.release(tag);
	if (!release || release.draft) throw new Error(`Release ${tag} is not published yet`);
	const native = readFileSync(join(dir, 'banner.png'));
	const { w } = await decodePngBytes(native);
	const banner = w <= nativeLimit ? await upscaleBanner(native) : native;
	const digest = 'sha256:' + createHash('sha256').update(banner).digest('hex');
	let asset;
	for await (const item of github.assets(release.id)) if (item.name === assetName) asset = item;
	if (asset?.digest !== digest) {
		if (asset) await github.deleteStarterAsset(asset.id);
		await github.uploadAsset(release, assetName, new Uint8Array(banner));
		console.log(`Replaced the banner of ${tag}.`);
	}
	await github.updateRelease(
		release.id,
		`PixelDoll ${version}: ${english.headline}`,
		releaseMarkdown(
			version,
			source.date,
			english,
			changes,
			github.repository,
			`https://github.com/${github.repository}/releases/download/${tag}/${encodeURIComponent(assetName)}`,
			`https://github.com/${github.repository}/compare/${source.previousSha}...${source.sha}`
		)
	);
	console.log(`Updated ${tag} on GitHub.`);
	return touched;
}
