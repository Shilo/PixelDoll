import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/probe.js', ['probe.js', 'text/javascript; charset=utf-8']]
]);
const server = createServer(async (req, res) => {
  const asset = req.method === 'GET' && assets.get(req.url);
  if (!asset) {
    res.writeHead(404).end();
    return;
  }
  const [filename, type] = asset;
  try {
    const body = await readFile(new URL(filename, import.meta.url));
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Security-Policy': "default-src 'none'; script-src 'self'",
      'Cache-Control': 'no-store'
    }).end(body);
  } catch (error) {
    console.error(error.message);
    res.writeHead(500).end();
  }
});
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
