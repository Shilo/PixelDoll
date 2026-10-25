import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    // Files run in parallel; each gets its own process (default forks pool + isolate), so module state never leaks across files.
    // CI keeps Vitest's default (CPUs − 1 = 3 on a 4-vCPU runner). Locally half the threads measured faster than the default on
    // a 24-thread machine (3.8 s vs 5–6 s; extra processes only add startup cost) and leaves the machine usable.
    maxWorkers: process.env.CI ? undefined : '50%',
  },
})
