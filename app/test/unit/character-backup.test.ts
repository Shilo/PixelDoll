import { beforeEach, expect, test, vi } from 'vitest';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { cellHash, type Sha256 } from '../../src/lib/rig/rig.ts';
import {
	downloadArchivedBackup,
	exportBackup,
	listArchiveDownloads,
	planRestore,
	readRestoreSource,
	RestoreChangedError,
	restoreCharacters
} from '../../src/lib/store/backup.ts';
import type { StoredProject } from '../../src/lib/store/project.ts';
import { exportWorkspace } from '../../src/lib/store/workspace.ts';
import { unzip, zip } from '../../src/lib/store/zip.ts';
import { equipmentFixture } from './equipment-fixture.ts';

// IndexedDB is a browser API (its batch rollback is a self-test in db.ts): this stand-in keeps the same contract, reading one
// snapshot and refusing to overwrite, so these tests cover what is planned and written.
const saved = vi.hoisted(() => ({
	projects: new Map<string, unknown>(),
	blobs: new Map<string, Blob>(),
	/** Another tab's write between the preview and the restore's transaction. */
	meanwhile: undefined as (() => void) | undefined,
	/** A failure inside the transaction, such as a full disk. */
	failure: undefined as Error | undefined
}));
vi.mock(import('../../src/lib/store/db.ts'), async (original) => {
	const snapshot = (hashes: readonly string[]) => ({
		records: new Map(
			[...saved.projects]
				.filter(([key]) => key.startsWith('rig-'))
				.map(([key, value]) => [key, structuredClone(value)])
		),
		stored: new Set(hashes.filter((hash) => saved.blobs.has(hash)))
	});
	return {
		...(await original()),
		get: async <T>(_store: string, key: string) =>
			structuredClone(saved.projects.get(key)) as T | undefined,
		askPersist() {},
		readCharacters: async (hashes: readonly string[]) => snapshot(hashes),
		async addCharacters(
			hashes: readonly string[],
			add: (seen: ReturnType<typeof snapshot>) => {
				records: Map<string, unknown>;
				blobs: Map<string, Blob>;
			},
			opaque: ReadonlyMap<string, unknown> = new Map()
		) {
			saved.meanwhile?.();
			saved.meanwhile = undefined;
			const seen = snapshot(hashes),
				out = add(seen);
			for (const id of out.records.keys())
				if (saved.projects.has(id)) throw new DOMException('Key exists', 'ConstraintError');
			if (saved.failure) throw saved.failure;
			for (const [hash, blob] of out.blobs) if (!saved.blobs.has(hash)) saved.blobs.set(hash, blob);
			for (const [id, record] of out.records) saved.projects.set(id, structuredClone(record));
			for (const [id, record] of opaque)
				if (!saved.projects.has(id)) saved.projects.set(id, structuredClone(record));
			return seen;
		},
		async readWorkspaceSnapshot(
			select: (key: string, value: unknown) => boolean,
			references: (records: Map<string, unknown>) => ReadonlyMap<string, unknown>
		) {
			const projects = new Map(
				[...saved.projects]
					.filter(([key, value]) => !key.startsWith('library-archive:') && select(key, value))
					.map(([key, value]) => [key, structuredClone(value)])
			);
			const blobs = new Map<string, Blob>();
			for (const hash of references(projects).keys()) {
				const blob = saved.blobs.get(hash);
				if (blob) blobs.set(hash, blob);
			}
			return {
				projects,
				blobs,
				jobs: [],
				retainedIds: [...saved.projects.keys()].filter((key) => key.startsWith('library-archive:'))
			};
		}
	};
});

vi.stubGlobal('__APP_VERSION__', 'test');
vi.stubGlobal('__APP_COMMIT__', 'abc');

let artwork: Map<string, Blob>;
let character: StoredProject;

