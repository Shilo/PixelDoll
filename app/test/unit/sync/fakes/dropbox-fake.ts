// An in-memory Dropbox app folder as a fetch function: RPC routes with JSON bodies, content routes with the `arg` URL
// parameter, implicit folders, cursor paging with small pages, revs, upload sessions with offset checks, a storage quota
// and the documented 409 error shapes, plus failures injected into the next requests.
import { FakeHttp, json, type Fault } from './drive-fake.ts';

/** files/upload and every upload session request carry at most 150 MiB. */
const MAX_PAYLOAD = 150 * 1024 * 1024;

const conflict = (summary: string, error: unknown) => json(409, { error_summary: summary, error });
const notFound = (route: 'path' | 'path_lookup') =>
	conflict(`${route}/not_found/`, { '.tag': route, [route]: { '.tag': 'not_found' } });

export class DropboxFake extends FakeHttp {
	pageSize = 3;
	quota = Infinity;
	email = 'someone@example.com';
	/** Lowercase "/a/b.json" to content. */
	files = new Map<string, { bytes: Uint8Array; rev: string }>();
	folders = new Set<string>();
	private revs = 0;
	private sessions = new Map<string, Uint8Array[]>();

	used() {
		let size = 0;
		for (const file of this.files.values()) size += file.bytes.length;
		return size;
	}

	private children(folder: string) {
		const inside = (path: string) =>
			path.startsWith(`${folder}/`) && !path.slice(folder.length + 1).includes('/');
		const name = (path: string) => path.slice(folder.length + 1);
		return [
			...[...this.folders]
				.filter(inside)
				.map((path) => ({ '.tag': 'folder', name: name(path), path_lower: path })),
			...[...this.files]
				.filter(([path]) => inside(path))
				.map(([path, file]) => ({
					'.tag': 'file',
					name: name(path),
					path_lower: path,
					size: file.bytes.length,
					rev: file.rev
				}))
		];
	}

	private page(folder: string, offset: number) {
		const all = this.children(folder);
		const end = offset + this.pageSize;
		return json(200, {
			entries: all.slice(offset, end),
			cursor: JSON.stringify({ folder, offset: end }),
			has_more: end < all.length
		});
	}

	private write(path: string, bytes: Uint8Array) {
		const old = this.files.get(path);
		if (this.used() - (old?.bytes.length ?? 0) + bytes.length > this.quota)
			return conflict('path/insufficient_space/', {
				'.tag': 'path',
				path: { reason: { '.tag': 'insufficient_space' }, upload_session_id: '' }
			});
		for (let cut = path.indexOf('/', 1); cut > 0; cut = path.indexOf('/', cut + 1))
			this.folders.add(path.slice(0, cut));
		const rev = `rev${++this.revs}`;
		this.files.set(path, { bytes, rev });
		return json(200, {
			name: path.slice(path.lastIndexOf('/') + 1),
			path_lower: path,
			size: bytes.length,
			rev
		});
	}

	fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = new URL(String(input));
		const fault: Fault | undefined = this.record(url.href, init);
		if (fault) {
			const tag = fault.reason ?? (fault.status === 429 ? 'too_many_requests' : 'other');
			return json(fault.status, { error_summary: `${tag}/`, error: { '.tag': tag } });
		}
		const route = url.pathname.slice('/2/'.length);
		const body = new Uint8Array(await new Response(init?.body ?? null).arrayBuffer());
		const content = url.hostname === 'content.dropboxapi.com';
		if (content && body.length > MAX_PAYLOAD)
			return conflict('payload_too_large/', { '.tag': 'payload_too_large' });
		const raw = content
			? url.searchParams.get('arg')
			: body.length
				? new TextDecoder().decode(body)
				: null;
		const arg = raw ? JSON.parse(raw) : {};
		const path = typeof arg.path === 'string' ? arg.path.toLowerCase() : '';

		switch (route) {
			case 'users/get_current_account':
				return json(200, { email: this.email });
			case 'files/list_folder':
				if (path && !this.folders.has(path)) return notFound('path');
				return this.page(path, 0);
			case 'files/list_folder/continue': {
				const cursor = JSON.parse(arg.cursor) as { folder: string; offset: number };
				return this.page(cursor.folder, cursor.offset);
			}
			case 'files/download': {
				const file = this.files.get(path);
				if (!file) return notFound('path');
				return new Response(file.bytes.slice(), {
					headers: { 'dropbox-api-result': JSON.stringify({ path_lower: path, rev: file.rev }) }
				});
			}
			case 'files/upload':
				return this.write(arg.path.toLowerCase(), body);
			case 'files/upload_session/start': {
				const id = `session${this.sessions.size + 1}`;
				this.sessions.set(id, [body]);
				return json(200, { session_id: id });
			}
			case 'files/upload_session/append_v2':
			case 'files/upload_session/finish': {
				const chunks = this.sessions.get(arg.cursor.session_id);
				if (!chunks) return conflict('lookup_failed/not_found/', { '.tag': 'lookup_failed' });
				const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
				if (arg.cursor.offset !== length)
					return conflict('incorrect_offset/', {
						'.tag': 'incorrect_offset',
						correct_offset: length
					});
				chunks.push(body);
				if (route.endsWith('append_v2')) return json(200, null);
				const all = new Uint8Array(length + body.length);
				let at = 0;
				for (const chunk of chunks) all.set(chunk, (at += chunk.length) - chunk.length);
				return this.write(arg.commit.path.toLowerCase(), all);
			}
			case 'files/delete_v2': {
				const folder = this.folders.has(path);
				if (!folder && !this.files.has(path)) return notFound('path_lookup');
				for (const key of [...this.files.keys(), ...this.folders])
					if (key === path || key.startsWith(`${path}/`)) {
						this.files.delete(key);
						this.folders.delete(key);
					}
				return json(200, { metadata: { '.tag': folder ? 'folder' : 'file', path_lower: path } });
			}
		}
		throw new Error(`Unexpected Dropbox request: ${route}`);
	};
}
