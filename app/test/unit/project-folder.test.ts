import { describe, expect, it } from 'vitest';
import { DELETED, NOT_A_FILE, planPublish } from '../../src/lib/project-folder/plan.ts';
import {
	failureReason,
	hashFiles,
	inSync,
	matchesRecord,
	publishFiles,
	sha256
} from '../../src/lib/project-folder/publish.ts';
import { pathParts } from '../../src/lib/project-folder/target.ts';
import { folderSupport } from '../../src/lib/project-folder/support.ts';
import { domError, files, memoryFolder } from './project-folder-memory.ts';

const m = (o: Record<string, string | null>) => new Map(Object.entries(o));
const kinds = (plan: ReturnType<typeof planPublish>) =>
	Object.fromEntries(plan.actions.map((a) => [a.path, a.kind]));
const record = (written: Record<string, string> = {}, kept: string[] = []) => ({ written, kept });
const hash = (text: string) => sha256(new TextEncoder().encode(text));

describe('planPublish', () => {
	it('creates missing files and leaves identical files it did not write unowned', () => {
		const plan = planPublish({
			next: m({ 'a.png': 'A', 'manifest.json': 'M' }) as Map<string, string>,
			record: record(),
			disk: m({ 'a.png': null, 'manifest.json': 'M' })
		});
		expect(kinds(plan)).toEqual({ 'a.png': 'create', 'manifest.json': 'foreign' });
	});

	it('updates only bytes it wrote, and needs approval of the exact bytes for anything else', () => {
		const next = m({ 'a.png': 'A2', 'b.png': 'B', 'c.png': 'C2' }) as Map<string, string>;
		const disk = m({ 'a.png': 'A1', 'b.png': 'FOREIGN', 'c.png': 'GAME' });
		const plan = planPublish({ next, record: record({ 'a.png': 'A1', 'c.png': 'C1' }), disk });
		expect(kinds(plan)).toEqual({ 'a.png': 'update', 'b.png': 'conflict', 'c.png': 'conflict' });
		expect(plan.conflicts.map((c) => [c.reason, c.found])).toEqual([
			['not-ours', 'FOREIGN'],
			['edited-outside', 'GAME']
		]);
		const approved = planPublish({
			next,
			record: record({ 'a.png': 'A1', 'c.png': 'C1' }),
			disk,
			overwrite: new Map([
				['b.png', 'FOREIGN'],
				['c.png', 'OLDER GAME EDIT']
			])
		});
		expect(kinds(approved)).toEqual({ 'a.png': 'update', 'b.png': 'update', 'c.png': 'conflict' });
	});

	it('treats a deleted published file and a folder in the way as the user’s', () => {
		const next = m({ 'a.png': 'A', 'b.png': 'B' }) as Map<string, string>;
		const disk = m({ 'a.png': null, 'b.png': NOT_A_FILE });
		const plan = planPublish({ next, record: record({ 'a.png': 'A', 'b.png': 'B' }), disk });
		expect(plan.conflicts.map((c) => [c.path, c.reason])).toEqual([
			['a.png', 'deleted'],
			['b.png', 'folder']
		]);
		const approved = planPublish({
			next,
			record: record({ 'a.png': 'A', 'b.png': 'B' }),
			disk,
			overwrite: new Map([
				['a.png', DELETED],
				['b.png', NOT_A_FILE]
			])
		});
		expect(kinds(approved)).toEqual({ 'a.png': 'restore', 'b.png': 'conflict' });
	});

	it('skips kept files entirely', () => {
		const plan = planPublish({
			next: m({ 'a.png': 'A2' }) as Map<string, string>,
			record: record({ 'a.png': 'A1' }, ['a.png']),
			disk: m({ 'a.png': 'GAME' })
		});
		expect(kinds(plan)).toEqual({ 'a.png': 'kept' });
		expect(plan.writes).toEqual([]);
	});
});

describe('pathParts', () => {
	it('refuses paths that could leave the folder or that Windows cannot store', () => {
		expect(pathParts('godot/Paperdoll.tscn')).toEqual(['godot', 'Paperdoll.tscn']);
		for (const bad of ['', '/a', 'a//b', '../a', 'a/./b', 'a\\b', 'C:x', 'a/b.', 'a/b ', 'a\u0001'])
			expect(() => pathParts(bad), bad).toThrow();
	});
});

