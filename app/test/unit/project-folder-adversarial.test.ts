// Attacks on the project folder's one promise: a file whose bytes PixelDoll did not leave there is never overwritten,
// truncated or deleted unless the user approved replacing exactly those bytes. Scenarios first written by an independent
// reviewer against the previous design, ported to the trusted record kept outside the folder.
import { describe, expect, it } from 'vitest';
import { DELETED } from '../../src/lib/project-folder/plan.ts';
import { publishFiles, sha256 } from '../../src/lib/project-folder/publish.ts';
import { directoryTarget } from '../../src/lib/project-folder/target.ts';
import { domError, files, memoryFolder } from './project-folder-memory.ts';

const sprite = 'hero.png';
const other = 'other.png';
const userEdit = 'game editor bytes';
const before = 'first export';
const after = 'next export';
const hash = (value: string) => sha256(new TextEncoder().encode(value));

async function published(entries: Record<string, string> = { [sprite]: before }) {
	const folder = memoryFolder();
	expect(await folder.publish(entries)).toMatchObject({ kind: 'published' });
	return folder;
}

describe('edits at every moment', () => {
	it.each([userEdit, ''])('preserves an edit made before planning (%j)', async (edit) => {
		const folder = await published();
		folder.set(sprite, edit);
		expect(await folder.publish({ [sprite]: after })).toMatchObject({
			kind: 'blocked',
			conflicts: [{ path: sprite }]
		});
		expect(folder.text(sprite)).toBe(edit);
	});

	it.each(['edit', 'delete and recreate'])(
		'preserves a file after a %s while its new bytes are staged',
		async (change) => {
			const folder = await published();
			folder.onStage = (path) => {
				if (path !== sprite) return;
				if (change === 'delete and recreate') folder.files.delete(path);
				folder.set(path, userEdit);
			};
			expect(await folder.publish({ [sprite]: after })).toMatchObject({ kind: 'blocked' });
			expect(folder.text(sprite)).toBe(userEdit);
		}
	);

	it('preserves a later file edited while an earlier one is staged', async () => {
		const folder = await published({ [sprite]: before, [other]: before });
		folder.onStage = (path) => {
			if (path === sprite) folder.set(other, userEdit);
		};
		expect(await folder.publish({ [sprite]: after, [other]: after })).toMatchObject({
			kind: 'blocked',
			conflicts: [{ path: other }]
		});
		expect(folder.text(other)).toBe(userEdit);
		expect(folder.text(sprite)).toBe(after);
	});

	it('preserves a file the user creates after planning saw the path empty', async () => {
		const folder = await published({ [other]: before });
		folder.onStage = (path) => {
			if (path === other) folder.set(sprite, userEdit);
		};
		expect(await folder.publish({ [other]: after, [sprite]: after })).toMatchObject({
			kind: 'blocked',
			conflicts: [{ path: sprite }]
		});
		expect(folder.text(sprite)).toBe(userEdit);
	});

	it('preserves an empty file the user created before PixelDoll opened the path', async () => {
		const folder = await published({ [other]: before });
		folder.onStage = (path) => {
			if (path === other) folder.set(sprite, '');
		};
		expect(await folder.publish({ [other]: after, [sprite]: after })).toMatchObject({
			kind: 'blocked'
		});
		expect(folder.text(sprite)).toBe('');
	});

	// Documented limit: the browser has no compare-and-swap. A file replaced in the instant after PixelDoll opened it,
	// or after the final check read it, cannot be told apart; these record that the gap exists.
	it.fails('cannot see an empty file swapped in after PixelDoll opened the path', async () => {
		const folder = memoryFolder();
		folder.onStage = (path) => {
			if (path !== sprite) return;
			folder.files.delete(path);
			folder.set(path, '');
		};
		await folder.publish({ [sprite]: after });
		expect(folder.text(sprite)).toBe('');
	});
	it.fails('cannot see an edit landing between the final check and the swap', async () => {
		const folder = await published();
		const read = folder.target.read;
		let staged = false;
		folder.onStage = (path) => {
			if (path === sprite) staged = true;
		};
		folder.target.read = async (path) => {
			const snapshot = await read(path);
			if (staged && path === sprite) folder.set(path, userEdit);
			return snapshot;
		};
		await folder.publish({ [sprite]: after });
		expect(folder.text(sprite)).toBe(userEdit);
	});

	it('keeps user bytes when the final check cannot read them', async () => {
		const folder = await published();
		folder.onStage = (path) => {
			if (path !== sprite) return;
			folder.set(path, userEdit);
			folder.failRead = (name) => (name === path ? domError('NotReadableError') : undefined);
		};
		expect(await folder.publish({ [sprite]: after })).toMatchObject({
			kind: 'failed',
			reason: 'locked'
		});
		expect(folder.text(sprite)).toBe(userEdit);
	});

	it('pauses, keeping its contents, when a folder appears where a file belongs', async () => {
		const child = `${sprite}/game.txt`;
		const folder = await published({ [other]: before });
		folder.onStage = (path) => {
			if (path !== other) return;
			folder.dirs.add(sprite);
			folder.set(child, userEdit);
		};
		expect(await folder.publish({ [other]: after, [sprite]: after })).toMatchObject({
			kind: 'blocked',
			conflicts: [{ path: sprite, reason: 'folder' }]
		});
		expect(folder.text(child)).toBe(userEdit);
	});
});

