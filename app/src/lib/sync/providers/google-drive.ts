// Google Drive adapter (scope drive.file): the cloud copy is a visible "PixelDoll" folder in the user's My Drive, found by
// an app property rather than its name so a rename or move keeps working. Drive addresses files by id and allows
// duplicate names, so paths are resolved through folder lookups and cached for the life of the adapter.
import { authorized, browserTransport, expectOk, type Classify, type Transport } from './http.ts';
import { SyncError, type Entry, type Provider, type TokenSource } from './types.ts';

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
const ROOT_QUERY = `appProperties has { key='pixeldollSync' and value='root' } and mimeType = '${FOLDER}' and trashed = false`;
/** Drive documents multipart uploads for files of 5 MB or less and resumable sessions above that. */
const MULTIPART_MAX = 5 * 1024 * 1024;
const FILE_FIELDS = 'id,name,size,md5Checksum,version,modifiedTime,createdTime';

interface DriveFile {
	id: string;
	name?: string;
	size?: string;
	md5Checksum?: string;
	version?: string;
	modifiedTime?: string;
	createdTime?: string;
}
interface Cached {
	id: string;
	size: number;
	etag: string;
}

/** The root folder this adapter was using is gone (trashed or deleted by the user). The engine asks before rebuilding
 *  instead of reading the empty folder as "everything was deleted"; the adapter has already forgotten the root, so the
 *  next call creates a fresh one. */
export class RootMissingError extends SyncError {
	constructor() {
		super('missing', 'The PixelDoll folder in Google Drive was deleted or moved to the trash.');
		this.name = 'RootMissingError';
	}
}

async function reasons(response: Response) {
	const body = (await response.json().catch(() => null)) as {
		error?: { errors?: { reason?: string }[] };
	} | null;
	return body?.error?.errors?.map((error) => error.reason ?? '') ?? [];
}
const RATE_LIMITED = ['rateLimitExceeded', 'userRateLimitExceeded'];
const FULL = ['storageQuotaExceeded', 'quotaExceeded'];

// Drive reports rate limits as 403 as well as 429, which the shared rules would not retry.
const classify: Classify = async (response) => {
	if (response.status !== 403 && response.status !== 429) return undefined;
	return (await reasons(response)).some((reason) => RATE_LIMITED.includes(reason))
		? 'retry'
		: undefined;
};
const classifyUpload: Classify = async (response) => {
	if (response.status !== 403 && response.status !== 429) return undefined;
	const found = await reasons(response);
	if (found.some((reason) => FULL.includes(reason)))
		return new SyncError('cloud-full', 'Your Google Drive storage is full.');
	return found.some((reason) => RATE_LIMITED.includes(reason)) ? 'retry' : undefined;
};

const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** Two devices can create the same folder at once; every device settles on the oldest so they share one. */
function oldest(files: DriveFile[]) {
	return files.toSorted(
		(a, b) => (a.createdTime ?? '').localeCompare(b.createdTime ?? '') || a.id.localeCompare(b.id)
	)[0];
}

/** Files rewritten in place by one device; a duplicate left by a lost race is stale, so the newest wins. Every other
 *  file is named by its content, so any duplicate is as good as another. */
const mutable = (path: string) => path === 'pixeldoll-sync.json' || path.startsWith('devices/');
function pick(files: DriveFile[], path: string) {
	if (!mutable(path)) return files[0];
	return files.toSorted((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''))[0];
}

const cached = (file: DriveFile, size = Number(file.size ?? 0)): Cached => ({
	id: file.id,
	size,
	etag: file.md5Checksum ?? file.version ?? ''
});

function split(path: string) {
	const cut = path.lastIndexOf('/');
	return { dir: cut < 0 ? '' : path.slice(0, cut), name: path.slice(cut + 1) };
}

export class GoogleDrive implements Provider {
	readonly kind = 'google' as const;
	private rootId: string | undefined;
	/** Folder path ("objects", "revs/rig-x") to id. */
	private folders = new Map<string, string>();
	private files = new Map<string, Cached>();

	constructor(
		private token: TokenSource,
		private transport: Transport = browserTransport
	) {}

	private request(url: string, init: RequestInit = {}, own: Classify = classify) {
		return authorized(url, init, this.token, this.transport, own);
	}

