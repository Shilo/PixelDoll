import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';

const at = (path) => new URL(path, import.meta.url);
await mkdir(at('icons/'), { recursive: true });
await cp(at('../../../../app/public/icons/pwa/favicon.ico'), at('icons/icon.ico'));
await cp(at('../../../../app/dist/'), at('dist/'), { recursive: true });
await cp(at('probe.js'), at('dist/tauri-spike.js'));
const index = at('dist/index.html');
const html = await readFile(index, 'utf8');
if (!html.includes("connect-src 'self'") || !html.includes('</head>')) {
  throw new Error('The PixelDoll build changed. Review the desktop CSP and script injection.');
}
await writeFile(
  index,
  html.replace("connect-src 'self'", "connect-src 'self' ipc: http://ipc.localhost https://ipc.localhost")
    .replace('</head>', '  <script defer src="./tauri-spike.js"></script>\n</head>')
);