describe('approvals', () => {
	it('replaces exactly the approved bytes, and an old approval does not cover a later edit', async () => {
		const folder = memoryFolder({ [sprite]: userEdit });
		const overwrite = new Map([[sprite, await hash(userEdit)]]);
		expect(await folder.publish({ [sprite]: after }, overwrite)).toMatchObject({
			kind: 'published'
		});
		folder.set(sprite, 'later edit');
		expect(await folder.publish({ [sprite]: 'newest' }, overwrite)).toMatchObject({
			kind: 'blocked'
		});
		expect(folder.text(sprite)).toBe('later edit');
	});

	it('does not replace an approved file edited again while its replacement is staged', async () => {
		const folder = memoryFolder({ [sprite]: userEdit });
		folder.onStage = (path) => {
			if (path === sprite) folder.set(path, 'later edit');
		};
		expect(
			await folder.publish({ [sprite]: after }, new Map([[sprite, await hash(userEdit)]]))
		).toMatchObject({ kind: 'blocked' });
		expect(folder.text(sprite)).toBe('later edit');
	});

	it('never applies an approval to the same bytes at another path', async () => {
		const folder = memoryFolder({ [sprite]: userEdit, [other]: userEdit });
		// The approved file is listed again with the pause, so one approval can cover both.
		expect(
			await folder.publish(
				{ [sprite]: after, [other]: after },
				new Map([[other, await hash(userEdit)]])
			)
		).toMatchObject({ kind: 'blocked', conflicts: [{ path: sprite }, { path: other }] });
		expect(folder.text(sprite)).toBe(userEdit);
		expect(folder.text(other)).toBe(userEdit);
	});

	it('does not restore a deleted file without approval, nor recreate one the user put back', async () => {
		const folder = await published();
		folder.files.delete(sprite);
		expect(await folder.publish({ [sprite]: after })).toMatchObject({ kind: 'blocked' });
		expect(folder.files.has(sprite)).toBe(false);
		folder.set(sprite, userEdit);
		expect(await folder.publish({ [sprite]: after }, new Map([[sprite, DELETED]]))).toMatchObject({
			kind: 'blocked'
		});
		expect(folder.text(sprite)).toBe(userEdit);
	});
});

describe('nothing in the folder grants ownership', () => {
	it.each(['{"version":1,"committed":{"hero.png":"x"},"pending":null}', 'not json', ''])(
		'ignores an ownership file in the folder (%j)',
		async (forged) => {
			const folder = memoryFolder({ '.pixeldoll-publish.json': forged, [sprite]: userEdit });
			expect(await folder.publish({ [sprite]: after })).toMatchObject({ kind: 'blocked' });
			expect(folder.text(sprite)).toBe(userEdit);
			expect(folder.text('.pixeldoll-publish.json')).toBe(forged);
		}
	);

	it('leaves an identical file it did not write unowned, so a later change still asks', async () => {
		const folder = memoryFolder({ [sprite]: before });
		expect(await folder.publish({ [sprite]: before })).toMatchObject({ kind: 'unchanged' });
		expect(await folder.publish({ [sprite]: after })).toMatchObject({ kind: 'blocked' });
		expect(folder.text(sprite)).toBe(before);
	});

	it('does not take over a user edit that happens to match the next export', async () => {
		const folder = await published({ [sprite]: before, [other]: before });
		folder.set(sprite, after);
		expect(await folder.publish({ [sprite]: after, [other]: after })).toMatchObject({
			kind: 'published',
			written: 1
		});
		expect(folder.record.written[sprite]).toBe(await hash(before));
		folder.set(sprite, 'user again');
		expect(await folder.publish({ [sprite]: 'third', [other]: after })).toMatchObject({
			kind: 'blocked'
		});
		expect(folder.text(sprite)).toBe('user again');
	});
});