	private async query(q: string, fields = FILE_FIELDS) {
		const out: DriveFile[] = [];
		let pageToken: string | undefined;
		do {
			const params = new URLSearchParams({
				q,
				pageSize: '1000',
				fields: `nextPageToken,files(${fields})`
			});
			if (pageToken) params.set('pageToken', pageToken);
			const response = await expectOk(
				await this.request(`${FILES}?${params}`),
				'Listing Google Drive'
			);
			const page = (await response.json()) as { files: DriveFile[]; nextPageToken?: string };
			out.push(...page.files);
			pageToken = page.nextPageToken;
		} while (pageToken);
		return out;
	}

	/** The oldest folder matching `q`, created by `create` when there is none (and `create` is given). */
	private async settle(q: string, create?: () => Promise<void>) {
		const found = oldest(await this.query(q, 'id,createdTime'));
		if (found || !create) return found?.id;
		await create();
		// Re-read instead of using the new id: a device that created one at the same moment adopts the same oldest.
		return oldest(await this.query(q, 'id,createdTime'))?.id;
	}

	private async createFolder(body: {
		name: string;
		parents?: string[];
		appProperties?: Record<string, string>;
	}) {
		const response = await this.request(`${FILES}?fields=id`, {
			method: 'POST',
			headers: { 'content-type': 'application/json; charset=UTF-8' },
			body: JSON.stringify({ ...body, mimeType: FOLDER })
		});
		await expectOk(response, 'Creating a Google Drive folder');
	}

	private async root(create: boolean) {
		this.rootId ??= await this.settle(
			ROOT_QUERY,
			create
				? () => this.createFolder({ name: 'PixelDoll', appProperties: { pixeldollSync: 'root' } })
				: undefined
		);
		return this.rootId;
	}

	private async folder(dir: string, create: boolean) {
		let id = await this.root(create);
		let path = '';
		for (const name of dir ? dir.split('/') : []) {
			if (!id) return undefined;
			path = path ? `${path}/${name}` : name;
			const known = this.folders.get(path);
			if (known) {
				id = known;
				continue;
			}
			const parent = id;
			id = await this.settle(
				`name = ${quote(name)} and ${quote(parent)} in parents and mimeType = '${FOLDER}' and trashed = false`,
				create ? () => this.createFolder({ name, parents: [parent] }) : undefined
			);
			if (id) this.folders.set(path, id);
		}
		return id;
	}

	private forget() {
		this.rootId = undefined;
		this.folders.clear();
		this.files.clear();
	}

	/** An empty or missing answer under a root this adapter already used may mean the user trashed the whole folder
	 *  (its children then leave every listing); tell that apart from real deletes. */
	private async checkRoot() {
		const id = this.rootId;
		if (!id) return;
		const response = await this.request(`${FILES}/${id}?fields=trashed`);
		let gone = response.status === 404;
		if (gone) await response.body?.cancel();
		else
			gone =
				((await (await expectOk(response, 'Reading Google Drive')).json()) as { trashed?: boolean })
					.trashed === true;
		if (gone) {
			this.forget();
			throw new RootMissingError();
		}
	}

	private async lookup(path: string) {
		const { dir, name } = split(path);
		const parent = await this.folder(dir, false);
		if (!parent) return [];
		return this.query(
			`name = ${quote(name)} and ${quote(parent)} in parents and mimeType != '${FOLDER}' and trashed = false`
		);
	}

	async list(prefix: string) {
		const dir = prefix.slice(0, -1);
		const parent = await this.folder(dir, false);
		const out: Entry[] = [];
		if (parent) {
			const groups = new Map<string, DriveFile[]>();
			for (const file of await this.query(
				`${quote(parent)} in parents and mimeType != '${FOLDER}' and trashed = false`
			))
				groups.set(file.name ?? '', [...(groups.get(file.name ?? '') ?? []), file]);
			for (const path of this.files.keys()) if (split(path).dir === dir) this.files.delete(path);
			for (const [name, group] of groups) {
				const path = prefix + name;
				const file = cached(pick(group, path));
				this.files.set(path, file);
				out.push({ path, size: file.size, etag: file.etag });
			}
		}
		if (!out.length) await this.checkRoot();
		return out;
	}

	/** The file's content, or null when Drive no longer has that id. */
	private async download(id: string) {
		const response = await this.request(`${FILES}/${id}?alt=media`);
		if (response.status === 404) {
			await response.body?.cancel();
			return null;
		}
		return new Uint8Array(
			await (await expectOk(response, 'Downloading from Google Drive')).arrayBuffer()
		);
	}

