import type { Deployment, DeploymentStatus } from './github.ts';

type DeploymentReader = {
	deployments(): AsyncIterable<Deployment>;
	deploymentStatuses(id: number): AsyncIterable<DeploymentStatus>;
};

export async function* liveBuilds(github: DeploymentReader, cutoffs: Date[]) {
	const dates = [...cutoffs].sort((a, b) => +b - +a);
	if (!dates.length) return;
	const deployments = github.deployments()[Symbol.asyncIterator]();
	let next = await deployments.next();
	const known: { sha: string; at: number }[] = [];
	try {
		for (const date of dates) {
			let best = known.find((build) => build.at <= +date);
			while (!next.done) {
				const deployment = next.value;
				const created = Date.parse(deployment.created_at);
				if (created > +dates[0]) {
					next = await deployments.next();
					continue;
				}
				// Creation time is a lower bound for every success on this and older deployments.
				if (best && created < best.at) break;
				if (created <= +date) {
					for await (const status of github.deploymentStatuses(deployment.id)) {
						const at = Date.parse(status.created_at);
						// A job that skipped deploy-pages reports success with an empty environment URL.
						if (status.state !== 'success' || !status.environment_url || at > +dates[0]) continue;
						const build = { sha: deployment.sha, at };
						known.push(build);
						if (at <= +date && (!best || at > best.at)) best = build;
					}
				}
				next = await deployments.next();
			}
			known.sort((a, b) => b.at - a.at);
			yield { date, sha: best?.sha };
		}
	} finally {
		await deployments.return?.();
	}
}
