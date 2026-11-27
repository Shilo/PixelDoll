import { shippedPathspec } from '../../version.ts';
import { git } from './git.ts';

type Kind = 'new' | 'improved' | 'fixed';
type CommitType = 'feat' | 'perf' | 'fix';
type GitCommit = { sha: string; subject: string; body: string };
export type ReleaseCommit = GitCommit & { id: string; type: CommitType; scope: string };
export type Changes = {
	total: number;
	groups: { kind: Kind; items: { sha: string; text: string }[] }[];
};

const skipped = /^(test|e2e|dev|ci|agent)$/i;
const conventional = /^(feat|perf|fix)(?:\(([^)]+)\))?!?:\s+(.+)$/;
const revertSubject = /^(?:revert(?:\([^)]+\))?!?:|revert ")/i;

/** `mergeContent` lists the commits a merge brought in, so reverting a merged branch nets its commits too. */
export function userCommits(
	commits: GitCommit[],
	mergeContent: (prefix: string) => string[] = () => []
): ReleaseCommit[] {
	const reverted = new Set<string>();
	const result: ReleaseCommit[] = [];
	for (const { sha, subject, body } of commits) {
		if (reverted.has(sha)) continue;
		if (revertSubject.test(subject)) {
			// Git names one target. A combined revert can also list several target SHAs explicitly.
			const standard = [...body.matchAll(/^This reverts (?:commit )?([a-f\d]{7,64})\b/gim)].map(
				(match) => match[1]
			);
			const combined =
				/^(?:Reverts |Revert [^\n:]+:\s*)([a-f\d]{7,64}(?:(?:,?\s+|\s+and\s+)[a-f\d]{7,64})*)/i.exec(
					body
				)?.[1];
			const prefixes = [...standard, ...(combined?.match(/\b[a-f\d]{7,64}\b/gi) ?? [])];
			for (const prefix of prefixes) {
				const matches = commits.filter((commit) => commit.sha.startsWith(prefix.toLowerCase()));
				if (matches.length === 1) reverted.add(matches[0].sha);
				else if (!matches.length) for (const merged of mergeContent(prefix)) reverted.add(merged);
			}
			continue;
		}
		const match = conventional.exec(subject);
		if (!match || skipped.test(match[2] ?? '')) continue;
		const [, type, scope = '', title] = match;
		let length = 7;
		while (commits.some((other) => other.sha !== sha && other.sha.startsWith(sha.slice(0, length))))
			length++;
		result.push({
			sha,
			id: sha.slice(0, length),
			type: type as CommitType,
			scope,
			subject: title,
			body
		});
	}
	return result;
}

export function collectCommits(cwd: string, sha: string, previousSha?: string) {
	const log = git(
		cwd,
		'log',
		'--full-history',
		'--no-merges',
		'--topo-order',
		'-z',
		'--format=%H%x00%s%x00%b',
		previousSha ? `${previousSha}..${sha}` : sha,
		'--',
		...shippedPathspec
	);
	const fields = log.split('\0');
	const commits: GitCommit[] = [];
	for (let i = 0; i + 2 < fields.length; i += 3)
		commits.push({ sha: fields[i], subject: fields[i + 1], body: fields[i + 2].trim() });
	return userCommits(commits, (prefix) => {
		let target: string;
		try {
			target = git(cwd, 'rev-parse', '--verify', '--quiet', `${prefix}^{commit}`);
		} catch {
			return []; // Not in this repository: nothing to net.
		}
		const parents = git(cwd, 'rev-list', '--parents', '-n', '1', target).split(' ').length - 1;
		if (parents < 2) return [];
		return git(cwd, 'rev-list', '--no-merges', `${target}^1..${target}`)
			.split('\n')
			.filter(Boolean);
	});
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function buildChanges(commits: ReleaseCommit[]): Changes {
	const kinds = { feat: 'new', perf: 'improved', fix: 'fixed' } as const;
	const groups = Object.entries(kinds).flatMap(([type, kind]) => {
		const items = commits
			.filter((commit) => commit.type === type)
			.map(({ sha, scope, subject }) => ({
				sha,
				text: (scope ? `${capitalize(scope)}: ` : '') + capitalize(subject)
			}));
		return items.length ? [{ kind, items }] : [];
	});
	return { total: commits.length, groups };
}
