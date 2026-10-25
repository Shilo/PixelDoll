import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    // Files run in parallel; each gets its own process (default forks pool + isolate), so module state never leaks across files.
    // CI keeps Vitest's default (CPUs − 1 = 3 on a 4-vCPU runner). Locally half the threads measured faster than the default on
    // a 24-thread machine (3.8 s vs 5–6 s; extra processes only add startup cost) and leaves the machine usable.
    maxWorkers: process.env.CI ? undefined : '50%',
    // CI runners are quiet, so keep Vitest's strict 5 s. A workstation may also be running e2e or another agent's tests:
    // the heaviest export tests then exceeded 5 s (measured), so wait longer there instead of failing on load.
    testTimeout: process.env.CI ? 5_000 : 20_000,
  },
})
