import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { bannerPath, checkBanner, enlargeBanner, readBanner } from './banner.ts';
import type { Changes } from './changes.ts';
import { translations, type Claude } from './claude.ts';
import { readJson, readSource, writeIndex, writeJson, type Index } from './data.ts';
import type { GitHub } from './github.ts';
import { releaseMarkdown } from './markdown.ts';
import { bannerUrl, syncBanner } from './publish.ts';
import { publicNotes, validateTranslation, type Notes } from './notes.ts';

type Updater = Pick<
	GitHub,
	| 'repository'
	| 'release'
	| 'assets'
	| 'assetBytes'
	| 'deleteAsset'
	| 'uploadAsset'
	| 'updateRelease'
>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Re-publishes an already published release from its folder, the single source for both the GitHub Release and the
 * app: edited English notes are checked and re-translated, an edited banner (its own, or the default one it shows)
 * replaces the release asset, and the release body is rendered again. Returns whether any file in the folder or the index changed.
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
	const path = bannerPath(folder, version);
	const native = readBanner(path);
	// Checked before anything is translated or uploaded, so a wrong picture fails the run with a clear reason.
	await checkBanner(
		native,
		path === join(folder, 'banner.png') ? 'releases/banner.png' : `releases/${version}/banner.png`
	);
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
	const own = existsSync(join(dir, 'banner.png'));
	if (!same(sorted(entry.headline), sorted(headline)) || entry.banner !== own) {
		entry.headline = headline;
		entry.banner = own;
		writeIndex(folder, index);
		touched = true;
	}

	const tag = 'v' + version;
	const release = await github.release(tag);
	if (!release || release.draft) throw new Error(`Release ${tag} is not published yet`);
	const asset = await syncBanner(github, release, await enlargeBanner(native));
	await github.updateRelease(
		release.id,
		`PixelDoll ${version}: ${english.headline}`,
		releaseMarkdown(
			version,
			source.date,
			english,
			changes,
			github.repository,
			bannerUrl(github.repository, tag, asset),
			`https://github.com/${github.repository}/compare/${source.previousSha}...${source.sha}`
		)
	);
	console.log(`Updated ${tag} on GitHub.`);
	return touched;
}
