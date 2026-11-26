import { describe, expect, it } from 'vitest';
import {
	committedIndex,
	EMPTY_HASH,
	INDEX_NAME,
	parseIndex,
	pendingIndex,
	planPublish,
	type PublishIndex
} from '../../src/lib/project-folder/plan.ts';
import {
	failureReason,
	hashFiles,
	inSync,
	matchesPublished,
	publishFiles,
	type FolderFile
} from '../../src/lib/project-folder/publish.ts';
import {
	NotAFileError,
	pathParts,
	type FolderTarget
} from '../../src/lib/project-folder/target.ts';
import { folderSupport } from '../../src/lib/project-folder/support.ts';

const m = (o: Record<string, string | null>) => new Map(Object.entries(o));
const kinds = (plan: ReturnType<typeof planPublish>) =>
	Object.fromEntries(plan.actions.map((a) => [a.path, a.kind]));
const index = (committed: Record<string, string>, pending: Record<string, string> | null = null) =>
	({ version: 1, committed, pending }) satisfies PublishIndex;

describe('planPublish', () => {
	it('creates new files, and takes over identical existing ones only when the user asked', () => {
		const next = m({ 'a.png': 'A', 'manifest.json': 'M' }) as Map<string, string>;
		const disk = m({ 'a.png': null, 'manifest.json': 'M' });
		const background = planPublish({ next, index: null, disk });
		expect(kinds(background)).toEqual({ 'a.png': 'create', 'manifest.json': 'foreign' });
		expect(committedIndex(next, background, disk).committed).toEqual({ 'a.png': 'A' });
		const asked = planPublish({ next, index: null, disk, adopt: true });
		expect(kinds(asked)).toEqual({ 'a.png': 'create', 'manifest.json': 'adopt' });
		expect(asked.blocked).toBe(false);
	});

	it('blocks on a file it never wrote and on one edited after publishing, until those exact bytes are approved', () => {
		const next = m({ 'a.png': 'A2', 'b.png': 'B' }) as Map<string, string>;
		const disk = m({ 'a.png': 'GAME', 'b.png': 'FOREIGN' });
		const plan = planPublish({ next, index: index({ 'a.png': 'A1' }), disk });
		expect(plan.conflicts).toEqual([
			{ path: 'a.png', kind: 'conflict', reason: 'edited-outside', found: 'GAME' },
			{ path: 'b.png', kind: 'conflict', reason: 'not-ours', found: 'FOREIGN' }
		]);
		const approved = new Map([
			['a.png', 'GAME'],
			['b.png', 'FOREIGN']
		]);
		const forced = planPublish({
			next,
			index: index({ 'a.png': 'A1' }),
			disk,
			overwrite: approved
		});
		expect(kinds(forced)).toEqual({ 'a.png': 'update', 'b.png': 'update' });
		// Edited again after the user approved: still a conflict.
		const later = planPublish({
			next,
			index: index({ 'a.png': 'A1' }),
			disk: m({ 'a.png': 'GAME 2', 'b.png': 'FOREIGN' }),
			overwrite: approved
		});
		expect(later.conflicts.map((c) => c.path)).toEqual(['a.png']);
	});

	it('recovers interrupted publishes, even twice in a row with a newer revision', () => {
		const before = index({ 'a.png': 'A1', 'b.png': 'B1' });
		const b = m({ 'a.png': 'B-a', 'b.png': 'B-b' }) as Map<string, string>;
		const diskB = m({ 'a.png': 'A1', 'b.png': 'B1' });
		const crashedB = pendingIndex(
			before,
			b,
			planPublish({ next: b, index: before, disk: diskB }),
			diskB
		);
		// a.png landed, then the browser died. The character changed again (revision C) before the retry.
		const c = m({ 'a.png': 'C-a', 'b.png': 'C-b' }) as Map<string, string>;
		const diskC = m({ 'a.png': 'B-a', 'b.png': 'B1' });
		const planC = planPublish({ next: c, index: crashedB, disk: diskC });
		expect(planC.recovering).toBe(true);
		expect(kinds(planC)).toEqual({ 'a.png': 'update', 'b.png': 'update' });
		const crashedC = pendingIndex(crashedB, c, planC, diskC);
		// Interrupted again before anything landed: the bytes from revision B must still count as ours.
		const retry = planPublish({ next: c, index: crashedC, disk: diskC });
		expect(retry.blocked).toBe(false);
		expect(kinds(retry)).toEqual({ 'a.png': 'update', 'b.png': 'update' });
	});

	it('treats an empty file left by an interrupted first write as its own', () => {
		const next = m({ 'a.png': 'A' }) as Map<string, string>;
		const crashed = pendingIndex(
			null,
			next,
			planPublish({ next, index: null, disk: m({ 'a.png': null }) }),
			m({ 'a.png': null })
		);
		const retry = planPublish({ next, index: crashed, disk: m({ 'a.png': EMPTY_HASH }) });
		expect(kinds(retry)).toEqual({ 'a.png': 'update' });
		// An existing file emptied by someone else after an interrupted update is not ours to replace.
		const before = index({ 'b.png': 'B1' });
		const update = m({ 'b.png': 'B2' }) as Map<string, string>;
		const disk = m({ 'b.png': 'B1' });
		const interrupted = pendingIndex(
			before,
			update,
			planPublish({ next: update, index: before, disk }),
			disk
		);
		expect(
			planPublish({ next: update, index: interrupted, disk: m({ 'b.png': EMPTY_HASH }) }).blocked
		).toBe(true);
	});

	it('keeps stale files owned until removal is asked for, and only removes unchanged ones', () => {
		const idx = index({ 'old.png': 'O', 'edited.png': 'E' });
		const disk = m({ 'old.png': 'O', 'edited.png': 'GAME' });
		const keep = planPublish({ next: new Map(), index: idx, disk });
		expect(kinds(keep)).toEqual({ 'old.png': 'stale', 'edited.png': 'stale-edited' });
		expect(committedIndex(new Map(), keep, disk).committed).toEqual({ 'old.png': 'O' });
		const remove = planPublish({ next: new Map(), index: idx, disk, removeStale: true });
		expect(kinds(remove)).toEqual({ 'old.png': 'remove', 'edited.png': 'stale-edited' });
	});

	it('reports a damaged index instead of guessing', () => {
		expect(parseIndex(null)).toBeNull();
		expect(parseIndex('{')).toBe('invalid');
		expect(parseIndex('{"version":2,"committed":{},"pending":null}')).toBe('invalid');
		expect(parseIndex('{"version":1,"committed":{"a":1},"pending":null}')).toBe('invalid');
		expect(parseIndex('{"version":1,"committed":{"a":"x"},"pending":null}')).toEqual(
			index({ a: 'x' })
		);
	});
});

