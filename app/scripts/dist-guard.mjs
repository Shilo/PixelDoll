// Part of `npm run build` (and so CI): fails if dist/ carries dev or agent-key code, an .env file or a source map (file or
// inline). Prints file names only, never the matched content. Same check as PixelLab Backpack's scripts/dist-guard.mjs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const MARKERS = ['__dev', 'pixellab-key', 'PIXELLAB_API_KEY_AGENT_DEV', 'PIXELLAB_TOKEN_AGENT_DEV', 'PIXELLAB_API_KEY', 'API_KEY_OVERRIDE', 'DEV_API_KEY', 'devkey', 'pixeldoll.agentKey', 'agent-badge', 'sourceMappingURL'];
const bad = [];
for (const rel of readdirSync('dist', { recursive: true })) {
  const file = join('dist', rel);
  if (!statSync(file).isFile()) continue;
  const name = basename(file);
  if (name.startsWith('.env')) bad.push(`${file}: .env file`);
  else if (name.endsWith('.map')) bad.push(`${file}: source map`);
  else {
    const text = readFileSync(file, 'latin1');
    if (MARKERS.some((m) => text.includes(m))) bad.push(`${file}: dev or agent-key marker`);
  }
}
if (bad.length) {
  console.error(`dist guard: ${bad.length} problem(s) in dist/\n${bad.join('\n')}`);
  process.exit(1);
}
console.log('dist guard: clean');
