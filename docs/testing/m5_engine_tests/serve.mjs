// Static file server for the Phaser engine test: node serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = import.meta.dirname, port = +(process.argv[2] ?? 8765);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/shot/')) { // test page uploads its canvas capture
    const chunks = []; for await (const c of req) chunks.push(c);
    await writeFile(join(root, 'shot_' + req.url.slice(6).replace(/[^\w.-]/g, '_')), Buffer.concat(chunks));
    return res.writeHead(204).end();
  }
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/test.html')));
  if (!path.startsWith(root)) return res.writeHead(403).end();
  let body;
  try { body = await readFile(path); } catch { return res.writeHead(404).end(); }
  res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
}).listen(port, () => console.log(`http://localhost:${port}/`));