	async get(path: string) {
		const known = this.files.get(path);
		if (known) {
			const bytes = await this.download(known.id);
			if (bytes) return bytes;
			this.files.delete(path);
		}
		const match = pick(await this.lookup(path), path);
		const bytes = match ? await this.download(match.id) : null;
		if (!match || !bytes) {
			await this.checkRoot();
			return null;
		}
		this.files.set(path, cached(match));
		return bytes;
	}

	/** Create a file (with `metadata`) or replace file `id`'s content; null when `id` no longer exists. */
	private async upload(bytes: Uint8Array, id: string | undefined, metadata: object) {
		const target = `${id ? `${UPLOAD}/${id}` : UPLOAD}?fields=${FILE_FIELDS}`;
		const method = id ? 'PATCH' : 'POST';
		const body = bytes as Uint8Array<ArrayBuffer>;
		let response: Response;
		if (bytes.length <= MULTIPART_MAX) {
			const boundary = `pixeldoll-${crypto.randomUUID()}`;
			response = await this.request(
				`${target}&uploadType=multipart`,
				{
					method,
					headers: { 'content-type': `multipart/related; boundary=${boundary}` },
					body: new Blob([
						`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
						`--${boundary}\r\ncontent-type: application/octet-stream\r\n\r\n`,
						body,
						`\r\n--${boundary}--`
					])
				},
				classifyUpload
			);
		} else {
			const start = await this.request(
				`${target}&uploadType=resumable`,
				{
					method,
					headers: {
						'content-type': 'application/json; charset=UTF-8',
						'x-upload-content-type': 'application/octet-stream',
						'x-upload-content-length': String(bytes.length)
					},
					body: JSON.stringify(metadata)
				},
				classifyUpload
			);
			if (id && start.status === 404) {
				await start.body?.cancel();
				return null;
			}
			await expectOk(start, 'Starting a Google Drive upload');
			const session = start.headers.get('location');
			if (!session) throw new SyncError('failed', 'Google Drive did not return an upload session.');
			response = await this.request(session, { method: 'PUT', body }, classifyUpload);
		}
		if (id && response.status === 404) {
			await response.body?.cancel();
			return null;
		}
		return (await (await expectOk(response, 'Uploading to Google Drive')).json()) as DriveFile;
	}

	async put(path: string, bytes: Uint8Array) {
		let id = this.files.get(path)?.id;
		// A file another device may have written is looked up first, so it is replaced rather than duplicated.
		if (!id && mutable(path)) id = pick(await this.lookup(path), path)?.id;
		let file = id ? await this.upload(bytes, id, {}) : null;
		if (!file) {
			const { dir, name } = split(path);
			const parent = await this.folder(dir, true);
			if (!parent) throw new SyncError('failed', 'The Google Drive folder could not be created.');
			file = (await this.upload(bytes, undefined, { name, parents: [parent] })) as DriveFile;
		}
		const entry = cached(file, bytes.length);
		this.files.set(path, entry);
		return { path, size: entry.size, etag: entry.etag };
	}

	private async remove(id: string) {
		const response = await this.request(`${FILES}/${id}`, { method: 'DELETE' });
		if (response.status === 404) await response.body?.cancel();
		else await expectOk(response, 'Deleting from Google Drive');
	}

	async del(path: string) {
		const known = this.files.get(path);
		this.files.delete(path);
		for (const id of known ? [known.id] : (await this.lookup(path)).map((file) => file.id))
			await this.remove(id);
	}

	/** files.delete skips the trash for files the user owns and removes the folder's descendants with it. */
	async destroy() {
		const ids = new Set((await this.query(ROOT_QUERY, 'id')).map((file) => file.id));
		if (this.rootId) ids.add(this.rootId);
		this.forget();
		for (const id of ids) await this.remove(id);
	}
}

export async function driveAccount(token: TokenSource, transport: Transport = browserTransport) {
	const response = await authorized(
		'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
		{},
		token,
		transport,
		classify
	);
	const body = (await (await expectOk(response, 'Reading the Google account')).json()) as {
		user?: { emailAddress?: string };
	};
	if (!body.user?.emailAddress)
		throw new SyncError('failed', 'Google did not return the account email.');
	return { email: body.user.emailAddress };
}
