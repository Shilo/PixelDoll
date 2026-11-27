import { readFile, writeFile } from 'node:fs/promises';
import { stageAssets } from '../stage-assets.mjs';

const at = (path) => new URL(path, import.meta.url);
const html = await stageAssets(import.meta.url);
const index = at('dist/index.html');
await writeFile(index, html.replace('</head>', '  <script defer src="./wails-spike.js"></script>\n</head>'));
const probe = await readFile(at('../tauri-spike/probe.js'), 'utf8');
const start = probe.indexOf('async function studioReady()');
const end = probe.indexOf('async function main()', start);
if (start === -1 || end === -1) throw new Error('The shared startup probe changed');
await writeFile(at('dist/wails-spike.js'), `
const report = (name, details) => fetch('/__spike/ready', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, ...details })
});
${probe.slice(start, end)}
void studioReady().catch(console.error);
`);
