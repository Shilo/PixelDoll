// One contract for every cloud the sync engine talks to: the in-memory SimProvider and each real adapter against a fake
// of its service, so an adapter that passes behaves like the simulation the engine is tested on.
import { describe, expect, it } from 'vitest';
import { Dropbox } from '../../../src/lib/sync/providers/dropbox.ts';
import { GoogleDrive, RootMissingError } from '../../../src/lib/sync/providers/google-drive.ts';
import { SimProvider } from '../../../src/lib/sync/providers/sim.ts';
import {
	SyncError,
	type Provider,
	type TokenSource
} from '../../../src/lib/sync/providers/types.ts';
import { DriveFake } from './fakes/drive-fake.ts';
import { DropboxFake } from './fakes/dropbox-fake.ts';

const MB = 1024 * 1024;

interface Harness {
	provider: Provider;
	/** Token refresh flags in call order. */
	tokens: boolean[];
	fake?: DriveFake | DropboxFake;
	setQuota(bytes: number): void;
}

function tokenSource(calls: boolean[]): TokenSource {
	let n = 0;
	return async (refresh = false) => {
		calls.push(refresh);
		if (refresh) n++;
		return `t${n}`;
	};
}

const cases = [
	{
		name: 'sim',
		large: 6 * MB,
		largeRoute: '',
		make(): Harness {
			const provider = new SimProvider();
			return { provider, tokens: [], setQuota: (bytes) => (provider.quota = bytes) };
		}
	},
	{
		name: 'google',
		large: 5 * MB + 1,
		largeRoute: 'uploadType=resumable',
		make(): Harness {
			const fake = new DriveFake();
			const tokens: boolean[] = [];
			const provider = new GoogleDrive(tokenSource(tokens), {
				fetch: fake.fetch,
				sleep: async () => {}
			});
			return { provider, tokens, fake, setQuota: (bytes) => (fake.quota = bytes) };
		}
	},
	{
		name: 'dropbox',
		large: 17 * MB,
		largeRoute: 'upload_session/append_v2',
		make(): Harness {
			const fake = new DropboxFake();
			const tokens: boolean[] = [];
			const provider = new Dropbox(tokenSource(tokens), {
				fetch: fake.fetch,
				sleep: async () => {}
			});
			return { provider, tokens, fake, setQuota: (bytes) => (fake.quota = bytes) };
		}
	}
];

function bytes(length: number, seed = 1) {
	const out = new Uint8Array(length);
	for (let i = 0; i < length; i++) out[i] = (i * 31 + seed * 7) & 0xff;
	return out;
}
const text = (value: string) => new TextEncoder().encode(value);
const paths = async (provider: Provider, prefix: string) =>
	(await provider.list(prefix)).map((entry) => entry.path).sort();

