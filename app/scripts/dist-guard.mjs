// Part of `npm run build` (and so CI): fails if dist/ carries dev or agent-key code, an .env file or a source map (file or
// inline). Prints file names only, never the matched content. Same check as PixelLab Backpack's scripts/dist-guard.mjs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

// Historical names are leak indicators, not a list of permitted environment references. resolveAgentKey covers any name.

const MARKERS = ['resolveAgentKey', 'PIXELLAB_SECRET', '__dev', 'pixellab-key', 'PIXELLAB_API_KEY_AGENT_DEV', 'PIXELLAB_TOKEN_AGENT_DEV', 'PIXELLAB_API_KEY', 'API_KEY_OVERRIDE', 'DEV_API_KEY', 'devkey', 'pixeldoll.agentKey', 'agent-badge', 'sourceMappingURL', '#/selftest', 'Developer pages', 'Verifying the PixelDoll update'];
const DEV_UI = ['Developer rigs', '8-dir held dress: every direction dressed once'];
const bad = [];
let startupPolicies = 0;
for (const rel of readdirSync('dist', { recursive: true })) {
  const file = join('dist', rel);
  if (!statSync(file).isFile()) continue;
  const name = basename(file);
  if (name.startsWith('.env')) bad.push(`${file}: .env file`);
  else if (name.endsWith('.map')) bad.push(`${file}: source map`);
  else if (name === 'update.html') bad.push(`${file}: retired update page`);
  else {
    const text = readFileSync(file, 'latin1');
    if (MARKERS.some((m) => text.includes(m))) bad.push(`${file}: dev or agent-key marker`);
    if (DEV_UI.some((m) => text.includes(m))) bad.push(`${file}: developer UI or self-test`);
    if (name.startsWith('startup-update-') && name.endsWith('.js')) {
      if (text.includes('pixeldoll.startupUpdate:')) startupPolicies++;
      const imports = [...text.matchAll(/\b(?:from|import)\s*["'`]([^"'`]+)["'`]/g)].map(match => match[1]);
      // This code must run before bootstrap, never pull in credentials, storage, or the mounted app.
      if (imports.some(path => !path.startsWith('./startup-update-')) || /\bimport\s*\(/.test(text)
        || text.includes('pixellabApiKey') || text.includes('indexedDB')) bad.push(`${file}: startup observation is not isolated`);
    }
  }
}
if (startupPolicies !== 1) bad.push('dist/assets: missing or duplicated isolated startup policy');
if (bad.length) {
  console.error(`dist guard: ${bad.length} problem(s) in dist/\n${bad.join('\n')}`);
  process.exit(1);
}
console.log('dist guard: clean');
