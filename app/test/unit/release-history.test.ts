import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildChanges, collectCommits, userCommits } from '../../scripts/release/changes.ts';
import { liveBuilds } from '../../scripts/release/deployments.ts';
import { deployRunTitle, GitHub } from '../../scripts/release/github.ts';
import { cutoffs } from '../../scripts/release/schedule.ts';
import { appVersion } from '../../version.ts';

const anchor = '2026-10-23';
const schedule = { every: 'week', day: 'friday', hourUtc: 15, anchor } as const;
const at = (time: string) => new Date(time);
const calendar = (...args: Parameters<typeof cutoffs>) =>
	cutoffs(...args).map((d) => d.toISOString());

describe('release cutoffs', () => {
	it('uses UTC, includes the cutoff instant and excludes the previous release cutoff', () => {
		expect(calendar(schedule, undefined, at('2026-10-23T14:59:59Z'))).toEqual([]);
		expect(calendar(schedule, at('2026-10-23T15:00:00Z'), at('2026-11-06T07:00:00-08:00'))).toEqual(
			['2026-10-30T15:00:00.000Z', '2026-11-06T15:00:00.000Z']
		);
		expect(
			calendar({ ...schedule, every: '2 weeks' }, undefined, at('2026-11-19T23:00:00Z'))
		).toEqual(['2026-10-23T15:00:00.000Z', '2026-11-06T15:00:00.000Z']);
	});

	it('uses the first selected weekday of each month on or after the anchor', () => {
		expect(
			calendar(
				{ ...schedule, every: 'month' },
				at('2026-10-30T15:00:00Z'),
				at('2027-01-01T15:00:00Z')
			)
		).toEqual(['2026-11-06T15:00:00.000Z', '2026-12-04T15:00:00.000Z', '2027-01-01T15:00:00.000Z']);
		expect(() => cutoffs({ ...schedule, anchor: '2026-02-30' }, undefined, new Date())).toThrow(
			/schedule/
		);
	});
});

it('selects the actual last success at each cutoff and paginates deployments and statuses', async () => {
	const github = new GitHub('Shilo/PixelDoll');
	const deploy = (id: number, sha: string, day: number) => ({
		id,
		sha,
		created_at: `2026-11-${day}T13:00:00Z`
	});
	const status = (
		state: string,
		day: number,
		hour: number,
		environment_url = 'https://pixeldoll.app/'
	) => ({ state, environment_url, created_at: `2026-11-${day}T${hour}:00:00Z` });
	const routes: Record<string, [unknown[], string?]> = {
		'/deployments?environment=github-pages&per_page=100': [
			[deploy(4, 'skipped', 27), deploy(3, 'late', 27)],
			'/deployments?page=2'
		],
		'/deployments?page=2': [[deploy(2, 'live', 26), deploy(1, 'old', 20)]],
		'/deployments/4/statuses?per_page=100': [[status('success', 27, 15, '')]],
		'/deployments/3/statuses?per_page=100': [[status('success', 27, 16)]],
		'/deployments/2/statuses?per_page=100': [
			[status('inactive', 27, 17)],
			'/deployments/2/statuses?page=2'
		],
		'/deployments/2/statuses?page=2': [[status('success', 27, 15)]],
		'/deployments/1/statuses?per_page=100': [[status('success', 20, 14)]]
	};
	const request = vi.fn((input: URL) => {
		const [data, next] =
			routes[input.pathname.replace('/repos/Shilo/PixelDoll', '') + input.search];
		const headers = next
			? { link: `<https://api.github.com/repos/Shilo/PixelDoll${next}>; rel="next"` }
			: undefined;
		return Promise.resolve(Response.json(data, { headers }));
	});
	vi.stubGlobal('fetch', request);
	const results = [];
	for await (const { sha } of liveBuilds(github, [
		at('2026-11-20T15:00:00Z'),
		at('2026-11-27T15:00:00Z')
	]))
		results.push(sha);
	expect(results).toEqual(['live', 'old']);
	expect(request).toHaveBeenCalledTimes(7);
});

afterEach(() => vi.unstubAllGlobals());

