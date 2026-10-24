// Local-only component lab. No application configuration, .env or API endpoints.
import { createServer, build } from '../../../../app/node_modules/vite/dist/node/index.js';
import { svelte } from '../../../../app/node_modules/@sveltejs/vite-plugin-svelte/src/index.js';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
throw new Error('Historical Bronze lab: current theme development is at https://github.com/Shilo/bronze-ui and https://shilo.github.io/bronze-ui/. Reproduce this archived lab from PixelDoll commit 003bef2 in a separate checkout; current runners must not replace historical evidence.');
const path = relative => fileURLToPath(new URL(relative, import.meta.url));
const require = createRequire(new URL('../../../../app/package.json', import.meta.url));
const sharedDependencies = { name: 'existing-app-dependencies', enforce: 'pre', resolveId(id) {
  if (id === 'svelte') return path('../../../../app/node_modules/svelte/src/index-client.js');
  if (id.startsWith('svelte/') || id.startsWith('@lucide/svelte/')) return require.resolve(id);
} };
const config = { root: path('./'), configFile: false, envDir: false, plugins: [sharedDependencies, svelte({ configFile: false, prebundleSvelteLibraries: false })],
  optimizeDeps: { exclude: ['svelte', '@lucide/svelte'] },
  publicDir: path('../../../../app/public/fixtures/s2/'),
  server: { host: '127.0.0.1', port: 5203, strictPort: true, fs: { allow: [path('../../../../')] } },
  build: { outDir: path('./.build'), emptyOutDir: true }, appType: 'spa' };
if (process.argv.includes('--build')) await build(config);
else { const server = await createServer(config); await server.listen(); console.log('Owned Bronze theme: http://127.0.0.1:5203'); }
