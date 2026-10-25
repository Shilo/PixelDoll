import { execFileSync } from 'node:child_process'

// What ships: the site is built from app/ only, plus the workflow that builds it. Written exactly as the `paths` filters in
// .github/workflows/pages.yml (test/unit/version.test.ts checks). Only ever add paths: removing one lowers the version.
export const SHIPPED = ['app/**', '.github/workflows/pages.yml']

/** The commit count as major.minor.patch: patch 0-99, minor 0-9, major unbounded (1234 -> 1.2.34). */
export const formatVersion = (n: number) => `${Math.floor(n / 1000)}.${Math.floor(n / 100) % 10}.${n % 100}`

/** Version = commits that changed what ships; commit = the latest of them, so a version always names one commit. */
export function appVersion(cwd: string) {
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  // A shallow clone (actions/checkout's default) would count only the commits it has, so fail instead of shipping that.
  if (git('rev-parse', '--is-shallow-repository') !== 'false') throw new Error('version: full git history needed (actions/checkout fetch-depth: 0)')
  // --full-history: whether a commit counts depends on that commit alone, so new commits never lower the count (git's
  // default simplification follows one side of some merges and drops the other side's commits).
  const shipped = ['--full-history', 'HEAD', '--', ...SHIPPED.map((p) => `:(top,glob)${p}`)]
  return { version: formatVersion(Number(git('rev-list', '--count', ...shipped))), commit: git('log', '-1', '--abbrev=7', '--format=%h', ...shipped) }
}