describe.each(cases)('$name provider', ({ name, large, largeRoute, make }) => {
	const http = name !== 'sim';

	it('round-trips files in the root and nested folders', async () => {
		const { provider } = make();
		const top = await provider.put('pixeldoll-sync.json', text('{"v":1}'));
		expect(top).toMatchObject({ path: 'pixeldoll-sync.json', size: 7 });
		await provider.put('revs/rig-abc/1.r1.root.json.gz', bytes(40));
		expect(await provider.get('pixeldoll-sync.json')).toEqual(text('{"v":1}'));
		expect(await provider.get('revs/rig-abc/1.r1.root.json.gz')).toEqual(bytes(40));
	});

	it('lists a missing folder as empty, before and after the root exists', async () => {
		const { provider } = make();
		expect(await provider.list('')).toEqual([]);
		expect(await provider.list('objects/')).toEqual([]);
		await provider.put('devices/a.json', text('{}'));
		expect(await provider.list('revs/rig-x/')).toEqual([]);
	});

	it('lists every page and only the folder’s own files', async () => {
		const { provider } = make();
		for (let i = 0; i < 7; i++) await provider.put(`objects/${i}.json.gz`, bytes(10, i));
		await provider.put('revs/a.json.gz', bytes(5));
		await provider.put('revs/rig-x/b.json.gz', bytes(5));
		expect(await paths(provider, 'objects/')).toEqual(
			[0, 1, 2, 3, 4, 5, 6].map((i) => `objects/${i}.json.gz`)
		);
		expect(await paths(provider, 'revs/')).toEqual(['revs/a.json.gz']);
		expect(await paths(provider, '')).toEqual([]);
		const [entry] = await provider.list('revs/');
		expect(entry.size).toBe(5);
		expect(entry.etag).not.toBe('');
	});

	it('returns null for a missing file', async () => {
		const { provider } = make();
		expect(await provider.get('objects/none.json.gz')).toBeNull();
		await provider.put('objects/a.json.gz', bytes(3));
		expect(await provider.get('objects/none.json.gz')).toBeNull();
	});

	it('overwrites in place with a new etag', async () => {
		const { provider } = make();
		const first = await provider.put('devices/d.json', text('one'));
		const second = await provider.put('devices/d.json', text('two!'));
		expect(second.etag).not.toBe(first.etag);
		expect(await provider.list('devices/')).toEqual([second]);
		expect(await provider.get('devices/d.json')).toEqual(text('two!'));
	});

	it('deletes files, and a missing file is not an error', async () => {
		const { provider } = make();
		await provider.del('objects/none.json.gz');
		await provider.put('objects/a.json.gz', bytes(3));
		await provider.del('objects/a.json.gz');
		await provider.del('objects/a.json.gz');
		expect(await provider.get('objects/a.json.gz')).toBeNull();
		expect(await provider.list('objects/')).toEqual([]);
	});

	it('destroys the whole cloud copy and can start over', async () => {
		const { provider, fake } = make();
		await provider.put('pixeldoll-sync.json', text('{}'));
		await provider.put('objects/a.json.gz', bytes(3));
		await provider.put('revs/rig-x/1.a.root.json.gz', bytes(3));
		await provider.destroy();
		if (fake instanceof DriveFake) expect(fake.nodes.size).toBe(0);
		if (fake instanceof DropboxFake) expect([fake.files.size, fake.folders.size]).toEqual([0, 0]);
		expect(await provider.list('')).toEqual([]);
		expect(await provider.get('objects/a.json.gz')).toBeNull();
		await provider.put('objects/b.json.gz', bytes(4));
		expect(await provider.get('objects/b.json.gz')).toEqual(bytes(4));
	});

	it('round-trips a large file through the chunked upload', async () => {
		const { provider, fake } = make();
		const data = bytes(large, 9);
		expect((await provider.put('packs/big.zip', data)).size).toBe(large);
		// Deep equality walks megabytes element by element; compare the buffers natively.
		expect(
			Buffer.compare(Buffer.from((await provider.get('packs/big.zip'))!), Buffer.from(data))
		).toBe(0);
		if (fake) expect(fake.requests.some((request) => request.includes(largeRoute))).toBe(true);
	});

	it('reports a full cloud', async () => {
		const { provider, setQuota } = make();
		setQuota(10);
		await expect(provider.put('objects/a.json.gz', bytes(11))).rejects.toMatchObject({
			code: 'cloud-full'
		});
	});

	it.skipIf(!http)('refreshes a rejected token once', async () => {
		const { provider, fake, tokens } = make();
		fake!.faults.push({ status: 401 });
		await provider.put('objects/a.json.gz', bytes(3));
		expect(tokens).toContain(true);
		expect(fake!.auth.at(-1)).toBe('Bearer t1');
		expect(await provider.get('objects/a.json.gz')).toEqual(bytes(3));
	});

	it.skipIf(!http)('asks to reconnect when the refreshed token is rejected too', async () => {
		const { provider, fake } = make();
		fake!.faults.push({ status: 401 }, { status: 401 });
		await expect(provider.list('')).rejects.toMatchObject({ code: 'reconnect' });
	});

	it.skipIf(!http).each([429, 500])('retries a %i', async (status) => {
		const { provider, fake } = make();
		await provider.put('objects/a.json.gz', bytes(3));
		fake!.faults.push({ status });
		expect(await provider.get('objects/a.json.gz')).toEqual(bytes(3));
	});
});

