import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    // Existing cases exercise shared browser-like globals and console.assert; never overlap them.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
})
