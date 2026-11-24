// Runs backup-tool.test.ts against app/ (its node_modules and sources) without touching app's own test config.
// run.mjs passes this file with --config from app/; no imports, because this folder has no node_modules.
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url)).replaceAll('\\', '/');

export default {
	root: here('../../../../app/'),
	define: {
		__AGENT_API_BASE__: 'null',
		__APP_VERSION__: JSON.stringify('audit'),
		__APP_COMMIT__: JSON.stringify('local')
	},
	server: { fs: { allow: [here('../../../../')] } },
	test: {
		include: ['backup-tool.test.ts'],
		dir: here('./'),
		globals: true,
		environment: 'node',
		testTimeout: 600_000,
		reporters: ['dot']
	}
};
