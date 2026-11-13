import os from 'node:os';
import { defineConfig } from 'vitest/config';

// A workstation run yields to the desktop and to other work: the test processes inherit the lowered priority.
// A run that was started lower still stays there.
const below = os.constants.priority.PRIORITY_BELOW_NORMAL;
if (!process.env.GITHUB_ACTIONS && os.getPriority() < below) os.setPriority(below);

export default defineConfig({
	define: { __AGENT_API_BASE__: 'null' }, // as in every non-agent mode (vite.config.ts)
	test: {
		include: ['test/unit/**/*.test.ts'],
		environment: 'node',
		// Files run in parallel; each gets its own process (default forks pool + isolate), so module state never leaks across files.
		// CI keeps Vitest's default (CPUs − 1 = 3 on a 4-vCPU runner). Locally half the threads measured faster than the default on
		// a 24-thread machine (3.8 s vs 5–6 s; extra processes only add startup cost) and leaves the machine usable.
		maxWorkers: process.env.CI ? undefined : '50%',
		// CI runner speed varies about 1.7x between runs (suite 35-60 s), and the heaviest sweeps take 2.4-2.9 s there, so 10 s
		// keeps that headroom while a real hang still fails fast. A workstation may also be running e2e or another agent's tests:
		// the heaviest export tests then exceeded 5 s (measured), so wait longer there instead of failing on load.
		testTimeout: process.env.CI ? 10_000 : 20_000
	}
});