describe('pathParts', () => {
	it('refuses paths that could leave the folder or that Windows cannot store', () => {
		expect(pathParts('godot/Paperdoll.tscn')).toEqual(['godot', 'Paperdoll.tscn']);
		for (const bad of ['', '/a', 'a//b', '../a', 'a/./b', 'a\\b', 'C:x', 'a/b.', 'a/b ', 'a\u0001'])
			expect(() => pathParts(bad), bad).toThrow();
	});
});

/** An in-memory folder that can fail on chosen operations, like a locked or vanished file. */
function memoryFolder(initial: Record<string, string> = {}) {
	const files = new Map(Object.entries(initial).map(([k, v]) => [k, new TextEncoder().encode(v)]));
	const dirs = new Set<string>();
	let failWrite: ((path: string) => Error | undefined) | undefined;
	let failRead: ((path: string) => Error | undefined) | undefined;
	const target: FolderTarget = {
		async read(path) {
			const e = failRead?.(path);
			if (e) throw e;
			if (dirs.has(path)) throw new NotAFileError(path);
			return files.get(path) ?? null;
		},
		async write(path, data) {
			const e = failWrite?.(path);
			if (e) throw e;
			files.set(path, data.slice());
		},
		async remove(path) {
			files.delete(path);
		}
	};
	return {
		target,
		files,
		dirs,
		text: (path: string) => {
			const b = files.get(path);
			return b ? new TextDecoder().decode(b) : null;
		},
		set failWrite(f: typeof failWrite) {
			failWrite = f;
		},
		set failRead(f: typeof failRead) {
			failRead = f;
		}
	};
}
const files = (o: Record<string, string>): FolderFile[] =>
	Object.entries(o).map(([name, v]) => ({ name, data: new TextEncoder().encode(v) }));
const domError = (name: string) => new DOMException('x', name);