describe('crashes and retries', () => {
	it('treats a file written just before a crash, but never recorded, as the user’s', async () => {
		const folder = await published();
		folder.failRecord = () => new Error('tab closed');
		expect(await folder.publish({ [sprite]: after })).toMatchObject({ kind: 'failed' });
		folder.failRecord = undefined;
		expect(await folder.publish({ [sprite]: 'third' })).toMatchObject({ kind: 'blocked' });
		expect(folder.text(sprite)).toBe(after);
	});

	it('preserves a reversion the user made after a partial update', async () => {
		const folder = await published({ [sprite]: before, [other]: before });
		folder.failWrite = (path) => (path === other ? domError('InvalidStateError') : undefined);
		expect(await folder.publish({ [sprite]: after, [other]: after })).toMatchObject({
			kind: 'failed'
		});
		folder.failWrite = undefined;
		folder.set(sprite, before);
		expect(await folder.publish({ [sprite]: after, [other]: after })).toMatchObject({
			kind: 'blocked',
			conflicts: [{ path: sprite }]
		});
		expect(folder.text(sprite)).toBe(before);
	});

	it('preserves an edit made during a retry', async () => {
		const folder = await published();
		folder.failWrite = () => domError('NotAllowedError');
		await folder.publish({ [sprite]: after });
		folder.failWrite = undefined;
		folder.onStage = (path) => {
			if (path === sprite) folder.set(path, userEdit);
		};
		expect(await folder.publish({ [sprite]: after })).toMatchObject({ kind: 'blocked' });
		expect(folder.text(sprite)).toBe(userEdit);
	});
});

describe('kept files, paths and scale', () => {
	it('never writes a kept file and still publishes the rest', async () => {
		const folder = await published({ [sprite]: before, [other]: before });
		folder.set(sprite, userEdit);
		folder.record.kept.push(sprite);
		expect(await folder.publish({ [sprite]: after, [other]: after })).toMatchObject({
			kind: 'published',
			written: 1,
			kept: 1
		});
		expect(folder.text(sprite)).toBe(userEdit);
		expect(folder.text(other)).toBe(after);
	});

	it('leaves engine sidecars and the game’s own files alone through every publish', async () => {
		const folder = memoryFolder({
			[`${sprite}.import`]: 'godot import',
			[`${sprite}.meta`]: 'unity meta',
			'player.gd': 'script'
		});
		await folder.publish({ [sprite]: before });
		await folder.publish({ [sprite]: after });
		expect(folder.text(`${sprite}.import`)).toBe('godot import');
		expect(folder.text(`${sprite}.meta`)).toBe('unity meta');
		expect(folder.text('player.gd')).toBe('script');
		expect(folder.log.every((entry) => entry === `write ${sprite}`)).toBe(true);
	});

	it('scopes an approval to the exact spelling on a case-insensitive folder', async () => {
		const folder = memoryFolder({ 'Hero.png': userEdit, 'hero.png': userEdit });
		expect(
			await folder.publish(
				{ 'hero.png': after, 'Hero.png': after },
				new Map([['Hero.png', await hash(userEdit)]])
			)
		).toMatchObject({ kind: 'blocked', conflicts: [{ path: 'hero.png' }, { path: 'Hero.png' }] });
		expect(folder.text('Hero.png')).toBe(userEdit);
		expect(folder.text('hero.png')).toBe(userEdit);
	});

	it('checks the last of 1,024 files before writing any of them', async () => {
		const entries = Object.fromEntries(
			Array.from({ length: 1024 }, (_, i) => [`f${String(i).padStart(4, '0')}.png`, 'x'])
		);
		const folder = memoryFolder({ 'f1023.png': userEdit });
		expect(await folder.publish(entries)).toMatchObject({
			kind: 'blocked',
			conflicts: [{ path: 'f1023.png' }]
		});
		expect(folder.log).toEqual([]);
	});
});

