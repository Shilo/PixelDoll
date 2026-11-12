// Where `vite build` writes and `vite preview` serves: dist/ for builds, the dist guard, previews and Pages deploys.
// Only scripts/e2e.mjs sets E2E_DIST_DIR, for a run with its own E2E_PREVIEW_PORT (concurrent agents, AGENTS.md): a shared
// dist/ rebuilt by another run replaces the hashed chunks under a running preview server, and lazy imports then fail with
// 404 ("Part of PixelDoll could not load"). The name is checked so no other environment can redirect a real build.
export const distDir = (env: NodeJS.ProcessEnv = process.env) => {
	const dir = env.E2E_DIST_DIR;
	if (!dir) return 'dist';
	if (!/^dist-e2e-[\w-]+$/.test(dir))
		throw new Error(`E2E_DIST_DIR must be dist-e2e-<name>, not ${dir}`);
	return dir;
};
