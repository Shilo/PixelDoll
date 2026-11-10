// Every end-to-end browser runs offline from PixelLab: specs mock or abort its API through routes, which act before DNS, so
// an unmocked request fails instead of reaching the live (paid) API. Tests never use dev:agent, the only server with a key.
export const offlineLaunch = {
	args: ['--host-resolver-rules=MAP pixellab.ai ~NOTFOUND, MAP *.pixellab.ai ~NOTFOUND']
};

const AGENT_PORT = '5199'; // package.json dev:agent
export function refuseAgentServer(...urls: (string | undefined)[]): void {
	for (const url of urls)
		if (url && new URL(url).port === AGENT_PORT)
			throw new Error(
				`End-to-end tests never run against dev:agent (${url}): it holds a real PixelLab key.`
			);
}
