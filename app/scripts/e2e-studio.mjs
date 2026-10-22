// Compatibility entry point: use the managed Playwright Test runner for the existing Studio regression.
// Run from the repository root or app/. BASE can point to an already-running local server.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const cli = require.resolve('@playwright/test/cli')
const result = spawnSync(process.execPath, [cli, 'test', '--project=studio'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdio: 'inherit',
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
