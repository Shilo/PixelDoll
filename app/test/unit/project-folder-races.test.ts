import { beforeEach, expect, it, vi } from 'vitest';
import type { FolderLink } from '../../src/lib/project-folder/links.ts';
import { publishFiles, sha256 } from '../../src/lib/project-folder/publish.ts';
import {
	directoryTarget,
	pathParts,
	UnsafePathError
} from '../../src/lib/project-folder/target.ts';
import { domError, files, memoryFolder } from './project-folder-memory.ts';

const studio = vi.hoisted(() => ({
	doc: { id: 'hero', items: {}, variants: {} },
	store: {
		project: { images: new Map(), manifest: { rig: { animations: [] } } },
		projects: [{ id: 'hero' }],
		exportRecord: undefined
	},
	saved: {} as Record<string, object>,
	getLink: vi.fn<() => Promise<FolderLink | null>>(),
	buildExport: vi.fn()
}));

vi.mock('../../src/studio/state.svelte.ts', () => ({
	...studio,
	toast: vi.fn(),
	ui: {},
	dismissToast: vi.fn(),
	prepareWorkspaceExport: async () => {}
}));
vi.mock('../../src/studio/settingsNavigation.svelte.ts', () => ({ openSettings: vi.fn() }));
vi.mock('../../src/studio/download.svelte.ts', () => ({
	editableData: vi.fn(),
	exportSource: async (id: string) => ({
		project: studio.store.project,
		look: {
			items: structuredClone(id === studio.doc.id ? studio.doc.items : studio.saved[id]),
			variants: {}
		}
	})
}));
vi.mock('../../src/studio/exportLayering.ts', () => ({ exportActionLayering: vi.fn() }));
vi.mock('../../src/lib/export/build.ts', () => ({ buildExport: studio.buildExport }));
vi.mock('../../src/lib/export/export.ts', () => ({ ACTION_LAYER_ENGINES: [] }));

// Build stamps Vite defines for the app; the fingerprint of a publish includes them.
beforeEach(() => {
	vi.stubGlobal('__APP_VERSION__', 'test');
	vi.stubGlobal('__APP_COMMIT__', 'test');
});
vi.mock('../../src/lib/store/export-settings.ts', () => ({ readExportSettings: async () => ({}) }));
vi.mock('../../src/lib/project-folder/support.ts', () => ({
	folderSupport: async () => 'supported'
}));
vi.mock('../../src/lib/project-folder/links.ts', () => ({
	getLink: studio.getLink,
	updateLink: async () => null,
	readRecord: async () => ({ written: {}, kept: [] }),
	recordKey: () => 'hero',
	recordWritten: async () => {}
}));

// A kept file is read before the planner can skip it.
it('publishes the rest of the export when a kept file cannot be read', async () => {
	const folder = memoryFolder({ 'kept.png': 'game file' });
	folder.record.kept.push('kept.png');
	folder.failRead = (path) => (path === 'kept.png' ? domError('NotReadableError') : undefined);

	const outcome = await folder.publish({ 'kept.png': 'new generated sprite', 'new.png': 'new' });

	expect(folder.text('kept.png')).toBe('game file');
	expect(outcome).toEqual({ kind: 'published', written: 1, kept: 1, matching: [] });
	expect(folder.text('new.png')).toBe('new');
});

function fakeDirectory(contents: Map<string, string>, onLookup?: (name: string) => void) {
	return {
		async *keys() {
			yield* contents.keys();
		},
		async getFileHandle(name: string, options?: FileSystemGetFileOptions) {
			onLookup?.(name);
			if (!contents.has(name)) {
				if (!options?.create) throw domError('NotFoundError');
				contents.set(name, '');
			}
			return {
				async getFile() {
					return new File([contents.get(name)!], name, { lastModified: 1 });
				},
				async createWritable() {
					let staged = '';
					return {
						async write(data: Uint8Array) {
							staged = new TextDecoder().decode(data);
						},
						async close() {
							contents.set(name, staged);
						},
						async abort() {}
					};
				}
			};
		}
	} as unknown as FileSystemDirectoryHandle;
}

