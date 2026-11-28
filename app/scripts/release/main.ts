import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { appVersion } from '../../version.ts';
import {
	BannerError,
	bannerPath,
	bannerPrompt,
	checkBanner,
	enlargeBanner,
	generateBanner,
	readBanner
} from './banner.ts';
import { buildChanges, collectCommits } from './changes.ts';
import { claudeClient, model, translations, writeNotes } from './claude.ts';
import { compareVersions } from '../../src/lib/releases.ts';
import {
	readJson,
	readSource,
	readStaged,
	readStagedAssets,
	writeIndex,
	writeStage,
	type Index,
	type Source
} from './data.ts';
import { liveBuilds } from './deployments.ts';
import { GitHub } from './github.ts';
import { commitReleaseFiles, fetchMain, git } from './git.ts';
import { publishRelease } from './publish.ts';
import { updateRelease } from './update.ts';
import { bannerProblem, emptyNotes, publicNotes } from './notes.ts';
import { cutoffs } from './schedule.ts';

const cwd = fileURLToPath(new URL('../../../', import.meta.url));
const folder = join(cwd, 'releases');
const indexPath = join(folder, 'index.json');
const schedulePath = join(folder, 'schedule.json');

/**
 * Versions whose notes or banner changed in the pushed commits since `before` (a push of edited release files). A new
 * default banner changes every release that shows it.
 */
function editedVersions(before: string | undefined) {
	if (!before || /^0+$/.test(before)) return [];
	// Without rename detection a moved banner lists both folders, so the one that lost it switches to the default.
	const files = git(
		cwd,
		'diff',
		'--name-only',
		'--no-renames',
		before,
		'HEAD',
		'--',
		'releases'
	).split('\n');
	// Only listed releases can be updated: a deleted or still staged release folder is not an edit.
	const listed = new Set(readJson<Index>(indexPath).releases.map((entry) => entry.version));
	const versions = files.flatMap(
		(file) =>
			/^releases\/(\d+\.\d+\.\d+)\/(?:notes\.[\w-]+\.json|banner\.png)$/.exec(file)?.[1] ?? []
	);
	if (files.includes('releases/banner.png'))
		for (const version of listed)
			if (!existsSync(join(folder, version, 'banner.png'))) versions.push(version);
	return [...new Set(versions)].filter((version) => listed.has(version));
}

/** A problem that did not stop the run, shown in the log and on the run page. */
function warn(message: string) {
	console.warn(`Warning: ${message}`);
	if (process.env.GITHUB_STEP_SUMMARY)
		try {
			appendFileSync(process.env.GITHUB_STEP_SUMMARY, `> [!WARNING]\n> ${message}\n\n`);
		} catch (error) {
			console.error(`Could not add the warning to the run summary: ${String(error)}`);
		}
}

/**
 * The release's own PixelLab banner, or undefined for the default banner. A banner is never worth a failed or
 * delayed release, and nothing paid is retried.
 */
async function drawBanner(scene: string | undefined, version: string) {
	// The maintenance message has no scene and simply shows the default banner.
	if (scene === undefined) return undefined;
	const problem = bannerProblem(scene);
	if (problem) {
		warn(`v${version} uses the default banner because ${problem}.`);
		return undefined;
	}
	const key = process.env.PIXELLAB_API_KEY;
	if (!key) {
		warn(`v${version} uses the default banner: PIXELLAB_API_KEY is not set.`);
		return undefined;
	}
	const started = Date.now();
	try {
		const banner = await generateBanner(scene!, version, key);
		console.log(`  Banner drawn by PixelLab in ${Math.round((Date.now() - started) / 1000)} s`);
		return banner;
	} catch (error) {
		if (!(error instanceof BannerError)) throw error;
		warn(
			`v${version} uses the default banner because ${error.message}. To give it its own, add a 320x160 releases/${version}/banner.png and push.`
		);
		return undefined;
	}
}

