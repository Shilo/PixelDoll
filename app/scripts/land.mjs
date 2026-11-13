// `npm run land`: publish HEAD to main only after CI has passed on that exact commit.
// A commit that fails CI on main blocks the Pages deploy for everyone until someone fixes it, and a workstation run cannot
// rule that out: it covers what the change touched, on Windows, while CI runs the whole suite on Linux. So the commit goes
// to a temporary branch first, its CI run is awaited, and main is fast-forwarded to it only when that run is green.
// A commit that changes nothing that ships (SHIPPED in version.ts) starts no CI run and goes straight to main.
// `--check <commit> <main's commit>` is the question .githooks/pre-push asks of every push to main.
import { spawnSync } from 'node:child_process';
import { SHIPPED } from '../version.ts';

const WORKFLOW = 'pages.yml';
const fail = (message) => {
	console.error(message);
	process.exit(1);
};
/** Runs in the caller's checkout (the hook runs this file from the main checkout for every worktree). */
const run = (cmd, args, stdio = 'pipe') => spawnSync(cmd, args, { encoding: 'utf8', stdio });
const out = (cmd, ...args) => {
	const result = run(cmd, args);
	if (result.status !== 0)
		fail(
			`${cmd} ${args.join(' ')} failed: ${(result.stderr || result.error?.message || '').trim()}`
		);
	return result.stdout.trim();
};
const git = (...args) => out('git', ...args);

/** Whether going from one commit to the other changes anything that ships. A commit git cannot read counts as a change. */
const ships = (from, to) =>
	run('git', ['diff', '--quiet', from, to, '--', ...SHIPPED.map((path) => `:(top,glob)${path}`)])
		.status !== 0;
/** The CI runs of a commit, newest first. */
const runs = (sha) =>
	JSON.parse(
		out(
			'gh',
			'run',
			'list',
			'--commit',
			sha,
			'--workflow',
			WORKFLOW,
			'--json',
			'databaseId,status,conclusion,url'
		)
	);
const proven = (sha) => runs(sha).some((ci) => ci.conclusion === 'success');

if (process.argv[2] === '--check') {
	const [sha, old] = process.argv.slice(3);
	if (/^0+$/.test(sha) || !ships(old, sha) || proven(sha)) process.exit(0);
	fail(
		`Refused: CI has not passed on ${sha.slice(0, 8)}, and a commit that fails there blocks the Pages deploy for everyone.\n` +
			'Publish with npm run land (from app/): it proves the commit in CI on a temporary branch, then updates main.'
	);
}

git('fetch', '--quiet', 'origin', 'main');
const sha = git('rev-parse', 'HEAD'),
	main = git('rev-parse', 'origin/main');
if (sha === main) fail('Nothing to land: HEAD is already origin/main.');
if (run('git', ['merge-base', '--is-ancestor', main, sha]).status !== 0)
	fail(
		'origin/main has commits HEAD lacks: merge origin/main, rerun the tests that cover your change, then land again.'
	);

if (ships(main, sha) && !proven(sha)) {
	const before = runs(sha);
	let ci = before.find((known) => known.status !== 'completed'); // a branch you pushed yourself may already be running
	const branch = ci ? '' : `land/${sha.slice(0, 10)}`;
	if (branch) git('push', '--quiet', 'origin', `${sha}:refs/heads/${branch}`);
	for (let tries = 0; !ci && tries < 24; tries++) {
		await new Promise((resolve) => setTimeout(resolve, 5000));
		ci = runs(sha).find((found) => !before.some((known) => known.databaseId === found.databaseId));
	}
	let problem = ci ? '' : `No CI run started for ${branch} within two minutes; main is unchanged.`;
	if (ci) {
		console.log(`Waiting for CI on ${sha.slice(0, 8)} (about 3 minutes): ${ci.url}`);
		run('gh', ['run', 'watch', String(ci.databaseId), '--interval', '15'], 'ignore');
		const { conclusion, jobs } = JSON.parse(
			out('gh', 'run', 'view', String(ci.databaseId), '--json', 'conclusion,jobs')
		);
		if (conclusion !== 'success')
			problem =
				`CI ${conclusion || 'did not finish'} on ${sha.slice(0, 8)}; main is unchanged. Failed: ` +
				jobs
					.filter((job) => job.conclusion === 'failure')
					.map((job) => job.name)
					.join(', ') +
				`\nRead it with: gh run view ${ci.databaseId} --log-failed\nFix it, commit and land again.`;
	}
	// The run and its logs outlive the branch. Removed before failing: process.exit skips a finally block.
	if (branch) run('git', ['push', '--quiet', 'origin', '--delete', branch]);
	if (problem) fail(problem);
}

// The pre-push hook asks --check here; main can also have moved while CI ran.
if (run('git', ['push', 'origin', `${sha}:refs/heads/main`], 'inherit').status !== 0)
	fail(
		'main was not updated. If it moved meanwhile, merge origin/main and land again; the merged commit needs its own CI run.'
	);
console.log(
	`Landed ${sha.slice(0, 8)} on main.` +
		(ships(main, sha)
			? ' Its run deploys in about 3 minutes: gh run list --branch main --limit 1'
			: '')
);