// The adapter creates an empty placeholder even when updating a file the user just deleted.
it.each(['existing sprite', ''])(
	'leaves a deleted file missing after planning saw %j',
	async (old) => {
		const path = 'sprite.png';
		const contents = new Map([[path, old]]);
		let lookups = 0;
		const root = fakeDirectory(contents, (name) => {
			if (++lookups === 2) contents.delete(name);
		});

		const outcome = await publishFiles(directoryTarget(root), files({ [path]: 'new sprite' }), {
			record: { written: { [path]: await sha256(new TextEncoder().encode(old)) }, kept: [] },
			onRecord: async () => {}
		});

		expect({ outcome: outcome.kind, onDisk: contents.get(path) }).toEqual({
			outcome: 'blocked',
			onDisk: undefined
		});
	}
);

// The adapter's portable path check omits Windows device names.
it('rejects Windows device names at any path level', () => {
	for (const path of ['AUX/picture.png', 'sheets/CoN.png', 'sheets/LPT¹.png']) {
		expect(() => pathParts(path), path).toThrow(UnsafePathError);
	}
});

// Disabling automatic updates while an export builds does not prevent the pending write.
it('honors automatic updates being turned off before an in-flight build reaches disk', async () => {
	const identity = <T>(value: T) => value;
	vi.stubGlobal('$state', Object.assign(identity, { raw: identity, snapshot: identity }));
	let publishing: Promise<void> | undefined;
	vi.stubGlobal('navigator', {
		locks: {
			request: (_name: string, work: () => Promise<void>) => (publishing = work())
		}
	});
	vi.useFakeTimers();
	try {
		const contents = new Map<string, string>();
		const destination = fakeDirectory(contents);
		const handle = {
			name: 'assets',
			queryPermission: async () => 'granted',
			async *keys() {},
			getDirectoryHandle: async () => destination
		} as unknown as FileSystemDirectoryHandle;
		let stored: FolderLink = {
			characterId: 'hero',
			handle,
			subfolder: 'hero',
			engine: 'generic',
			auto: true,
			linkedAt: 'first'
		};
		studio.getLink.mockImplementation(async () => stored);
		let started!: () => void;
		let finish!: () => void;
		const building = new Promise<void>((resolve) => (started = resolve));
		const finished = new Promise<void>((resolve) => (finish = resolve));
		studio.buildExport.mockImplementation(async () => {
			started();
			await finished;
			return { kind: 'requested', entries: files({ 'hero.png': 'new' }) };
		});
		const { loadFolderLink, scheduleFolderPublish } =
			await import('../../src/studio/projectFolder.svelte.ts');
		await loadFolderLink('hero');
		scheduleFolderPublish();
		await vi.runAllTimersAsync();
		await building;
		stored = { ...stored, auto: false };
		finish();
		await publishing;
		expect(contents.size).toBe(0);
	} finally {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	}
});

// Approving a pause while another listed file changes again must not drop the other approvals, or Replace alternates
// between two partial lists forever.
it('keeps earlier approvals when a pause comes back for one of the files', async () => {
	const folder = memoryFolder({});
	await folder.publish({ 'a.png': 'one', 'b.png': 'one' });
	folder.set('a.png', 'user a');
	folder.set('b.png', 'user b');
	const approve = (outcome: Awaited<ReturnType<typeof folder.publish>>) => {
		if (outcome.kind !== 'blocked') throw new Error(`expected a pause, got ${outcome.kind}`);
		return new Map(outcome.conflicts.map((c) => [c.path, c.found!]));
	};
	const first = approve(await folder.publish({ 'a.png': 'two', 'b.png': 'two' }));
	folder.set('a.png', 'user a again');

	const again = await folder.publish({ 'a.png': 'two', 'b.png': 'two' }, first);
	expect(again.kind === 'blocked' && again.conflicts.map((c) => c.path).sort()).toEqual([
		'a.png',
		'b.png'
	]);
	expect(folder.text('b.png')).toBe('user b');

	expect(await folder.publish({ 'a.png': 'two', 'b.png': 'two' }, approve(again))).toMatchObject({
		kind: 'published',
		written: 2
	});
	expect([folder.text('a.png'), folder.text('b.png')]).toEqual(['two', 'two']);
});
