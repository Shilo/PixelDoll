// Scratch-only config: run from app/ so vitest and the app sources resolve; includes only the audit test.
export default {
	define: { __AGENT_API_BASE__: 'null' },
	server: { fs: { strict: false } },
	test: {
		root: '<SCRATCH>/imports',
		include: ['gridsnap.test.ts'],
		environment: 'node',
		testTimeout: 600000
	}
};
