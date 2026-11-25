import { expect, test } from 'vitest';
import { selectLocalWork } from '../../src/lib/store/local-work.ts';
import { REQUEST_TEXT } from '../../src/lib/store/db.ts';
import { EXPORT_SETTINGS_KEY } from '../../src/lib/store/export-settings.ts';
import { RETAINED_ARCHIVE_PREFIX } from '../../src/lib/store/incompatible.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';
import { ITEM_TRIAL_TAG, MOTION_LAB_TAG } from '../../src/lib/pixellab/queue.ts';

const character = (id: string) => ({ id, manifest: { format: CURRENT_FORMAT } });
const stored = (projects: [string, unknown][], jobs: [string, unknown][] = []) => ({
	projects: new Map(projects),
	jobs: new Map(jobs)
});
const library = (jobs: [string, unknown][] = [], extra: [string, unknown][] = []) =>
	stored(
		[
			['rig-a', character('rig-a')],
			['dress-fixture:s2', { id: 'dress-fixture:s2', kind: 'dress', format: CURRENT_FORMAT }],
			['studio-drafts', { id: 'studio-drafts', gens: [] }],
			['m3-drafts', { id: 'm3-drafts', drafts: [] }],
			['studio-create:1', { id: 'studio-create:1', spec: { directions: [] }, status: 'error' }],
			['studio-move', { id: 'studio-move', status: 'error' }],
			['studio-setup', { id: 'studio-setup', status: 'error' }],
			[EXPORT_SETTINGS_KEY, { format: 'godot' }],
			[`${RETAINED_ARCHIVE_PREFIX}abc`, { id: `${RETAINED_ARCHIVE_PREFIX}abc` }],
			['rig-old', { id: 'rig-old', manifest: { format: 1 } }],
			['equipment-design-1', { id: 'equipment-design-1', kind: 'equipment-design' }],
			['studio-create', { id: 'studio-create' }],
			['someone-else', { id: 'someone-else' }],
			...extra
		],
		jobs
	);

test('deletes only known work kinds and keeps settings, archives, older records and unknown keys', () => {
	const chosen = selectLocalWork(
		library([
			['done', { id: 'done', state: 'done' }],
			['failed', { id: 'failed', state: 'failed', tag: 'studio-move' }],
			['lab', { id: 'lab', state: 'done', tag: MOTION_LAB_TAG }],
			['trial', { id: 'trial', state: 'lost', tag: ITEM_TRIAL_TAG }]
		])
	);
	expect([...chosen.projects].sort()).toEqual(
		[
			'dress-fixture:s2',
			'm3-drafts',
			'rig-a',
			'studio-create:1',
			'studio-drafts',
			'studio-move',
			'studio-setup'
		].sort()
	);
	expect([...chosen.jobs].sort()).toEqual(['done', 'failed']);
});

test.each([
	['a queued job', [['j', { id: 'j', state: 'queued' }]], []],
	['a submitting research job', [['j', { id: 'j', state: 'submitting', tag: MOTION_LAB_TAG }]], []],
	['a running job', [['j', { id: 'j', state: 'running' }]], []],
	[
		'a running creation',
		[],
		[
			[
				'studio-create:2',
				{
					id: 'studio-create:2',
					spec: { directions: [] },
					status: 'running',
					requestText: REQUEST_TEXT
				}
			]
		]
	],
	[
		'a running item draft',
		[],
		[['studio-drafts', { id: 'studio-drafts', gens: [{ phase: 'running' }] }]]
	]
] as [string, [string, unknown][], [string, unknown][]][])(
	'refuses while %s could write deleted work back',
	(_name, jobs, extra) => {
		expect(() => selectLocalWork(library(jobs, extra))).toThrow(
			expect.objectContaining({
				translation: expect.objectContaining({ key: 'librarySettings.deleteWork.generating' })
			})
		);
	}
);

test('refuses while a Studio call may have been charged without a result', () => {
	expect(() => selectLocalWork(library([['j', { id: 'j', state: 'lost' }]]))).toThrow(
		expect.objectContaining({
			translation: expect.objectContaining({ key: 'librarySettings.deleteWork.uncertain' })
		})
	);
});

test.each(['stateGenerations', 'appearanceEdits'])(
	'refuses while a completed paid %s attempt still awaits review',
	(field) => {
		expect(() =>
			selectLocalWork(
				library(
					[['state-job', { id: 'state-job', state: 'done', tag: 'studio-state' }]],
					[
						[
							'rig-a',
							{
								...character('rig-a'),
								[field]: { 'state-attempt': { token: 'state-attempt' } }
							}
						]
					]
				)
			)
		).toThrow(
			expect.objectContaining({
				translation: expect.objectContaining({ key: 'librarySettings.deleteWork.generating' })
			})
		);
	}
);
