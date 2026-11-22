// An in-memory Google Drive v3 as a fetch function: files and folders by id with parents, appProperties, the query
// clauses the adapter sends, small pages, md5Checksum and version, a storage quota, trash, duplicate names, multipart
// and resumable uploads, plus failures injected into the next requests.
import { createHash } from 'node:crypto';

export interface Fault {
	status: number;
	/** Drive error reason or Dropbox error tag. */
	reason?: string;
}

export const json = (status: number, value: unknown, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(value), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});

/** What both fakes share: injected failures and a log of every request with its Authorization header. */
export class FakeHttp {
	faults: Fault[] = [];
	auth: string[] = [];
	requests: string[] = [];
	protected record(url: string, init: RequestInit | undefined) {
		this.auth.push(new Headers(init?.headers).get('authorization') ?? '');
		this.requests.push(`${init?.method ?? 'GET'} ${url}`);
		return this.faults.shift();
	}
}

const FOLDER = 'application/vnd.google-apps.folder';

interface Node {
	id: string;
	name: string;
	mimeType: string;
	parents: string[];
	appProperties: Record<string, string>;
	bytes?: Uint8Array;
	version: number;
	createdTime: string;
	modifiedTime: string;
	trashed: boolean;
}

const notFound = () => json(404, { error: { code: 404, errors: [{ reason: 'notFound' }] } });
const unquote = (value: string) => value.replace(/\\(.)/g, '$1');
const CLAUSE =
	/appProperties has \{ key='([^']*)' and value='([^']*)' \}|'([^']*)' in parents|trashed = (true|false)|mimeType (!?=) '([^']*)'|name = '((?:[^'\\]|\\.)*)'/g;

function matches(q: string, node: Node) {
	if (
		q
			.replace(CLAUSE, '')
			.replace(/\band\b/g, '')
			.trim()
	)
		throw new Error(`Unsupported Drive query: ${q}`);
	for (const [, key, value, parent, trashed, op, mime, name] of q.matchAll(CLAUSE)) {
		if (key !== undefined && node.appProperties[key] !== value) return false;
		if (parent !== undefined && !node.parents.includes(parent)) return false;
		if (trashed !== undefined && node.trashed !== (trashed === 'true')) return false;
		if (op !== undefined && (node.mimeType === mime) !== (op === '=')) return false;
		if (name !== undefined && node.name !== unquote(name)) return false;
	}
	return true;
}

export class DriveFake extends FakeHttp {
	pageSize = 3;
	quota = Infinity;
	email = 'someone@example.com';
	nodes = new Map<string, Node>();
	private clock = 0;
	private ids = 0;
	private sessions = new Map<string, { id?: string; metadata: Partial<Node> }>();

	private now() {
		return new Date(Date.UTC(2026, 0, 1) + ++this.clock * 1000).toISOString();
	}

	create(fields: Partial<Node> & { name: string }): Node {
		const time = this.now();
		const node: Node = {
			id: `id${++this.ids}`,
			mimeType: 'application/octet-stream',
			parents: ['root'],
			appProperties: {},
			version: 1,
			createdTime: time,
			modifiedTime: time,
			trashed: false,
			...fields
		};
		this.nodes.set(node.id, node);
		return node;
	}

	root() {
		return this.create({
			name: 'PixelDoll',
			mimeType: FOLDER,
			appProperties: { pixeldollSync: 'root' }
		});
	}

	private descendants(id: string): Node[] {
		const own = [...this.nodes.values()].filter((node) => node.parents.includes(id));
		return own.flatMap((node) => [node, ...this.descendants(node.id)]);
	}

	trash(id: string) {
		for (const node of [this.nodes.get(id)!, ...this.descendants(id)]) node.trashed = true;
	}

	remove(id: string) {
		for (const node of this.descendants(id)) this.nodes.delete(node.id);
		this.nodes.delete(id);
	}

	used() {
		let size = 0;
		for (const node of this.nodes.values()) size += node.bytes?.length ?? 0;
		return size;
	}

