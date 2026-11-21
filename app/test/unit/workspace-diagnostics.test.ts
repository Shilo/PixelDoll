import { expect, test, vi } from 'vitest';
import { readWorkspaceSnapshot } from '../../src/lib/store/db.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';
import {
	exportWorkspace,
	readWorkspace,
	recentWorkspaceErrors
} from '../../src/lib/store/workspace.ts';
import { unzip, zip } from '../../src/lib/store/zip.ts';

vi.mock(import('../../src/lib/store/db.ts'), async (original) => ({
	...(await original()),
	readWorkspaceSnapshot: vi.fn()
}));

const said = (error: string) =>
	recentWorkspaceErrors([{ state: 'failed', endpoint: '/inpaint-v3', finishedAt: 1, error }], [])[0]
		.message;

test('recent errors keep what the failed request said, without links or likely credentials', () => {
	const [lost, quiet] = recentWorkspaceErrors(
		[
			{
				state: 'lost',
				endpoint: '/edit-animation-v2',
				finishedAt: 2,
				error: '',
				jobs: [{ errorCode: 4001, error: 'image must be 92x92 or smaller;\n got 96x96' }]
			},
			{ state: 'failed', endpoint: '/inpaint-v3', finishedAt: 1 }
		],
		[]
	);
	// What a failure says stays readable, endpoint names included.
	expect(lost).toMatchObject({ code: 4001, message: 'image must be 92x92 or smaller; got 96x96' });
	expect(quiet.message).toBeUndefined();
	const plain =
		'no clear answer from PixelLab (POST /animate-with-skeleton-v3 -> 500: Failed to start any animation jobs)';
	expect(said(plain)).toBe(plain);
	for (const prose of [
		'Basic mode requires a mask',
		'SHA-256 digest mismatch',
		'Is the image basic enough? Try again',
		'What?now'
	])
		expect(said(prose)).toBe(prose);
	expect(said(`${'word '.repeat(60)}`)).toHaveLength(200);
	// What is likely to carry a secret or an image does not.
	const secret = 'Zm9vYmFyYmF6cXV4c2VjcmV0MTIzNDU2Nzg5MA';
	for (const [error, kept] of [
		[`GET https://cdn.example/out.png?X-Amz-Signature=${secret} failed`, 'GET [link] failed'],
		[`host cdn.example/out.png?X-Amz-Signature=deadbeef gone`, 'host [link] gone'],
		[`retry /v2/job?api_key=short`, 'retry [link]'],
		[`Authorization: Bearer abc.def`, 'Authorization: [removed]'],
		[`sent Authorization: Basic c2hvcnQ= twice`, 'sent Authorization: [removed]'],
		[`Authorization: Digest username="bob", response="deadbeef"`, 'Authorization: [removed]'],
		[`Set-Cookie: a=1; b=2`, 'Set-Cookie: [removed]'],
		[`got Bearer abc.def back`, 'got Bearer [removed] back'],
		[`header x-api-key: pl-short rejected`, 'header x-api-key: [removed] rejected'],
		[`"token":"abc123" expired`, '"token: [removed]" expired'],
		[`got data:image/png;base64,iVBORw0KGgo= back`, 'got [data] back'],
		[`body ${secret}`, 'body [removed]'],
		// A PixelLab key is a UUID: the export's own check knows only the connected and remembered ones.
		[`key 9f8e7d6c-5b4a-4321-8fed-0fedcba98765 rejected`, 'key [id] rejected'],
		[`api key: pl-short and Cookie: session`, 'api key: [removed] and Cookie: [removed]'],
		[`see callback?token%3Dshort`, 'see [link]']
	]) {
		expect(said(error)).toBe(kept);
		expect(said(error)).not.toContain(secret);
	}
});

const view = {
	project: '',
	item: '',
	move: '',
	direction: 'south',
	frame: 0,
	screen: 'characters',
	mode: 'preview',
	tab: 'wardrobe',
	theme: 'dark'
} as const;

const archive = (message: unknown, projects: [string, unknown][] = []) =>
	zip([
		{
			name: 'workspace.json',
			data: new TextEncoder().encode(
				JSON.stringify({
					format: 'pixeldoll-workspace/1',
					build: 'test',
					view,
					projects,
					missing: [],
					diagnostics: {
						tier: 1,
						errors: [{ at: 1, tool: 'inpaint-v3', outcome: 'failed', message }]
					}
				})
			)
		}
	]);

test('a workspace opens with error text, and refuses text that is not text or too long', async () => {
	const opened = await readWorkspace(await archive('PixelLab said no'));
	expect(opened.diagnostics?.errors[0].message).toBe('PixelLab said no');
	expect((await readWorkspace(await archive(undefined))).diagnostics?.errors).toHaveLength(1);
	for (const bad of [7, 'x'.repeat(201)])
		await expect(readWorkspace(await archive(bad))).rejects.toThrow('invalid recent errors');
});

test('workspace exports and imports keep saved States but not their local paid attempts', async () => {
	const id = 'rig-states';
	const record = {
		id,
		origin: 'studio',
		manifest: {
			format: CURRENT_FORMAT,
			name: 'Ranger',
			rig: { directions: [], animations: [{ id: 'ready', kind: 'state', cells: 1, frames: [0] }] },
			items: [],
			slots: [],
			materials: [],
			presets: []
		},
		stateGeneration: { token: 'attempt', continuation: { credential: 'local-key-digest' } }
	};
	const imported = await readWorkspace(await archive(undefined, [[id, record]]));
	expect(imported.projects.get(id)).toMatchObject({ manifest: record.manifest });
	expect(imported.projects.get(id)).not.toHaveProperty('stateGeneration');

	vi.mocked(readWorkspaceSnapshot).mockImplementationOnce(async (_select, references) => {
		const projects = new Map([[id, structuredClone(record)]]);
		references(projects);
		return { projects, blobs: new Map(), jobs: [] };
	});
	vi.stubGlobal('__APP_VERSION__', 'test');
	vi.stubGlobal('__APP_COMMIT__', 'test');
	try {
		const { bytes } = await exportWorkspace(view, undefined, ['local-key-digest']);
		const index = JSON.parse(new TextDecoder().decode((await unzip(bytes)).get('workspace.json')));
		expect(index.projects).toMatchObject([[id, { manifest: record.manifest }]]);
		expect(index.projects[0][1]).not.toHaveProperty('stateGeneration');
	} finally {
		vi.unstubAllGlobals();
	}
});
