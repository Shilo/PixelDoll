// One-shot local receiver for exporting a Studio project from the agent dev server's IndexedDB. The page's dev CSP allows
// ws://127.0.0.1:* (Vite HMR), so the page sends one WebSocket text message; this writes out/c25/<name>.json and exits.
// Minimal RFC 6455 server on node built-ins: handshake + masked client frames (fragments allowed).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const name = process.argv[2] ?? 'bodyB', file = path.resolve(import.meta.dirname, `../out/c25/${name}.json`);
const server = http.createServer((_q, res) => res.end('ready'));
server.on('upgrade', (req, socket) => {
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  let buf = Buffer.alloc(0); const parts = [];
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f; let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4), data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);
      if (op === 8) { socket.end(); return; }
      if (op === 1 || op === 0) parts.push(data);
      if (fin && (op === 1 || op === 0)) {
        const text = Buffer.concat(parts).toString('utf8');
        fs.writeFileSync(file, text);
        console.log(`saved ${file} (${text.length} chars)`);
        socket.end(); server.close(); return;
      }
    }
  });
});
server.listen(5297, '127.0.0.1', () => console.log('listening on ws://127.0.0.1:5297'));