	private resource(node: Node) {
		const { bytes, version, ...rest } = node;
		return {
			...rest,
			version: String(version),
			...(bytes && {
				size: String(bytes.length),
				md5Checksum: createHash('md5').update(bytes).digest('hex')
			})
		};
	}

	/** Create a file or replace `id`'s content, as an upload's final request does. */
	private commit(id: string | undefined, metadata: Partial<Node>, bytes: Uint8Array) {
		const old = id ? this.nodes.get(id) : undefined;
		if (id && !old) return notFound();
		if (this.used() - (old?.bytes?.length ?? 0) + bytes.length > this.quota)
			return json(403, { error: { code: 403, errors: [{ reason: 'storageQuotaExceeded' }] } });
		if (old) Object.assign(old, { bytes, version: old.version + 1, modifiedTime: this.now() });
		const node =
			old ?? this.create({ name: metadata.name ?? 'Untitled', parents: metadata.parents, bytes });
		return json(200, this.resource(node));
	}

	fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = new URL(String(input));
		const fault = this.record(url.href, init);
		if (fault) {
			const reason = fault.reason ?? (fault.status === 401 ? 'authError' : 'backendError');
			return json(fault.status, { error: { code: fault.status, errors: [{ reason }] } });
		}
		const method = init?.method ?? 'GET';
		const body = new Uint8Array(await new Response(init?.body ?? null).arrayBuffer());
		const upload = url.pathname.startsWith('/upload/');
		const id = url.pathname.split('/')[upload ? 5 : 4];
		const type = url.searchParams.get('uploadType');

		if (url.pathname === '/drive/v3/about')
			return json(200, { user: { emailAddress: this.email } });
		if (!upload && !id && method === 'GET') {
			const q = url.searchParams.get('q') ?? '';
			const all = [...this.nodes.values()].filter((node) => matches(q, node));
			const start = Number(url.searchParams.get('pageToken') ?? 0);
			const size = Math.min(this.pageSize, Number(url.searchParams.get('pageSize') ?? 100));
			const next = start + size < all.length ? String(start + size) : undefined;
			return json(200, {
				files: all.slice(start, start + size).map((node) => this.resource(node)),
				...(next && { nextPageToken: next })
			});
		}
		if (!upload && !id && method === 'POST') {
			const metadata = JSON.parse(new TextDecoder().decode(body)) as Partial<Node> & {
				name: string;
			};
			return json(200, this.resource(this.create(metadata)));
		}
		if (!upload && id) {
			const node = this.nodes.get(id);
			if (!node) return notFound();
			if (method === 'DELETE') {
				this.remove(id);
				return new Response(null, { status: 204 });
			}
			if (url.searchParams.get('alt') === 'media') return new Response(node.bytes?.slice() ?? null);
			return json(200, this.resource(node));
		}
		if (upload && method === 'PUT') {
			const session = this.sessions.get(url.searchParams.get('upload_id') ?? '');
			if (!session) return notFound();
			return this.commit(session.id, session.metadata, body);
		}
		if (upload && type === 'resumable') {
			if (id && !this.nodes.has(id)) return notFound();
			const key = String(this.sessions.size + 1);
			this.sessions.set(key, { id, metadata: JSON.parse(new TextDecoder().decode(body)) });
			const session = new URL(url);
			session.searchParams.set('upload_id', key);
			return new Response(null, { status: 200, headers: { location: session.href } });
		}
		if (upload && type === 'multipart') {
			const boundary = /boundary=(\S+)/.exec(
				new Headers(init?.headers).get('content-type') ?? ''
			)![1];
			const [, meta, media] = Buffer.from(body).toString('latin1').split(`--${boundary}`);
			const content = (part: string) => part.slice(part.indexOf('\r\n\r\n') + 4, -2);
			return this.commit(
				id,
				JSON.parse(content(meta)),
				new Uint8Array(Buffer.from(content(media), 'latin1'))
			);
		}
		throw new Error(`Unexpected Drive request: ${method} ${url.href}`);
	};
}
