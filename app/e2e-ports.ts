// The local ports of an end-to-end run: playwright.config.ts starts its servers on them and scripts/e2e.mjs checks that a
// killed run left nothing listening there.
export const e2ePorts = (env: NodeJS.ProcessEnv = process.env) => ({
	preview: Number(env.E2E_PREVIEW_PORT ?? 5399),
	dev: Number(env.E2E_DEV_PORT ?? env.DEV_PORT ?? 5298)
});
