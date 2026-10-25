import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SHIPPED, appVersion, formatVersion } from '../../version.ts'

describe('app version', () => {
  it('reads the commit count as major.minor.patch with patch 0-99 and minor 0-9', () => {
    expect([1, 99, 100, 149, 999, 1000, 1234, 2000, 12345].map(formatVersion))
      .toEqual(['0.0.1', '0.0.99', '0.1.0', '0.1.49', '0.9.99', '1.0.0', '1.2.34', '2.0.0', '12.3.45'])
  })

  it('counts only commits that change what ships, and a merge never hides counted commits', () => {
    const repo = mkdtempSync(join(tmpdir(), 'pixeldoll-version-'))
    try {
      const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=no-hooks', ...a], { cwd: repo, encoding: 'utf8' }).trim()
      const commit = (file: string, text: string) => {
        mkdirSync(dirname(join(repo, file)), { recursive: true }); writeFileSync(join(repo, file), text); git('add', '-A'); git('commit', '-qm', file)
      }
      git('init', '-q', '-b', 'main')
      commit('docs/b.md', 'x')
      expect(() => appVersion(repo)).toThrow(/no commits touch/)
      commit('app/a.txt', '1'); commit('docs/a.md', 'x'); commit('app/a.txt', '2'); commit('app/a.txt', '3')
      expect(appVersion(repo).version).toBe('0.0.3') // the docs commit is left out
      // The side branch ends with main's app/ content, so git's default history simplification would follow only that side.
      git('checkout', '-qb', 'side', 'HEAD~3'); commit('app/a.txt', '3'); commit('app/b.txt', 'b')
      git('checkout', '-q', 'main'); git('merge', '-q', '--no-ff', '-m', 'merge', 'side')
      expect(appVersion(join(repo, 'app'))).toEqual({ version: '0.0.5', commit: git('rev-parse', '--short=7', 'HEAD') }) // the merge itself never counts
    } finally { rmSync(repo, { recursive: true, force: true }) }
  })

  it('counts the same paths that run CI and deploy', () => {
    const workflow = readFileSync(new URL('../../../.github/workflows/pages.yml', import.meta.url), 'utf8')
    expect([...workflow.matchAll(/^\s+paths: \[(.*)\]$/gm)].map((m) => m[1])).toEqual(Array(2).fill(SHIPPED.join(', '))) // push and pull_request
  })
})
