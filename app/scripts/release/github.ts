export type Deployment = { id: number; sha: string; created_at: string };
export type DeploymentStatus = { state: string; created_at: string; environment_url: string };
export type Release = { id: number; draft: boolean; tag_name: string; upload_url: string };
export type Asset = {
	id: number;
	name: string;
	label: string | null;
	size: number;
	state: string;
	digest: string | null;
	browser_download_url: string;
};
type GitObject = { sha: string; type: string };
type Run = { status: string; event: string };

export class GitHub {
	readonly repository: string;
	readonly #token?: string;

	constructor(repository: string, token?: string) {
		if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid GitHub repository');
		this.repository = repository;
		this.#token = token;
	}

	async #request(
		path: string,
		method = 'GET',
		body?: unknown,
		contentType = 'application/json',
		accept = 'application/vnd.github+json',
		allowMissing = false
	) {
		const url = path.startsWith('https://')
			? new URL(path)
			: new URL(`https://api.github.com/repos/${this.repository}${path}`);
		if (!['api.github.com', 'uploads.github.com'].includes(url.host))
			throw new Error('Unexpected GitHub API host');
		if (method !== 'GET' && !this.#token) throw new Error('GitHub writes require GITHUB_TOKEN');
		const headers = new Headers({ Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' });
		if (this.#token) headers.set('Authorization', `Bearer ${this.#token}`);
		if (body !== undefined) headers.set('Content-Type', contentType);
		const response = await fetch(url, {
			method,
			headers,
			body:
				body === undefined
					? undefined
					: contentType === 'application/json'
						? JSON.stringify(body)
						: (body as Blob),
			signal: AbortSignal.timeout(60_000)
		});
		if (!response.ok && !(allowMissing && response.status === 404))
			throw new Error(
				`GitHub ${method} ${url.pathname}: ${response.status} ${await response.text()}`
			);
		return response;
	}

	async #json<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
		return (await this.#request(path, method, body)).json() as Promise<T>;
	}

	async *#pages<T>(path: string): AsyncGenerator<T> {
		const separator = path.includes('?') ? '&' : '?';
		let next: string | undefined = `${path}${separator}per_page=100`;
		while (next) {
			const response = await this.#request(next);
			yield* (await response.json()) as T[];
			next = response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
		}
	}

	deployments() {
		return this.#pages<Deployment>('/deployments?environment=github-pages');
	}

	deploymentStatuses(id: number) {
		return this.#pages<DeploymentStatus>(`/deployments/${id}/statuses`);
	}

	async tagCommit(tag: string) {
		const response = await this.#request(
			`/git/ref/tags/${tag}`,
			'GET',
			undefined,
			undefined,
			undefined,
			true
		);
		if (response.status === 404) return undefined;
		let { object } = (await response.json()) as { object: GitObject };
		while (object.type === 'tag')
			({ object } = await this.#json<{ object: GitObject }>(`/git/tags/${object.sha}`));
		if (object.type !== 'commit')
			throw new Error(`Tag ${tag} points to a ${object.type}, not a commit`);
		return object.sha;
	}

	async createTag(tag: string, sha: string) {
		await this.#json('/git/refs', 'POST', { ref: `refs/tags/${tag}`, sha });
	}

	async release(tag: string) {
		const response = await this.#request(
			`/releases/tags/${tag}`,
			'GET',
			undefined,
			undefined,
			undefined,
			true
		);
		if (response.ok) return (await response.json()) as Release;
		// The by-tag endpoint may omit a draft. The authenticated list includes drafts.
		for await (const item of this.#pages<Release>('/releases'))
			if (item.tag_name === tag) return item;
	}

	createDraft(tag: string, sha: string, name: string) {
		return this.#json<Release>('/releases', 'POST', {
			tag_name: tag,
			target_commitish: sha,
			name,
			draft: true
		});
	}

	async publish(id: number, name: string, body: string, latest: boolean) {
		await this.#json(`/releases/${id}`, 'PATCH', {
			name,
			body,
			draft: false,
			make_latest: String(latest)
		});
	}

	assets(id: number) {
		return this.#pages<Asset>(`/releases/${id}/assets`);
	}

	async deleteStarterAsset(id: number) {
		await this.#request(`/releases/assets/${id}`, 'DELETE');
	}

	async uploadAsset(release: Release, name: string, bytes: Uint8Array<ArrayBuffer>) {
		const url = new URL(release.upload_url.split('{')[0]);
		url.search = new URLSearchParams({ name, label: name }).toString();
		const response = await this.#request(url.href, 'POST', new Blob([bytes]), 'image/png');
		return (await response.json()) as Asset;
	}

	async assetBytes(id: number) {
		const response = await this.#request(
			`/releases/assets/${id}`,
			'GET',
			undefined,
			undefined,
			'application/octet-stream'
		);
		return Buffer.from(await response.arrayBuffer());
	}

	async pagesDeployPending(head: string) {
		const { workflow_runs } = await this.#json<{ workflow_runs: Run[] }>(
			`/actions/workflows/pages.yml/runs?branch=main&head_sha=${head}&per_page=100`
		);
		// A push deploys main; a manual run of main is this script's own deploy request (or close enough to one).
		return workflow_runs.some(
			(run) =>
				run.status !== 'completed' && (run.event === 'push' || run.event === 'workflow_dispatch')
		);
	}

	async dispatchPages() {
		await this.#request('/actions/workflows/pages.yml/dispatches', 'POST', {
			ref: 'main',
			inputs: { deploy: 'true' }
		});
	}
}