describe('round two', () => {
	// Fixed: a path is untrusted from just before its swap until its new hash is recorded.
	it('preserves a user reversion to the old hash after a successful swap and failed record update', async () => {
		const folder = await published();
		folder.failRecord = () => new Error('storage full');
		expect(await folder.publish({ [sprite]: after })).toMatchObject({
			kind: 'failed',
			written: 1
		});
		expect(folder.text(sprite)).toBe(after);
		folder.set(sprite, before);
		folder.failRecord = undefined;
		await folder.publish({ [sprite]: 'third export' });
		expect(folder.text(sprite)).toBe(before);
	});

	// Documented limit, like the final instant before a swap: the File System Access API has no exclusive create, so an
	// empty file saved between PixelDoll's lookup and its create looks like PixelDoll's own new file.
	it.fails(
		'preserves an empty user file inserted between the browser adapter’s lookup and create',
		async () => {
			const folder = memoryFolder();
			let lookups = 0;
			const root = {
				async *keys() {
					yield* folder.files.keys();
				},
				async getFileHandle(name: string, options?: FileSystemGetFileOptions) {
					if (!options?.create && !folder.files.has(name)) {
						if (++lookups === 2) folder.set(name, '');
						throw domError('NotFoundError');
					}
					return {
						async getFile() {
							return new File([folder.files.get(name)!.slice()], name, { lastModified: 1 });
						},
						async createWritable() {
							let staged = new Uint8Array();
							return {
								async write(data: Uint8Array) {
									staged = data.slice();
								},
								async close() {
									folder.files.set(name, staged);
								},
								async abort() {}
							};
						}
					};
				}
			} as unknown as FileSystemDirectoryHandle;
			await publishFiles(directoryTarget(root), files({ [sprite]: after }), {
				record: folder.record,
				onRecord: async () => {}
			});
			expect(lookups).toBe(2);
			expect(folder.text(sprite)).toBe('');
		}
	);

	it('does not reuse approval after an approved replacement was written but could not be recorded', async () => {
		const folder = await published();
		folder.set(sprite, userEdit);
		folder.failRecord = () => new Error('storage full');
		const approval = new Map([[sprite, await hash(userEdit)]]);
		expect(await folder.publish({ [sprite]: after }, approval)).toMatchObject({
			kind: 'failed',
			written: 1
		});
		folder.failRecord = undefined;
		folder.set(sprite, userEdit);
		expect(await folder.publish({ [sprite]: 'third export' })).toMatchObject({ kind: 'blocked' });
		expect(folder.text(sprite)).toBe(userEdit);
	});

	it('keeps a path even when a queued request also approves its exact current bytes', async () => {
		const folder = await published({ [sprite]: before, [other]: before });
		folder.set(sprite, userEdit);
		folder.record.kept.push(sprite);
		const approval = new Map([[sprite, await hash(userEdit)]]);
		expect(await folder.publish({ [sprite]: after, [other]: after }, approval)).toMatchObject({
			kind: 'published',
			written: 1,
			kept: 1
		});
		expect(folder.text(sprite)).toBe(userEdit);
		expect(folder.text(other)).toBe(after);
	});
});

describe('browser adapter final check', () => {
	/** A minimal File System Access folder whose single file a "game" rewrites during PixelDoll's content check. */
	function fakeFolder(initial: string) {
		let bytes = new TextEncoder().encode(initial);
		let modified = 1;
		let reads = 0;
		const handle = {
			async getFile() {
				return new File([bytes.slice()], sprite, { lastModified: modified });
			},
			async createWritable() {
				let staged = new Uint8Array();
				return {
					async write(data: Uint8Array) {
						staged = data.slice();
					},
					async close() {
						bytes = staged;
						modified++;
					},
					async abort() {}
				};
			}
		};
		const root = {
			async *keys() {
				yield sprite;
			},
			async getFileHandle() {
				return handle;
			}
		} as unknown as FileSystemDirectoryHandle;
		return {
			root,
			text: () => new TextDecoder().decode(bytes),
			/** Called by the content check's read: the game saves right after PixelDoll read the bytes. */
			edit(onRead: number, keepTime = false) {
				const original = handle.getFile;
				handle.getFile = async () => {
					const file = await original();
					if (++reads === onRead) {
						bytes = new TextEncoder().encode(userEdit);
						if (!keepTime) modified++;
					}
					return file;
				};
			}
		};
	}

	it('catches an edit saved while PixelDoll was checking the content', async () => {
		const folder = fakeFolder(before);
		const record = { written: { [sprite]: await hash(before) }, kept: [] };
		// Reads: 1 planning, 2 size/time before the check, 3 the content check itself (the game saves right after it).
		folder.edit(3);
		const outcome = await publishFiles(directoryTarget(folder.root), files({ [sprite]: after }), {
			record,
			onRecord: async () => {}
		});
		expect(outcome).toMatchObject({ kind: 'blocked', conflicts: [{ path: sprite }] });
		expect(folder.text()).toBe(userEdit);
	});

	// Documented limit: on a file system whose timestamps are too coarse to change (FAT, some network shares), a
	// same-size edit saved during the content check looks unchanged to the size and time comparison.
	it.fails('cannot see a same-size edit that keeps the modified time', async () => {
		const same = 'x'.repeat(userEdit.length);
		const folder = fakeFolder(same);
		folder.edit(3, true);
		await publishFiles(directoryTarget(folder.root), files({ [sprite]: after }), {
			record: { written: { [sprite]: await hash(same) }, kept: [] },
			onRecord: async () => {}
		});
		expect(folder.text()).toBe(userEdit);
	});
});