it('uses the canonical shipped history and nets standard reverts and reverts of reverts', () => {
	const repo = mkdtempSync(join(tmpdir(), 'pixeldoll-release-'));
	try {
		const git = (...args: string[]) =>
			execFileSync(
				'git',
				[
					'-c',
					'user.name=Test',
					'-c',
					'user.email=t@example.test',
					'-c',
					'commit.gpgsign=false',
					'-c',
					'core.hooksPath=no-hooks',
					...args
				],
				{ cwd: repo, encoding: 'utf8' }
			).trim();
		git('init', '-q', '-b', 'main');
		mkdirSync(join(repo, 'app'));
		const commit = (path: string, subject: string, body = '') => {
			writeFileSync(join(repo, path), subject);
			git('add', '--', path);
			git('commit', '-qm', subject, '-m', body);
			return git('rev-parse', 'HEAD');
		};
		const initial = commit('app/root', 'feat: start dressing');
		commit('readme', 'feat: change docs');
		const feature = commit('app/item', 'feat(export)!: add GIFs');
		const reverted = commit('app/reverted', 'fix: preflight');
		commit('app/revert', 'revert: withdraw preflight', `This reverts commit ${reverted}.`);
		const undoFeature = commit(
			'app/undo-feature',
			'Revert "feat(export)!: add GIFs"',
			`This reverts commit ${feature}.`
		);
		commit('app/restore', 'revert: restore GIFs', `This reverts commit ${undoFeature}.`);
		commit('app/test', 'fix(test): keep the test stable');
		const perf = commit('app/perf', 'perf: load faster', 'The preview loads faster.');
		expect(appVersion(repo, initial)).toEqual({ version: '0.0.1', commit: initial.slice(0, 7) });
		expect(appVersion(repo).version).toBe('0.0.8');
		expect(collectCommits(repo, perf).map(({ sha }) => sha)).toEqual([perf, feature, initial]);
		const commits = collectCommits(repo, perf, initial);
		expect(commits[0].body).toBe('The preview loads faster.');
		expect(buildChanges(commits)).toEqual({
			total: 2,
			groups: [
				{ kind: 'new', items: [{ sha: feature, text: 'Export: Add GIFs' }] },
				{ kind: 'improved', items: [{ sha: perf, text: 'Load faster' }] }
			]
		});
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

it('nets an explicit combined revert with abbreviated target IDs', () => {
	const commit = (sha: string, subject: string, body = '') => ({
		sha: sha.padEnd(40, '0'),
		subject,
		body
	});
	expect(
		userCommits([
			commit('ccccccc', 'revert: remove a trial', 'Reverts aaaaaaa and bbbbbbb in one commit.'),
			commit('bbbbbbb', 'fix: second trial change'),
			commit('aaaaaaa', 'feat: first trial change')
		])
	).toEqual([]);
});

it('nets a revert that names its target without the word commit', () => {
	const commit = (sha: string, subject: string, body = '') => ({
		sha: sha.padEnd(40, '0'),
		subject,
		body
	});
	expect(
		userCommits([
			commit('8e4abb0', 'revert: restore the global move hold', 'This reverts c7db029.'),
			commit('c7db029', 'feat(studio): hold moves per character')
		])
	).toEqual([]);
});

it('nets the commits of a reverted merge', () => {
	const commit = (sha: string, subject: string, body = '') => ({
		sha: sha.padEnd(40, '0'),
		subject,
		body
	});
	const branch = ['aaaaaaa'.padEnd(40, '0'), 'bbbbbbb'.padEnd(40, '0')];
	expect(
		userCommits(
			[
				commit('ddddddd', 'Revert "Merge branch t3/trial"', 'This reverts commit ccccccc.'),
				commit('bbbbbbb', 'fix: trial fix'),
				commit('aaaaaaa', 'feat: trial feature'),
				commit('eeeeeee', 'feat: kept feature')
			],
			(prefix) => (prefix === 'ccccccc' ? branch : [])
		).map(({ subject }) => subject)
	).toEqual(['kept feature']);
});

it('schedules the release workflow on the release day and the day after, just after the release hour', () => {
	const root = new URL('../../../', import.meta.url);
	const schedule = JSON.parse(readFileSync(new URL('releases/schedule.json', root), 'utf8'));
	const workflow = readFileSync(new URL('.github/workflows/release.yml', root), 'utf8');
	const [minute, hour, , , days] = /cron: "([^"]+)"/.exec(workflow)![1].split(' ');
	const day = [
		'sunday',
		'monday',
		'tuesday',
		'wednesday',
		'thursday',
		'friday',
		'saturday'
	].indexOf(schedule.day);
	expect(Number(minute)).toBeLessThan(60);
	expect(Number(hour)).toBe(schedule.hourUtc);
	expect(days).toBe(`${day},${(day + 1) % 7}`);
});

it('leaves the withdrawn whole-direction alignment out of the October 30 release', () => {
	const root = fileURLToPath(new URL('../../../', import.meta.url));
	const ids = collectCommits(
		root,
		'd4c5785f00b288505275a90a7a0f6d91047f30a8',
		'45c7a225ba6821740aff487b3ca8c0092799f5f2'
	).map(({ sha }) => sha.slice(0, 9));
	expect(ids).not.toContain('53b02f185');
	expect(ids).not.toContain('390b98e52');
});

it('nets a revert listed in the manual revert map', () => {
	const commit = (sha: string, subject: string) => ({
		sha: sha.padEnd(40, '0'),
		subject,
		body: ''
	});
	expect(
		userCommits(
			[commit('bbbbbbb', 'revert(studio): withdraw a trial'), commit('aaaaaaa', 'feat: trial')],
			() => [],
			{ bbbbbbb: ['aaaaaaa'.padEnd(40, '0')] }
		)
	).toEqual([]);
});

it('treats only an unfinished deploy request or push as the pending release deploy', async () => {
	const runs = (event: string, status: string, display_title = 'CI and Pages') =>
		vi.fn(async () => Response.json({ workflow_runs: [{ event, status, display_title }] }));
	const github = new GitHub('Shilo/PixelDoll', 'token');
	vi.stubGlobal('fetch', runs('workflow_dispatch', 'queued', deployRunTitle));
	await expect(github.pagesDeployPending('abc')).resolves.toBe(true);
	vi.stubGlobal('fetch', runs('workflow_dispatch', 'queued'));
	await expect(github.pagesDeployPending('abc')).resolves.toBe(false);
	vi.stubGlobal('fetch', runs('workflow_dispatch', 'completed', deployRunTitle));
	await expect(github.pagesDeployPending('abc')).resolves.toBe(false);
	vi.stubGlobal('fetch', runs('push', 'in_progress', 'feat: something'));
	await expect(github.pagesDeployPending('abc')).resolves.toBe(true);
	vi.unstubAllGlobals();
});

it('lists a change that landed twice only once', () => {
	const commit = (sha: string, subject: string) => ({
		sha: sha.padEnd(40, '0'),
		subject,
		body: ''
	});
	expect(
		userCommits([
			commit('dc762aa', 'feat(studio): add compact category counts'),
			commit('dcf80ad', 'feat(studio): add compact category counts')
		]).map(({ sha }) => sha.slice(0, 7))
	).toEqual(['dc762aa']);
});
