// Commit metadata only. Never opens the reusable improvement-workflow file.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const baseline = git('rev-parse', 'bb830dfb');
const reviewed = git('rev-parse', '0992bae7');
const forbidden = 'docs/handoff/paperdoll-improvement-cycle.md';
const commits = git('log', '--reverse', '--format=%H%x09%aI%x09%s', `${baseline}..${reviewed}`).split('\n').map(line => {
  const [sha, date, subject] = line.split('\t');
  const files = git('diff-tree', '--no-commit-id', '--name-only', '-r', sha).split('\n').filter(Boolean);
  if (files.includes(forbidden)) throw new Error('Forbidden workflow appeared in changed files; do not read its contents.');
  return { sha, date, subject, files };
});
const result = { baseline, reviewed, functionalProbeRevision: git('rev-parse', '8ea08c28'),
  documentationTails: ['2611cc34', 'f26751bf', '0992bae7'], commits, commitCount: commits.length, changedFileCount: new Set(commits.flatMap(c => c.files)).size };
writeFileSync(new URL('commits.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(`Inventoried ${result.commitCount} commits and ${result.changedFileCount} changed paths; metadata only.`);