describe('google drive specifics', () => {
	function drive() {
		const fake = new DriveFake();
		const tokens: boolean[] = [];
		const transport = { fetch: fake.fetch, sleep: async () => {} };
		return { fake, open: () => new GoogleDrive(tokenSource(tokens), transport) };
	}

	it('adopts the oldest of two root folders', async () => {
		const { fake, open } = drive();
		const older = fake.root();
		const newer = fake.root();
		fake.create({ name: 'pixeldoll-sync.json', parents: [newer.id], bytes: text('newer') });
		fake.create({ name: 'pixeldoll-sync.json', parents: [older.id], bytes: text('older') });
		expect(await open().get('pixeldoll-sync.json')).toEqual(text('older'));
	});

	it('tolerates duplicate names, preferring the newest for device files', async () => {
		const { fake, open } = drive();
		const root = fake.root();
		const devices = fake.create({
			name: 'devices',
			parents: [root.id],
			mimeType: 'application/vnd.google-apps.folder'
		});
		fake.create({ name: 'd.json', parents: [devices.id], bytes: text('old') });
		fake.create({ name: 'd.json', parents: [devices.id], bytes: text('new') });
		const objects = fake.create({
			name: 'objects',
			parents: [root.id],
			mimeType: 'application/vnd.google-apps.folder'
		});
		fake.create({ name: 'a.json.gz', parents: [objects.id], bytes: text('same') });
		fake.create({ name: 'a.json.gz', parents: [objects.id], bytes: text('same') });
		const provider = open();
		expect(await provider.get('devices/d.json')).toEqual(text('new'));
		expect(await provider.list('devices/')).toHaveLength(1);
		expect(await provider.list('objects/')).toHaveLength(1);
		expect(await provider.get('objects/a.json.gz')).toEqual(text('same'));
		await provider.put('devices/d.json', text('newest'));
		expect(await open().get('devices/d.json')).toEqual(text('newest'));
	});

	it.each(['trashed', 'deleted'])(
		'reports a root %s after use, then starts a fresh one',
		async (how) => {
			const { fake, open } = drive();
			const provider = open();
			await provider.put('objects/a.json.gz', bytes(3));
			const [root] = [...fake.nodes.values()].filter(
				(node) => node.appProperties.pixeldollSync === 'root'
			);
			if (how === 'trashed') fake.trash(root.id);
			else fake.remove(root.id);
			const error = await provider.list('objects/').catch((caught: unknown) => caught);
			expect(error).toBeInstanceOf(RootMissingError);
			expect(error).toBeInstanceOf(SyncError);
			expect(error).toMatchObject({ code: 'missing' });
			await provider.put('objects/b.json.gz', bytes(4));
			expect(await provider.get('objects/b.json.gz')).toEqual(bytes(4));
			expect(await provider.get('objects/a.json.gz')).toBeNull();
		}
	);

	it('creates a root when only a trashed one exists', async () => {
		const { fake, open } = drive();
		fake.trash(fake.root().id);
		const provider = open();
		expect(await provider.list('')).toEqual([]);
		await provider.put('pixeldoll-sync.json', text('{}'));
		expect(await provider.get('pixeldoll-sync.json')).toEqual(text('{}'));
	});

	it('retries a 403 rate limit', async () => {
		const { fake, open } = drive();
		fake.faults.push({ status: 403, reason: 'userRateLimitExceeded' });
		expect(await open().list('')).toEqual([]);
	});
});