describe('publishFiles', () => {
	it('publishes, records each write, then writes only what changed and never touches other files', async () => {
		const folder = memoryFolder({ 'a.png.import': 'sidecar', 'notes.txt': 'game' });
		expect(await folder.publish({ 'a.png': '1', 'manifest.json': 'm1' })).toMatchObject({
			kind: 'published',
			written: 2
		});
		expect(folder.record.written['a.png']).toBe(await hash('1'));
		expect(await folder.publish({ 'a.png': '1', 'manifest.json': 'm1' })).toEqual({
			kind: 'unchanged',
			kept: 0,
			matching: []
		});
		expect(await folder.publish({ 'a.png': '2', 'manifest.json': 'm1' })).toMatchObject({
			kind: 'published',
			written: 1
		});
		expect(folder.text('a.png.import')).toBe('sidecar');
		expect(folder.text('notes.txt')).toBe('game');
		expect([...folder.files.keys()].sort()).toEqual([
			'a.png',
			'a.png.import',
			'manifest.json',
			'notes.txt'
		]);
	});

	it('writes nothing while any file was edited outside, and replaces only the approved bytes', async () => {
		const folder = memoryFolder();
		await folder.publish({ 'a.png': '1', 'b.tscn': 's1' });
		folder.set('b.tscn', 'game edit');
		const paused = await folder.publish({ 'a.png': '2', 'b.tscn': 's1' });
		if (paused.kind !== 'blocked') throw new Error('expected a pause');
		expect(folder.text('a.png')).toBe('1');
		const approved = new Map(paused.conflicts.map((c) => [c.path, c.found!]));
		folder.set('b.tscn', 'newer game edit');
		expect(await folder.publish({ 'a.png': '2', 'b.tscn': 's1' }, approved)).toMatchObject({
			kind: 'blocked'
		});
		expect(folder.text('b.tscn')).toBe('newer game edit');
		const again = await folder.publish({ 'a.png': '2', 'b.tscn': 's1' });
		if (again.kind !== 'blocked') throw new Error('expected a pause');
		expect(
			await folder.publish(
				{ 'a.png': '2', 'b.tscn': 's1' },
				new Map(again.conflicts.map((c) => [c.path, c.found!]))
			)
		).toMatchObject({ kind: 'published' });
		expect(folder.text('b.tscn')).toBe('s1');
	});

	it('writes the manifest last and resumes after a failed write without losing track', async () => {
		const folder = memoryFolder();
		await folder.publish({ 'a.png': '1', 'manifest.json': 'm1' });
		folder.failWrite = (path) =>
			path === 'manifest.json' ? domError('InvalidStateError') : undefined;
		expect(await folder.publish({ 'a.png': '2', 'manifest.json': 'm2' })).toMatchObject({
			kind: 'failed',
			reason: 'locked',
			written: 1
		});
		expect(folder.log).toEqual(['write a.png', 'write manifest.json', 'write a.png']);
		folder.failWrite = undefined;
		expect(await folder.publish({ 'a.png': '2', 'manifest.json': 'm2' })).toMatchObject({
			kind: 'published',
			written: 1
		});
		expect(folder.text('manifest.json')).toBe('m2');
	});

	it('stops when a write cannot be recorded, and then treats that file as the user’s', async () => {
		const folder = memoryFolder();
		await folder.publish({ 'a.png': '1', 'b.png': '1' });
		folder.failRecord = (path) => (path === 'a.png' ? new Error('storage full') : undefined);
		expect(await folder.publish({ 'a.png': '2', 'b.png': '2' })).toMatchObject({
			kind: 'failed'
		});
		// Images are written several at a time, so b.png may have been under way and finished; either way its record
		// says exactly what it holds, never an older hash.
		expect(folder.record.written['b.png']).toBe(await hash(folder.text('b.png')!));
		folder.failRecord = undefined;
		expect(await folder.publish({ 'a.png': '3', 'b.png': '2' })).toMatchObject({
			kind: 'blocked',
			conflicts: [{ path: 'a.png' }]
		});
	});

	it('starts no further write once one fails, and still writes the manifest only after every other file', async () => {
		const folder = memoryFolder();
		const entries = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`f${i}.png`, 'x']));
		folder.failRecord = (path) => (path === 'f0.png' ? new Error('storage full') : undefined);
		expect(await folder.publish({ ...entries, 'manifest.json': 'm' })).toMatchObject({
			kind: 'failed'
		});
		// At most the writes already under way when f0.png failed (eight at a time) finished; the rest never started.
		expect(folder.log.length).toBeLessThanOrEqual(8);
		expect(folder.text('manifest.json')).toBeNull();

		folder.failRecord = undefined;
		const again = memoryFolder();
		await again.publish({
			...entries,
			'godot/hair.tres': 'frames',
			'manifest.json': 'm',
			'godot/library.tres': 'lib'
		});
		// Images, then the resources naming them, then library.tres naming those, then the manifest.
		expect(again.log.slice(-3)).toEqual([
			'write godot/hair.tres',
			'write godot/library.tres',
			'write manifest.json'
		]);
	});

	it('writes a shared runtime first, then keeps that order for a character in a subfolder', async () => {
		const entries = {
			'pixeldoll-godot/paperdoll.gd': 'runtime',
			'hero/godot/Paperdoll.tscn': 'scene',
			'hero/manifest.json': 'm',
			'hero/godot/library.tres': 'lib',
			'hero/godot/hair.tres': 'frames',
			'hero/layers/hair.png': 'png'
		};
		const options = {
			record: { written: {}, kept: [] },
			onRecord: async () => {},
			manifest: 'hero/manifest.json',
			first: 'pixeldoll-godot'
		};
		const folder = memoryFolder();
		await publishFiles(folder.target, files(entries), options);
		expect(folder.log).toEqual([
			'write pixeldoll-godot/paperdoll.gd',
			'write hero/layers/hair.png',
			'write hero/godot/hair.tres',
			'write hero/godot/Paperdoll.tscn',
			'write hero/godot/library.tres',
			'write hero/manifest.json'
		]);

		// A runtime that cannot be written leaves every character file as it was.
		const failing = memoryFolder();
		failing.failWrite = (path) =>
			path.startsWith('pixeldoll-godot/') ? domError('NoModificationAllowedError') : undefined;
		expect(await publishFiles(failing.target, files(entries), options)).toMatchObject({
			kind: 'failed',
			reason: 'locked'
		});
		expect(failing.log).toEqual([]);
	});

	it('still checks a required kept file: gone or replaced by a folder asks to restore, present stays kept', () => {
		const next = new Map([['rt/a.js', 'h1']]);
		const record = { written: {}, kept: ['rt/a.js'] };
		const required = (path: string) => path.startsWith('rt/');
		const plan = (found: string | null, overwrite?: ReadonlyMap<string, string>) =>
			planPublish({ next, record, disk: new Map([['rt/a.js', found]]), overwrite, required });
		expect(plan('mine').actions).toEqual([{ path: 'rt/a.js', kind: 'kept' }]);
		expect(plan(null).conflicts).toEqual([
			{ path: 'rt/a.js', kind: 'conflict', reason: 'deleted', found: DELETED }
		]);
		expect(plan(NOT_A_FILE).conflicts).toEqual([
			{ path: 'rt/a.js', kind: 'conflict', reason: 'folder', found: NOT_A_FILE }
		]);
		expect(plan(null, new Map([['rt/a.js', DELETED]])).writes).toEqual([
			{ path: 'rt/a.js', kind: 'restore' }
		]);
		// A kept file nobody requires is left alone even when it is gone.
		expect(planPublish({ next, record, disk: new Map([['rt/a.js', null]]) }).actions).toEqual([
			{ path: 'rt/a.js', kind: 'kept' }
		]);
	});

	it('pauses on a deleted published file and restores it only when approved', async () => {
		const folder = memoryFolder();
		await folder.publish({ 'a.png': '1', 'b.png': '1' });
		folder.files.delete('b.png');
		expect(await folder.publish({ 'a.png': '2', 'b.png': '1' })).toMatchObject({
			kind: 'blocked',
			conflicts: [{ path: 'b.png', reason: 'deleted', found: DELETED }]
		});
		expect(folder.files.has('b.png')).toBe(false);
		await folder.publish({ 'a.png': '2', 'b.png': '1' }, new Map([['b.png', DELETED]]));
		expect(folder.text('b.png')).toBe('1');
	});

	it('pauses when a game saves while the new bytes are staged', async () => {
		const folder = memoryFolder();
		await folder.publish({ 'a.png': '1', 'manifest.json': 'm1' });
		folder.onStage = (path) => {
			if (path === 'a.png') folder.set('a.png', 'saved by the game');
		};
		expect(await folder.publish({ 'a.png': '2', 'manifest.json': 'm2' })).toMatchObject({
			kind: 'blocked',
			conflicts: [{ path: 'a.png' }]
		});
		expect(folder.text('a.png')).toBe('saved by the game');
		expect(folder.text('manifest.json')).toBe('m1');
	});

	it('reports missing folders, lost permission and folders in the way without throwing', async () => {
		const gone = memoryFolder();
		gone.failRead = () => domError('NotFoundError');
		expect(await gone.publish({ 'a.png': '1' })).toMatchObject({
			kind: 'failed',
			reason: 'missing'
		});
		const denied = memoryFolder();
		denied.failWrite = () => domError('NotAllowedError');
		expect(await denied.publish({ 'a.png': '1' })).toMatchObject({
			kind: 'failed',
			reason: 'permission'
		});
		const blocked = memoryFolder();
		blocked.dirs.add('a.png');
		expect(await blocked.publish({ 'a.png': '1' })).toMatchObject({
			kind: 'blocked',
			conflicts: [{ reason: 'folder' }]
		});
	});

	it('answers matchesRecord from the record and inSync from the disk too', async () => {
		const folder = memoryFolder();
		await folder.publish({ 'a.png': '1' });
		const next = await hashFiles(files({ 'a.png': '1' }));
		expect(matchesRecord(folder.record, next)).toBe(true);
		expect(await inSync(folder.target, folder.record, next)).toBe(true);
		folder.set('a.png', 'game');
		expect(matchesRecord(folder.record, next)).toBe(true);
		expect(await inSync(folder.target, folder.record, next)).toBe(false);
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
		FileSystemHandle: { prototype: { queryPermission() {}, requestPermission() {} } },
		navigator: { locks: {} }
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
		// Tabs sharing a folder take turns through Web Locks; without them, writing could interleave.
		expect(await folderSupport({ ...api, navigator: {} })).toBe('unsupported');
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

it('records a new file left empty by a write given up after another file failed, so the next publish fills it', async () => {
	const folder = memoryFolder({ 'a.png': 'old' });
	folder.record.written['a.png'] = await hash('old');
	// a.png is edited in the game while its new bytes are staged. b.png is written at the same time: whether it finished
	// or was given up still empty depends on timing, so this checks what must hold either way.
	folder.onStage = (path) => {
		if (path === 'a.png') folder.set(path, 'game edit');
	};
	expect(await folder.publish({ 'a.png': 'new', 'b.png': 'new b' })).toMatchObject({
		kind: 'blocked',
		conflicts: [{ path: 'a.png' }]
	});
	folder.onStage = undefined;
	// b.png's record says exactly what it holds (its new bytes, or the empty file it created), never PENDING.
	expect(folder.record.written['b.png']).toBe(await hash(folder.text('b.png') ?? ''));
	expect(
		await folder.publish(
			{ 'a.png': 'game edit', 'b.png': 'new b' },
			new Map([['a.png', await hash('game edit')]])
		)
	).toMatchObject({ kind: expect.stringMatching(/published|unchanged/) });
	expect(folder.text('b.png')).toBe('new b');
});

describe('required files after planning', () => {
	const publishWith = (
		folder: ReturnType<typeof memoryFolder>,
		record: { written: Record<string, string>; kept: string[] },
		change: () => void
	) =>
		publishFiles(folder.target, files({ 'rt/a.js': 'stock', 'hero/manifest.json': 'new' }), {
			record,
			onRecord: async () => {},
			manifest: 'hero/manifest.json',
			first: 'rt',
			required: (path) => path.startsWith('rt/'),
			proceed: async () => {
				change();
				return true;
			}
		});

	it('pauses when a runtime file already right is deleted or changed before the character lands', async () => {
		for (const [found, reason] of [
			[null, 'deleted'],
			['edited', 'edited-outside']
		] as const) {
			const folder = memoryFolder({ 'rt/a.js': 'stock' });
			const outcome = await publishWith(folder, { written: {}, kept: [] }, () =>
				found === null ? folder.files.delete('rt/a.js') : folder.set('rt/a.js', found)
			);
			expect(outcome).toMatchObject({ kind: 'blocked', conflicts: [{ path: 'rt/a.js', reason }] });
			expect(folder.text('hero/manifest.json')).toBeNull();
		}
	});

	it('pauses when a folder takes the place of a kept runtime file', async () => {
		const folder = memoryFolder({ 'rt/a.js': 'mine' });
		const outcome = await publishWith(folder, { written: {}, kept: ['rt/a.js'] }, () => {
			folder.files.delete('rt/a.js');
			folder.dirs.add('rt/a.js');
		});
		expect(outcome).toMatchObject({
			kind: 'blocked',
			conflicts: [{ path: 'rt/a.js', reason: 'folder', found: NOT_A_FILE }]
		});
		expect(folder.text('hero/manifest.json')).toBeNull();
	});
});

describe('required kept files after planning', () => {
	it('pauses before any dependent file when a kept required file goes while the plan is checked', async () => {
		const folder = memoryFolder({ 'rt/a.js': 'mine' });
		const outcome = await publishFiles(
			folder.target,
			files({ 'rt/a.js': 'stock', 'hero/manifest.json': 'new' }),
			{
				record: { written: {}, kept: ['rt/a.js'] },
				onRecord: async () => {},
				manifest: 'hero/manifest.json',
				first: 'rt',
				required: (path) => path.startsWith('rt/'),
				// The user moves their kept runtime away just as the publish passes its last check.
				proceed: async () => {
					folder.files.delete('rt/a.js');
					return true;
				}
			}
		);
		expect(outcome).toMatchObject({
			kind: 'blocked',
			conflicts: [{ path: 'rt/a.js', reason: 'deleted', found: DELETED }]
		});
		expect(folder.text('hero/manifest.json')).toBeNull();
	});
});