function options() {
	const { values } = parseArgs({
		options: {
			'dry-run': { type: 'boolean' },
			notes: { type: 'boolean' },
			until: { type: 'string' },
			max: { type: 'string' },
			update: { type: 'string', multiple: true }
		}
	});
	// The workflow passes its inputs as RELEASE_* variables; command-line flags work the same for local runs.
	values['dry-run'] ||= process.env.RELEASE_DRY_RUN === 'true';
	values.max ??= process.env.RELEASE_MAX || undefined;
	values.update ??= process.env.RELEASE_UPDATE?.split(/\s+/).filter(Boolean);
	const key = process.env.ANTHROPIC_API_KEY;
	const dryRun = !!values['dry-run'] || process.env.RELEASES_ENABLED !== 'true';
	if (!dryRun && !key) throw new Error('Releases are enabled but ANTHROPIC_API_KEY is missing');
	if (values.notes && (!dryRun || !key))
		throw new Error('--notes requires dry-run mode and ANTHROPIC_API_KEY');
	const until = values.until === undefined ? new Date() : new Date(values.until);
	if (
		values.until !== undefined &&
		(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(values.until) ||
			!Number.isFinite(+until))
	)
		throw new Error('--until must be an ISO timestamp with a time zone');
	const max = values.max === undefined ? Infinity : Number(values.max);
	if (
		values.max !== undefined &&
		(!/^\d+$/.test(values.max) || !Number.isSafeInteger(max) || max < 1)
	)
		throw new Error('--max must be a positive integer');
	const update = values.update ?? [];
	if (update.some((version) => !/^\d+\.\d+\.\d+$/.test(version)))
		throw new Error('--update takes release versions such as 1.4.12');
	// A push of edited release files only ever updates releases, even when no listed release is affected.
	const editsSince = process.env.RELEASE_EDITS_SINCE || undefined;
	return { dryRun, notes: !!values.notes, until, max, key, update, editsSince };
}

// A test repository can read the real site's Pages history while publishing only to itself, without deploying.
const pagesEnabled = process.env.RELEASE_PAGES !== 'off';

async function deployIndex(github: GitHub, deployments: GitHub) {
	if (!pagesEnabled)
		return console.log('Pages deploys are off for this repository (RELEASE_PAGES=off).');
	const head = fetchMain(cwd);
	// The newest release files (a listing, an edit or a replaced banner) must be on the live site.
	const indexed = git(cwd, 'log', '-1', '--format=%H', head, '--', 'releases');
	const now = new Date();
	for await (const { sha } of liveBuilds(deployments, [now])) {
		if (sha) {
			const check = spawnSync('git', ['merge-base', '--is-ancestor', indexed, sha], {
				cwd,
				encoding: 'utf8'
			});
			if (check.status === 0) return;
			if (check.status !== 1)
				throw new Error(
					`Could not compare the release index with the current Pages deployment: ${check.error ?? check.stderr}`
				);
		}
	}
	if (await github.pagesDeployPending(head)) return;
	await github.dispatchPages();
	console.log('Requested a Pages deploy for the release index.');
}