beforeEach(async () => {
	const { manifest, images } = await equipmentFixture();
	artwork = new Map();
	for (const image of images.values())
		artwork.set(
			(await cellHash(image)).slice(7),
			new Blob([(await encodePngBytes(image)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
		);
	character = {
		id: 'rig-a',
		savedAt: '2026-11-01T00:00:00.000Z',
		creationSpec: 'internal attempt',
		origin: 'studio',
		manifest
	};
	saved.projects = new Map<string, unknown>([
		['rig-a', character],
		['rig-dev', { id: 'rig-dev', origin: 'dev' }],
		['studio-drafts', { id: 'studio-drafts', gens: [] }],
		['dress-fixture:s2', { format: 'pixeldoll/3' }]
	]);
	saved.blobs = new Map(artwork);
	saved.meanwhile = saved.failure = undefined;
});

const backup = async () => (await exportBackup(['secret-key'])).bytes;
const restored = (id: string) => saved.projects.get(id) as StoredProject;

test('a backup holds only saved Studio characters and restores them with their artwork', async () => {
	const reference = [...artwork.keys()].at(-1)!;
	character.manifest.rig.animations[0].sources = {
		south: {
			route: 'import',
			reference: `sha256:${reference}` as Sha256,
			referenceKeypoints: [],
			provenance: []
		}
	};
	const stateGeneration = { token: 'pending-state' };
	saved.projects.set('rig-a', { ...character, stateGeneration });
	const file = await exportBackup([]);
	expect(file).toMatchObject({ characters: 1, hasOmissions: false });
	const source = await readRestoreSource(file.bytes);
	expect(source).toMatchObject({ kind: 'backup', build: 'test (abc)', unreadable: 0 });
	expect([...source.characters.keys()]).toEqual(['rig-a']);
	expect(source.characters.get('rig-a')!.creationSpec).toBeUndefined();
	expect(source.characters.get('rig-a')!.stateGeneration).toBeUndefined();
	expect(source.blobs.has(reference)).toBe(true);
	expect(restored('rig-a')).toMatchObject({ stateGeneration });
	expect((await planRestore(source)).entries).toMatchObject([{ action: 'skip', match: 'rig-a' }]);

	saved.projects = new Map([['rig-dev', { id: 'rig-dev', origin: 'dev' }]]);
	saved.blobs = new Map();
	const plan = await planRestore(source);
	expect(plan.entries).toMatchObject([{ id: 'rig-a', name: 'Fixture', action: 'add' }]);
	expect(plan.warnings).toEqual([]);
	expect(plan.blockers).toEqual([]);
	expect(await restoreCharacters(plan)).toEqual({ added: [{ from: 'rig-a', id: 'rig-a' }] });
	expect(restored('rig-a')).toMatchObject({
		origin: 'studio',
		manifest: character.manifest,
		restoredFrom: { id: 'rig-a', fingerprint: plan.entries[0].fingerprint, build: 'test (abc)' }
	});
	expect([...saved.blobs.keys()].sort()).toEqual(
		[...(await readRestoreSource(file.bytes)).blobs.keys()].sort()
	);

	// The same backup again finds the restored character unchanged.
	const again = await planRestore(source);
	expect(again.entries).toMatchObject([{ action: 'skip', match: 'rig-a' }]);
	expect(await restoreCharacters(again)).toEqual({ added: [] });
});

test('a restore copies a character whose ID holds different content, and explains an edited copy', async () => {
	const source = await readRestoreSource(await backup());
	const edited = structuredClone(character);
	edited.manifest.name = 'Renamed here';
	saved.projects.set('rig-a', edited);
	const before = structuredClone(saved.projects.get('rig-a'));

	const plan = await planRestore(source);
	expect(plan.entries).toMatchObject([{ id: 'rig-a', action: 'copy' }]);
	const [{ id: copy }] = (
		await restoreCharacters(plan, {
			keepArchived: false,
			keys: [],
			copyName: (name) => `${name} (Restored)`
		})
	).added;
	expect(copy).toMatch(/^rig-[0-9a-f-]{36}$/);
	expect(saved.projects.get('rig-a')).toEqual(before);
	expect(restored(copy)).toMatchObject({
		id: copy,
		manifest: { name: 'Fixture (Restored)' },
		restoredFrom: { id: 'rig-a', fingerprint: plan.entries[0].fingerprint }
	});

	// What it wears or when it was saved is not an edit; its content is.
	const worn = { ...restored(copy), savedAt: 'later', dress: { current: {} } };
	saved.projects.set(copy, worn);
	expect((await planRestore(source)).entries).toMatchObject([{ action: 'skip', match: copy }]);
	worn.manifest.presets = [];
	saved.projects.set(copy, worn);
	const next = await planRestore(source);
	expect(next.entries).toMatchObject([{ action: 'copy' }]);
	expect(next.warnings).toEqual([{ code: 'editedRestore', id: 'rig-a', copies: [copy] }]);

	// The edited copy keeps its lineage when the original is gone: the file's version is another copy, not the original.
	saved.projects.delete('rig-a');
	const orphan = await planRestore(source);
	expect(orphan.entries).toMatchObject([{ action: 'copy' }]);
	expect(orphan.warnings).toEqual([{ code: 'editedRestore', id: 'rig-a', copies: [copy] }]);
	const [{ id: third }] = (await restoreCharacters(orphan)).added;
	expect([...saved.projects.keys()].filter((id) => id.startsWith('rig-'))).toEqual([
		'rig-dev',
		copy,
		third
	]);
	expect(restored(third).restoredFrom?.id).toBe('rig-a');
});

test('archive downloads can be retained and re-exported byte for byte', async () => {
	saved.projects.set('rig-old', {
		...character,
		id: 'rig-old',
		manifest: { ...character.manifest, format: 'pixeldoll/2' }
	});
	const download = await downloadArchivedBackup([]);
	expect(download).toBeDefined();
	const source = await readRestoreSource(download!);
	expect(source.characters.size).toBe(0);
	expect(source.archives).toHaveLength(1);
	const { data } = source.archives![0];
	expect(data.buffer.byteLength).toBe(data.byteLength);
	saved.projects.delete('rig-old');
	const plan = await planRestore(source);
	const options = { keepArchived: true, keys: [], copyName: (name: string) => name };
	await restoreCharacters(plan, { ...options, keepArchived: false });
	expect((await listArchiveDownloads()).retainedIds).toEqual([]);
	await restoreCharacters(plan, options);
	await restoreCharacters(plan, options);
	expect(saved.projects.has('rig-old')).toBe(false);
	const id = source.archives![0].id;
	expect(await downloadArchivedBackup([], id)).toEqual(download);
	const reexport = await readRestoreSource((await exportBackup([])).bytes);
	expect(reexport.archives).toEqual(source.archives);
});

test('an archive cannot carry a known key disguised as JSON escapes', async () => {
	const key = 'fake-known-key';
	saved.projects.set('rig-old', {
		...character,
		id: 'rig-old',
		manifest: { ...character.manifest, format: 'pixeldoll/2', name: key }
	});
	const files = await unzip((await downloadArchivedBackup([]))!);
	const index = 'incompatible.json';
	const text = new TextDecoder().decode(files.get(index));
	files.set(index, new TextEncoder().encode(text.replace(key, '\\u0066ake-known-key')));
	const escaped = await zip([...files].map(([name, data]) => ({ name, data })));
	await expect(readRestoreSource(escaped, [key])).rejects.toMatchObject({
		translation: { key: 'workspace.error.containsKey' }
	});
});

test('an invalid retained archive does not block downloading another archive', async () => {
	saved.projects.set('rig-old', {
		...character,
		id: 'rig-old',
		manifest: { ...character.manifest, format: 'pixeldoll/2' }
	});
	const download = (await downloadArchivedBackup([]))!;
	const [archive] = (await readRestoreSource(download)).archives!;
	const damaged = `library-archive:${'0'.repeat(64)}`;
	saved.projects.set(damaged, { ...archive, id: damaged });
	saved.projects.set(archive.id, archive);
	expect(await listArchiveDownloads()).toEqual({
		localCount: 1,
		retainedIds: [damaged, archive.id]
	});
	await expect(downloadArchivedBackup([], damaged)).rejects.toMatchObject({
		translation: { key: 'incompatible.error.invalid' }
	});
	await expect(downloadArchivedBackup([], archive.id)).resolves.toEqual(download);
});

test('identical characters under different IDs are separate characters', async () => {
	saved.projects.set('rig-clone', { ...structuredClone(character), id: 'rig-clone' });
	const source = await readRestoreSource(await backup());
	expect((await planRestore(source)).entries).toMatchObject([
		{ id: 'rig-a', action: 'skip', match: 'rig-a' },
		{ id: 'rig-clone', action: 'skip', match: 'rig-clone' }
	]);

	saved.projects.delete('rig-clone');
	const plan = await planRestore(source);
	expect(plan.entries).toMatchObject([
		{ id: 'rig-a', action: 'skip' },
		{ id: 'rig-clone', action: 'add' }
	]);
	expect(plan.entries[0].fingerprint).toBe(plan.entries[1].fingerprint);
	expect((await restoreCharacters(plan)).added).toEqual([{ from: 'rig-clone', id: 'rig-clone' }]);

	saved.projects = new Map();
	saved.blobs = new Map();
	expect((await restoreCharacters(await planRestore(source))).added).toEqual([
		{ from: 'rig-a', id: 'rig-a' },
		{ from: 'rig-clone', id: 'rig-clone' }
	]);
});

test('a character missing artwork is a blocker that stops the restore', async () => {
	const second = structuredClone(character);
	second.id = 'rig-b';
	second.manifest.items = second.manifest.items.filter(({ slot }) => slot === 'body');
	second.manifest.presets = [{ id: 'default', name: 'Default', items: {}, variants: {} }];
	second.manifest.materials = second.manifest.materials.filter(({ owner }) => owner === 'base');
	saved.projects.set('rig-b', second);
	const hat = character.manifest.items.find(({ id }) => id === 'hat')!.layers[0].cells!.rest!
		.south![0]!;
	saved.blobs.delete(hat.slice(7));
	const file = await exportBackup([]);
	expect(file).toMatchObject({ characters: 2, hasOmissions: true });

	saved.projects = new Map();
	saved.blobs = new Map();
	const plan = await planRestore(await readRestoreSource(file.bytes));
	expect(plan.entries).toMatchObject([
		{ id: 'rig-a', action: 'blocked' },
		{ id: 'rig-b', action: 'add' }
	]);
	expect(plan.blockers).toEqual([{ code: 'missingArtwork', id: 'rig-a', count: 1 }]);
	await expect(restoreCharacters(plan)).rejects.toThrow('blockers');
	expect(saved.projects.size).toBe(0);
	expect(saved.blobs.size).toBe(0);
});

test('a restore writes nothing and refreshes its preview when saved characters change first', async () => {
	const source = await readRestoreSource(await backup());
	saved.projects = new Map();
	saved.blobs = new Map();
	const plan = await planRestore(source);
	expect(plan.entries).toMatchObject([{ action: 'add' }]);
	saved.meanwhile = () =>
		saved.projects.set('rig-a', {
			...character,
			manifest: { ...character.manifest, name: 'Other tab' }
		});
	const changed = await restoreCharacters(plan).catch((error: unknown) => error);
	expect(changed).toBeInstanceOf(RestoreChangedError);
	expect((changed as RestoreChangedError).plan.entries).toMatchObject([{ action: 'copy' }]);
	expect([...saved.projects.keys()]).toEqual(['rig-a']);
	expect(saved.blobs.size).toBe(0);
});

test('a failed restore adds no character and no artwork', async () => {
	const source = await readRestoreSource(await backup());
	saved.projects = new Map();
	saved.blobs = new Map();
	saved.failure = new DOMException('The disk is full', 'QuotaExceededError');
	await expect(restoreCharacters(await planRestore(source))).rejects.toThrow('The disk is full');
	expect(saved.projects.size).toBe(0);
	expect(saved.blobs.size).toBe(0);
});

test('a workspace ZIP restores only its characters, and a key in a saved field blocks a backup', async () => {
	const view = {
		project: 'rig-a',
		item: '',
		move: '',
		direction: 'south',
		frame: 0,
		screen: 'studio',
		mode: 'preview',
		tab: 'wardrobe',
		theme: 'light'
	} as const;
	const source = await readRestoreSource((await exportWorkspace(view, undefined, [])).bytes);
	expect(source.kind).toBe('workspace');
	expect([...source.characters.keys()]).toEqual(['rig-a']);
	expect((await planRestore(source)).entries).toMatchObject([{ action: 'skip', match: 'rig-a' }]);

	saved.projects.set('rig-a', {
		...character,
		manifest: { ...character.manifest, name: 'secret-key' }
	});
	await expect(backup()).rejects.toThrow('PixelLab key');
});