describe('publishFiles', () => {
	it('publishes, then writes only changed files, and leaves sidecars and game files alone', async () => {
		const folder = memoryFolder({ 'a.png.import': 'sidecar' });
		const first = await publishFiles(folder.target, files({ 'a.png': '1', 'manifest.json': 'm1' }));
		expect(first).toMatchObject({ kind: 'published', written: 2 });
		expect(
			await publishFiles(folder.target, files({ 'a.png': '1', 'manifest.json': 'm1' }))
		).toEqual({
			kind: 'unchanged'
		});
		const second = await publishFiles(
			folder.target,
			files({ 'a.png': '2', 'manifest.json': 'm1' })
		);
		expect(second).toMatchObject({
			kind: 'published',
			written: 1,
			counts: { update: 1, unchanged: 1 }
		});
		expect(folder.text('a.png')).toBe('2');
		expect(folder.text('a.png.import')).toBe('sidecar');
		expect(JSON.parse(folder.text(INDEX_NAME)!).pending).toBeNull();
	});

	it('writes nothing when a published file was edited outside, until overwrite is chosen', async () => {
		const folder = memoryFolder();
		await publishFiles(folder.target, files({ 'a.png': '1', 'b.tscn': 's1' }));
		folder.files.set('b.tscn', new TextEncoder().encode('game edit'));
		const blocked = await publishFiles(folder.target, files({ 'a.png': '2', 'b.tscn': 's1' }));
		expect(blocked).toMatchObject({ kind: 'blocked', conflicts: [{ path: 'b.tscn' }] });
		expect(folder.text('a.png')).toBe('1');
		const forced = await publishFiles(folder.target, files({ 'a.png': '2', 'b.tscn': 's1' }), {
			overwrite: new Map([
				['b.tscn', blocked.kind === 'blocked' ? blocked.conflicts[0].found! : '']
			])
		});
		expect(forced.kind).toBe('published');
		expect(folder.text('b.tscn')).toBe('s1');
	});

	it('writes the manifest last and finishes an interrupted publish on retry', async () => {
		const folder = memoryFolder();
		await publishFiles(folder.target, files({ 'a.png': '1', 'manifest.json': 'm1' }));
		const order: string[] = [];
		folder.failWrite = (path) => {
			order.push(path);
			return path === 'manifest.json' ? domError('InvalidStateError') : undefined;
		};
		const failed = await publishFiles(
			folder.target,
			files({ 'a.png': '2', 'manifest.json': 'm2' })
		);
		expect(failed).toMatchObject({ kind: 'failed', reason: 'locked', written: 1 });
		expect(order).toEqual([INDEX_NAME, 'a.png', 'manifest.json']);
		expect(JSON.parse(folder.text(INDEX_NAME)!).pending).not.toBeNull();
		folder.failWrite = undefined;
		const retry = await publishFiles(folder.target, files({ 'a.png': '2', 'manifest.json': 'm2' }));
		expect(retry).toMatchObject({ kind: 'published', recovered: true, written: 1 });
		expect(folder.text('manifest.json')).toBe('m2');
	});

	it('reports missing folders, lost permission and folders in the way without throwing', async () => {
		const gone = memoryFolder();
		gone.failRead = () => domError('NotFoundError');
		expect(await publishFiles(gone.target, files({ 'a.png': '1' }))).toMatchObject({
			kind: 'failed',
			reason: 'missing'
		});
		const denied = memoryFolder();
		denied.failWrite = () => domError('NotAllowedError');
		expect(await publishFiles(denied.target, files({ 'a.png': '1' }))).toMatchObject({
			kind: 'failed',
			reason: 'permission'
		});
		const blocked = memoryFolder();
		blocked.dirs.add('a.png');
		expect(await publishFiles(blocked.target, files({ 'a.png': '1' }))).toMatchObject({
			kind: 'blocked'
		});
	});

	it('reports a damaged index with every other conflict, so one approval covers them all', async () => {
		const folder = memoryFolder({ [INDEX_NAME]: 'not json', 'a.png': 'old' });
		const first = await publishFiles(folder.target, files({ 'a.png': 'new' }));
		if (first.kind !== 'blocked') throw new Error('expected a pause');
		expect(first.conflicts.map((c) => c.path)).toEqual([INDEX_NAME, 'a.png']);
		const approved = new Map(first.conflicts.map((c) => [c.path, c.found!]));
		expect(
			await publishFiles(folder.target, files({ 'a.png': 'new' }), { overwrite: approved })
		).toMatchObject({ kind: 'published' });
		expect(folder.text('a.png')).toBe('new');
	});

	it('pauses when a file changes between planning and writing', async () => {
		const folder = memoryFolder();
		await publishFiles(folder.target, files({ 'a.png': '1', 'b.png': '1' }));
		let reads = 0;
		folder.failRead = (path) => {
			// The second read of b.png is the recheck right before writing: an editor saved it in between.
			if (path === 'b.png' && ++reads === 2)
				folder.files.set('b.png', new TextEncoder().encode('game'));
			return undefined;
		};
		const outcome = await publishFiles(folder.target, files({ 'a.png': '2', 'b.png': '2' }));
		expect(outcome).toMatchObject({ kind: 'blocked', conflicts: [{ path: 'b.png' }] });
		expect(folder.text('b.png')).toBe('game');
	});

	it('refuses a folder another character publishes to', async () => {
		const folder = memoryFolder();
		await publishFiles(folder.target, files({ 'a.png': '1' }), { owner: 'hero' });
		expect(
			await publishFiles(folder.target, files({ 'a.png': '1' }), { owner: 'villain' })
		).toMatchObject({
			kind: 'failed',
			reason: 'taken'
		});
		expect(
			await publishFiles(folder.target, files({ 'a.png': '2' }), { owner: 'hero' })
		).toMatchObject({
			kind: 'published'
		});
	});

	it('never offers to replace a folder that sits where a file belongs', async () => {
		const folder = memoryFolder();
		folder.dirs.add('a.png');
		const outcome = await publishFiles(folder.target, files({ 'a.png': '1' }), {
			overwrite: new Map([['a.png', 'not-a-file']])
		});
		expect(outcome).toMatchObject({
			kind: 'blocked',
			conflicts: [{ path: 'a.png', reason: 'folder' }]
		});
	});

	it('checks the disk for game edits when asked to verify', async () => {
		const folder = memoryFolder();
		const list = files({ 'a.png': '1' });
		await publishFiles(folder.target, list);
		const next = await hashFiles(list);
		expect(await inSync(folder.target, next)).toBe(true);
		folder.files.set('a.png', new TextEncoder().encode('game'));
		expect(await matchesPublished(folder.target, next)).toBe(true);
		expect(await inSync(folder.target, next)).toBe(false);
	});

	it('answers matchesPublished from the index alone', async () => {
		const folder = memoryFolder();
		const list = files({ 'a.png': '1' });
		expect(await matchesPublished(folder.target, await hashFiles(list))).toBe(false);
		await publishFiles(folder.target, list);
		expect(await matchesPublished(folder.target, await hashFiles(list))).toBe(true);
		expect(await matchesPublished(folder.target, await hashFiles(files({ 'a.png': '2' })))).toBe(
			false
		);
	});

	it('maps filesystem errors to what the user can do', () => {
		expect(failureReason(domError('QuotaExceededError'))).toBe('space');
		expect(failureReason(domError('NotReadableError'))).toBe('locked');
		expect(failureReason(new Error('?'))).toBe('unknown');
	});
});

describe('folderSupport', () => {
	const api = {
		isSecureContext: true,
		self: 1,
		top: 1,
		showDirectoryPicker() {},
		FileSystemHandle: { prototype: { queryPermission() {}, requestPermission() {} } }
	};
	it('detects Chromium, Brave with the flag off, and everything else', async () => {
		expect(await folderSupport(api)).toBe('supported');
		expect(
			await folderSupport({
				isSecureContext: true,
				self: 1,
				top: 1,
				navigator: { brave: { isBrave: async () => true } }
			})
		).toBe('brave-disabled');
		expect(await folderSupport({ isSecureContext: true, self: 1, top: 1 })).toBe('unsupported');
		expect(await folderSupport({ ...api, isSecureContext: false })).toBe('unsupported');
		expect(await folderSupport({ ...api, top: 2 })).toBe('unsupported');
		expect(
			await folderSupport({
				isSecureContext: true,
				self: 1,
				top: 1,
				navigator: { brave: { isBrave: () => Promise.reject(new Error('x')) } }
			})
		).toBe('unsupported');
	});
});
