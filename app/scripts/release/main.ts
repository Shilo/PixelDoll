import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { appVersion } from '../../version.ts';
import { composeBanner, upscaleBanner } from './banner.ts';
import { buildChanges, collectCommits } from './changes.ts';
import { claudeClient, model, translations, writeNotes } from './claude.ts';
import {
	readJson,
	readSource,
	readStaged,
	readStagedAssets,
	writeJson,
	writeStage,
	type Index,
	type Source
} from './data.ts';
import { liveBuilds } from './deployments.ts';
import { GitHub } from './github.ts';
import { commitReleaseFiles, fetchMain, git } from './git.ts';
import { publishRelease } from './publish.ts';
import { cutoffs } from './schedule.ts';

const cwd = fileURLToPath(new URL('../../../', import.meta.url));
const folder = join(cwd, 'releases');
const indexPath = join(folder, 'index.json');
const schedulePath = join(folder, 'schedule.json');

const compareVersions = (a: string, b: string) => {
	const [x, y] = [a, b].map((v) => v.split('.').map(Number));
	return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

function options() {
	const { values } = parseArgs({
		options: {
			'dry-run': { type: 'boolean' },
			notes: { type: 'boolean' },
			until: { type: 'string' },
			max: { type: 'string' }
		}
	});
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
	return { dryRun, notes: !!values.notes, until, max, key };
}

async function deployIndex(github: GitHub) {
	const head = fetchMain(cwd);
	const indexed = git(cwd, 'log', '-1', '--format=%H', head, '--', 'releases/index.json');
	const now = new Date();
	for await (const { sha } of liveBuilds(github, [now])) {
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
	const { dryRun, notes: showNotes, until, max, key } = options();
	const token = process.env.GITHUB_TOKEN;
	const github = new GitHub(process.env.GITHUB_REPOSITORY ?? 'Shilo/PixelDoll', token);
	if (!dryRun) {
		if (!token) throw new Error('Publishing requires GITHUB_TOKEN');
		if (git(cwd, 'status', '--porcelain')) throw new Error('Publishing requires a clean checkout');
		const head = fetchMain(cwd);
		git(cwd, 'merge', '--ff-only', head);
		if (git(cwd, 'rev-parse', 'HEAD') !== head) throw new Error('Publishing requires current main');
	}
	console.log(dryRun ? 'Release dry run.' : 'Release publishing enabled.');
	const index = readJson<Index>(indexPath);
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
		github,
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
	if (!dryRun && previous && !plans.length) await deployIndex(github);
	let indexInRun = 0;
	let listed = 0;
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
				if (indexInRun === 1) {
					const recent = new Set(
						index.releases.slice(0, 8).map((entry) => readSource(folder, entry.version).bannerHash)
					);
					const banner = await composeBanner(version, recent);
					console.log(
						`  Banner smoke check passed (${banner.native.length} native bytes, ${banner.large.length} at 4x, ${banner.hash})`
					);
				}
				if (showNotes && key)
					console.log(
						JSON.stringify(
							resumed?.notes ?? (await writeNotes(claudeClient(key), version, date, commits)),
							null,
							2
						)
					);
				continue;
			}
			if (!key) throw new Error('Publishing requires ANTHROPIC_API_KEY');
			let source;
			let notes;
			let banner;
			if (resumed) {
				const assets = readStagedAssets(folder, version);
				source = resumed;
				notes = assets.notes;
				banner = await upscaleBanner(assets.native);
			} else {
				const recent = new Set(
					index.releases.slice(0, 8).map((entry) => readSource(folder, entry.version).bannerHash)
				);
				const claude = claudeClient(key);
				const english = await writeNotes(claude, version, date, commits);
				notes = await translations(claude, english);
				const composed = await composeBanner(version, recent);
				source = {
					version,
					date,
					cutoff,
					sha,
					previousSha: base,
					model: commits.length ? model : null,
					commits: commits.map((commit) => commit.sha),
					notes: english,
					bannerHash: composed.hash
				} satisfies Source;
				banner = composed.large;
				writeStage(folder, source, notes, changes, composed.native);
				commitReleaseFiles(cwd, `chore(release): stage v${version}`, `releases/${version}`);
			}
			// Cutoffs publish oldest first, so each new release is the highest version so far and becomes Latest.
			await publishRelease(github, source, notes.en, changes, banner, true);
			index.releases.unshift({
				version,
				date,
				features,
				headline: Object.fromEntries(
					Object.entries(notes).map(([locale, copy]) => [locale, copy.headline])
				)
			});
			writeJson(indexPath, index);
			commitReleaseFiles(cwd, `chore(release): list v${version}`, 'releases/index.json');
			listed++;
		}
	} finally {
		// One Pages deploy carries every release this run listed, even if a later one failed.
		if (!dryRun && listed) await deployIndex(github);
	}
}

main().catch((error: unknown) => {
	console.error(`Release failed: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
});
