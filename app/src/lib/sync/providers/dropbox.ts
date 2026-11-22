// Dropbox adapter (App folder access): the app folder is the root, so a path maps to "/<path>" and Dropbox creates
// missing folders on upload. Content calls pass their argument in the `arg` URL parameter, which Dropbox documents for
// browsers and which sidesteps the header's escaping rules; the Authorization header still makes every call preflighted.
import { authorized, browserTransport, expectOk, type Classify, type Transport } from './http.ts';
import { SyncError, type Entry, type Provider, type TokenSource } from './types.ts';

const RPC = 'https://api.dropboxapi.com/2/';
const CONTENT = 'https://content.dropboxapi.com/2/';
/** files/upload accepts up to 150 MiB; larger files go through an upload session in chunks this size so one failed
 *  request never resends much. */
const CHUNK = 8 * 1024 * 1024;

interface Metadata {
	'.tag': 'file' | 'folder' | 'deleted';
	name: string;
	size?: number;
	rev?: string;
}

/** Every `.tag` in a Dropbox error, e.g. {path: {reason: {.tag: insufficient_space}}}; the nesting differs per route. */
function tags(value: unknown, out = new Set<string>()) {
	if (value && typeof value === 'object')
		for (const [key, inner] of Object.entries(value))
			if (key === '.tag' && typeof inner === 'string') out.add(inner);
			else tags(inner, out);
	return out;
}
async function errorTags(response: Response) {
	if (response.status !== 409) return new Set<string>();
	const body = (await response
		.clone()
		.json()
		.catch(() => null)) as { error?: unknown } | null;
	return tags(body?.error);
}

const classify: Classify = async (response) => {
	const found = await errorTags(response);
	if (found.has('insufficient_space')) return new SyncError('cloud-full', 'Your Dropbox is full.');
	return found.has('too_many_write_operations') ? 'retry' : undefined;
};

/** A 409 path/not_found (or path_lookup/not_found): the file or folder does not exist. */
async function missing(response: Response) {
	if (!(await errorTags(response)).has('not_found')) return false;
	await response.body?.cancel();
	return true;
}

export class Dropbox implements Provider {
	readonly kind = 'dropbox' as const;

	constructor(
		private token: TokenSource,
		private transport: Transport = browserTransport
	) {}

	private rpc(route: string, arg: object) {
		return authorized(
			RPC + route,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(arg)
			},
			this.token,
			this.transport,
			classify
		);
	}

	private content(route: string, arg: object, bytes?: Uint8Array) {
		return authorized(
			`${CONTENT}${route}?arg=${encodeURIComponent(JSON.stringify(arg))}`,
			bytes
				? {
						method: 'POST',
						headers: { 'content-type': 'application/octet-stream' },
						body: bytes as Uint8Array<ArrayBuffer>
					}
				: { method: 'POST' },
			this.token,
			this.transport,
			classify
		);
	}

	/** Every entry directly in `folder` ("" for the root), every page; null when the folder does not exist. */
	private async entries(folder: string) {
		const out: Metadata[] = [];
		let response = await this.rpc('files/list_folder', { path: folder, recursive: false });
		if (await missing(response)) return null;
		for (;;) {
			const page = (await (await expectOk(response, 'Listing Dropbox')).json()) as {
				entries: Metadata[];
				cursor: string;
				has_more: boolean;
			};
			out.push(...page.entries);
			if (!page.has_more) return out;
			response = await this.rpc('files/list_folder/continue', { cursor: page.cursor });
		}
	}

	async list(prefix: string) {
		const out: Entry[] = [];
		for (const entry of (await this.entries(prefix ? `/${prefix.slice(0, -1)}` : '')) ?? [])
			if (entry['.tag'] === 'file')
				out.push({ path: prefix + entry.name, size: entry.size ?? 0, etag: entry.rev ?? '' });
		return out;
	}

	async get(path: string) {
		const response = await this.content('files/download', { path: `/${path}` });
		if (await missing(response)) return null;
		return new Uint8Array(
			await (await expectOk(response, 'Downloading from Dropbox')).arrayBuffer()
		);
	}

	async put(path: string, bytes: Uint8Array) {
		const commit = { path: `/${path}`, mode: 'overwrite', mute: true };
		let response: Response;
		if (bytes.length <= CHUNK) response = await this.content('files/upload', commit, bytes);
		else {
			const start = await this.content('files/upload_session/start', {}, bytes.subarray(0, CHUNK));
			const { session_id } = (await (
				await expectOk(start, 'Starting a Dropbox upload')
			).json()) as {
				session_id: string;
			};
			let offset = CHUNK;
			for (; offset + CHUNK < bytes.length; offset += CHUNK) {
				const append = await this.content(
					'files/upload_session/append_v2',
					{ cursor: { session_id, offset } },
					bytes.subarray(offset, offset + CHUNK)
				);
				await expectOk(append, 'Uploading to Dropbox');
				await append.body?.cancel();
			}
			response = await this.content(
				'files/upload_session/finish',
				{ cursor: { session_id, offset }, commit },
				bytes.subarray(offset)
			);
		}
		const file = (await (await expectOk(response, 'Uploading to Dropbox')).json()) as Metadata;
		return { path, size: bytes.length, etag: file.rev ?? '' };
	}

	async del(path: string) {
		const response = await this.rpc('files/delete_v2', { path: `/${path}` });
		if (await missing(response)) return;
		await (await expectOk(response, 'Deleting from Dropbox')).body?.cancel();
	}

	/** The app folder itself cannot be deleted, so the cloud copy is everything in it. */
	async destroy() {
		for (const entry of (await this.entries('')) ?? []) await this.del(entry.name);
	}
}

export async function dropboxAccount(token: TokenSource, transport: Transport = browserTransport) {
	const response = await authorized(
		`${RPC}users/get_current_account`,
		{ method: 'POST' },
		token,
		transport,
		classify
	);
	const body = (await (await expectOk(response, 'Reading the Dropbox account')).json()) as {
		email?: string;
	};
	if (!body.email) throw new SyncError('failed', 'Dropbox did not return the account email.');
	return { email: body.email };
}
