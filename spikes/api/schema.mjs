// Dump compact request/response schema for endpoints: node schema.mjs /edit-image ...
import fs from 'node:fs';
const s = JSON.parse(fs.readFileSync(new URL('../../docs/research/pixellab/pixellab-openapi-v2.json', import.meta.url)));
const ref = r => r.split('/').slice(1).reduce((o, k) => o[k], s);
function show(sc, d = 0, seen = new Set()) {
  if (!sc) return '?';
  if (sc.$ref) { const n = sc.$ref.split('/').pop(); if (seen.has(n) || d > 3) return n; seen = new Set(seen).add(n); return show(ref(sc.$ref), d, seen); }
  for (const k of ['anyOf', 'oneOf', 'allOf']) if (sc[k]) return sc[k].map(x => show(x, d, seen)).join(' | ');
  if (sc.type === 'object' || sc.properties) {
    const req = new Set(sc.required || []);
    const pad = '  '.repeat(d + 1);
    return '{\n' + Object.entries(sc.properties || {}).map(([k, v]) => {
      const meta = [v.default !== undefined && `def=${JSON.stringify(v.default)}`, v.minimum !== undefined && `min=${v.minimum}`, v.maximum !== undefined && `max=${v.maximum}`, v.minItems !== undefined && `minItems=${v.minItems}`, v.maxItems !== undefined && `maxItems=${v.maxItems}`, v.enum && `enum=${v.enum.join(',')}`].filter(Boolean).join(' ');
      const desc = (v.description || '').replace(/\s+/g, ' ').slice(0, 160);
      return `${pad}${k}${req.has(k) ? '*' : ''}: ${show(v, d + 1, seen)} ${meta} ${desc ? '// ' + desc : ''}`;
    }).join('\n') + '\n' + '  '.repeat(d) + '}';
  }
  if (sc.type === 'array') return show(sc.items, d, seen) + '[]';
  return (sc.type || '') + (sc.enum ? `(${sc.enum.join(',')})` : '');
}
for (const a of process.argv.slice(2)) { const p = '/' + a.replace(/^\/+/, ''); // args without leading slash (Git Bash mangles /paths)
  for (const [m, o] of Object.entries(s.paths[p] || {})) {
    console.log(`\n### ${m.toUpperCase()} ${p} — ${o.summary}\n${(o.description || '').slice(0, 1500)}`);
    const b = o.requestBody?.content?.['application/json']?.schema;
    if (b) console.log('REQ', show(b));
    for (const [c, r] of Object.entries(o.responses || {})) { const sc = r.content?.['application/json']?.schema; if (sc) console.log('RES', c, show(sc)); }
  }
}