async function main() {
	const { dryRun, notes: showNotes, until, max, key, update, editsSince } = options();
	const token = process.env.GITHUB_TOKEN;
	// Releases and tags use RELEASE_TOKEN when set: the workflow token may not tag an old commit whose workflow files
	// differ from today's. Git pushes keep the workflow token, so the bot's own commits never trigger workflows.
	const github = new GitHub(
		process.env.GITHUB_REPOSITORY ?? 'Shilo/PixelDoll',
		process.env.RELEASE_TOKEN || token
	);
	const deployments = new GitHub(
		process.env.RELEASE_DEPLOYMENTS_REPOSITORY || github.repository,
		token
	);
	if (!dryRun) {
		if (!token) throw new Error('Publishing requires GITHUB_TOKEN');
		if (git(cwd, 'status', '--porcelain')) throw new Error('Publishing requires a clean checkout');
		const head = fetchMain(cwd);
		git(cwd, 'merge', '--ff-only', head);
		if (git(cwd, 'rev-parse', 'HEAD') !== head) throw new Error('Publishing requires current main');
	}
	console.log(dryRun ? 'Release dry run.' : 'Release publishing enabled.');
	if (update.length || editsSince) {
		if (dryRun) throw new Error('--update needs publishing enabled');
		// Read after syncing to main, so a release listed by a run that finished meanwhile is included.
		const targets = [...new Set([...update, ...editedVersions(editsSince)])];
		if (!targets.length) console.log('No listed release uses the edited files.');
		const done: string[] = [];
		let failed = false;
		try {
			for (const version of targets) {
				const touched = await updateRelease(github, folder, version, () => {
					if (!key) throw new Error('Re-translating edited notes requires ANTHROPIC_API_KEY');
					return claudeClient(key);
				});
				// Each release is committed once it is updated, so a later failure never strands it.
				if (touched) commitReleaseFiles(cwd, `chore(release): update v${version}`, 'releases');
				done.push(version);
			}
		} catch (error) {
			failed = true;
			const left = targets.filter((version) => !done.includes(version)).join(' ');
			throw new Error(
				`${error instanceof Error ? error.message : String(error)}. After fixing it, run the workflow with update set to "${left}".`,
				{ cause: error }
			);
		} finally {
			if (done.length)
				await deployIndex(github, deployments).catch((error: unknown) => {
					if (!failed) throw error;
					console.error(`Pages deploy request also failed: ${String(error)}`);
				});
		}
		return;
	}
	const index = readJson<Index>(indexPath);
	// The default banner must be usable before anything is paid for.
	await checkBanner(readBanner(join(folder, 'banner.png')), 'releases/banner.png');
	// Recent scenes, so Claude picks a different character and setting each release.
	const recentBanners = () =>
		index.releases
			.slice(0, 6)
			.flatMap((entry) => readSource(folder, entry.version).notes.banner ?? []);
	const previous = index.releases[0] && readSource(folder, index.releases[0].version);
	const staged = readStaged(folder, index);
	const stagedDate = staged && new Date(staged.cutoff);
	const after = stagedDate ?? (previous && new Date(previous.cutoff));
	const schedule = readJson<Parameters<typeof cutoffs>[0]>(schedulePath);
	const due = [
		...(stagedDate && stagedDate <= until ? [stagedDate] : []),
		...cutoffs(schedule, after, until)
	];
	if (!due.length) console.log('No release cutoffs are due.');
	const builds = new Map<number, string | undefined>();
	for await (const { date, sha } of liveBuilds(
		deployments,
		due.filter((date) => date !== stagedDate)
	))
		builds.set(+date, sha);
	let previousSha = previous?.sha;
	let previousVersion = previous?.version;
	const skipped = new Map<number, string>();
	const plans = [];
	// `max` caps published releases, not cutoffs: skipped cutoffs (no deploy, same version) never use it up.
	let considered = due.length;
	for (const [position, date] of due.entries()) {
		if (plans.length >= max) {
			considered = position;
			break;
		}
		const cutoff = date.toISOString();
		const resumed = cutoff === staged?.cutoff ? staged : undefined;
		const sha = resumed?.sha ?? builds.get(+date);
		if (!sha) {
			skipped.set(+date, `${cutoff}  No successful Pages deployment`);
			continue;
		}
		const { version } = appVersion(cwd, sha);
		if (version === previousVersion) {
			skipped.set(+date, `${cutoff}  ${sha}  v${version}  Skipped (same version)`);
			continue;
		}
		if (
			!resumed &&
			(index.releases.some((entry) => entry.version === version) ||
				(previousVersion && compareVersions(version, previousVersion) < 0))
		) {
			skipped.set(
				+date,
				`${cutoff}  ${sha}  v${version}  Skipped (not newer than v${previousVersion})`
			);
			continue;
		}
		const base = previousSha ?? git(cwd, 'rev-list', '--max-parents=0', sha).split('\n')[0];
		if (resumed && (resumed.version !== version || resumed.previousSha !== base))
			throw new Error(`Staged release ${resumed.version} does not match its release range`);
		const commits = collectCommits(cwd, sha, previousSha);
		const changes = resumed ? readStagedAssets(folder, version).changes : buildChanges(commits);
		plans.push({
			date: cutoff.slice(0, 10),
			cutoff,
			sha,
			version,
			base,
			resumed,
			commits,
			changes
		});
		previousSha = sha;
		previousVersion = version;
	}

	// A prior run can stop after the index push and before the Pages dispatch; this run's own dispatch covers it
	// when it lists a release.
	// An index pushed by an earlier run must reach the site even if this run's release later fails.
	if (!dryRun && previous) await deployIndex(github, deployments);
	let indexInRun = 0;
	let listed = 0;
	let failure: unknown;
	try {
		for (const dueDate of due.slice(0, considered)) {
			const message = skipped.get(+dueDate);
			if (message) {
				console.log(message);
				continue;
			}
			const plan = plans[indexInRun++];
			const { date, cutoff, sha, version, base, resumed, commits, changes } = plan;
			const features = changes.groups.find((group) => group.kind === 'new')?.items.length ?? 0;
			console.log(
				`${cutoff}  ${sha}  v${version}  ${changes.total} changes, ${features} features${resumed ? ' (staged)' : ''}`
			);
			if (dryRun) {
				for (const { kind, items } of changes.groups) {
					console.log(`  ${kind}`);
					for (const item of items) console.log(`    ${item.sha.slice(0, 7)}  ${item.text}`);
				}
				if (showNotes && key) {
					const written =
						resumed?.notes ??
						(await writeNotes(claudeClient(key), version, date, commits, recentBanners()));
					console.log(JSON.stringify(written, null, 2));
					if (written.banner) console.log(`  Banner prompt: ${bannerPrompt(written.banner)}`);
				}
				continue;
			}
			if (!key) throw new Error('Publishing requires ANTHROPIC_API_KEY');
			let source;
			let notes;
			if (resumed) {
				// A staged release keeps the banner it was staged with: a rerun never pays PixelLab again.
				source = resumed;
				notes = readStagedAssets(folder, version).notes;
			} else {
				const claude = claudeClient(key);
				const english = await writeNotes(claude, version, date, commits, recentBanners());
				// The fixed maintenance message has no Claude-written content to translate.
				notes =
					english === emptyNotes
						? { en: publicNotes(english) }
						: await translations(claude, publicNotes(english));
				const banner = await drawBanner(english.banner, version);
				source = {
					version,
					date,
					cutoff,
					sha,
					previousSha: base,
					model: commits.length ? model : null,
					commits: commits.map((commit) => commit.sha),
					notes: english
				} satisfies Source;
				writeStage(folder, source, notes, changes, banner);
				commitReleaseFiles(cwd, `chore(release): stage v${version}`, `releases/${version}`);
			}
			// Cutoffs publish oldest first, so each new release is the highest version so far and becomes Latest.
			const own = existsSync(join(folder, version, 'banner.png'));
			const banner = await enlargeBanner(readBanner(bannerPath(folder, version)));
			await publishRelease(github, source, notes.en, changes, banner, true);
			index.releases.unshift({
				version,
				date,
				features,
				banner: own,
				headline: Object.fromEntries(
					Object.entries(notes).map(([locale, copy]) => [locale, copy.headline])
				)
			});
			writeIndex(folder, index);
			commitReleaseFiles(
				cwd,
				`chore(release): list v${version}`,
				'releases/index.json',
				'releases/latest.json'
			);
			listed++;
		}
	} catch (error) {
		failure = error;
		throw error;
	} finally {
		// One Pages deploy carries every release this run listed, even if a later one failed. A failed deploy request
		// is reported without hiding the publish error that came first.
		if (!dryRun && listed) {
			try {
				await deployIndex(github, deployments);
			} catch (error) {
				if (failure === undefined) throw error;
				console.error(`Pages deploy request also failed: ${String(error)}`);
			}
		}
	}
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Release failed: ${message}`);
	// The run page shows this summary: what went wrong and that a rerun resumes safely.
	if (process.env.GITHUB_STEP_SUMMARY)
		appendFileSync(
			process.env.GITHUB_STEP_SUMMARY,
			`## Release failed

${message}

Nothing is left half published: fix the cause, then run Actions > Release > Run workflow again and it resumes where it stopped.
`
		);
	process.exitCode = 1;
});
