import { execFileSync } from 'node:child_process';

// What ships: the site is built from app/ only, plus the workflow that builds it. Written exactly as the `paths` filters in
// .github/workflows/pages.yml (test/unit/version.test.ts checks). Only ever add paths: removing one lowers the version.
export const SHIPPED = ['app/**', '.github/workflows/pages.yml'];
export const shippedPathspec = SHIPPED.map((path) => `:(top,glob)${path}`);

/** The commit count as major.minor.patch: patch 0-99, minor 0-9, major unbounded (1234 -> 1.2.34). */
export const formatVersion = (n: number) =>
	`${Math.floor(n / 1000)}.${Math.floor(n / 100) % 10}.${n % 100}`;

/** Count commits that changed what ships up to the exact source of the build. */
export function appVersion(cwd: string, rev = 'HEAD') {
	const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
	// A shallow clone (actions/checkout's default) would count only the commits it has, so fail instead of shipping that.
	if (git('rev-parse', '--is-shallow-repository') !== 'false')
		throw new Error('version: full git history needed (actions/checkout fetch-depth: 0)');
	// Whether a commit counts depends on that commit alone, so new commits never lower the count: --full-history walks
	// both sides of every merge (git's default follows one side of some merges), and --no-merges skips merges, which
	// only combine counted commits (a merged docs-only branch would otherwise count without deploying).
	const commit = git('rev-parse', '--verify', '--end-of-options', rev + '^{commit}');
	const count = Number(
		git('rev-list', '--count', '--full-history', '--no-merges', commit, '--', ...shippedPathspec)
	);
	if (!count) throw new Error(`version: no commits touch ${SHIPPED.join(' or ')}; did app/ move?`);
	return { version: formatVersion(count), commit: git('rev-parse', '--short=7', commit) };
}
