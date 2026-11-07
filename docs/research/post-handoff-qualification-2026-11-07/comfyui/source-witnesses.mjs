import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePngBytes } from '../../../../app/src/lib/image/pngraw.ts';
import { keyScore, KT } from '../../../../app/src/lib/image/chroma.ts';
import { extractCell } from '../../../../app/src/lib/items/items.ts';

const folder = dirname(fileURLToPath(import.meta.url)), root = resolve(folder, '../../../..');
const packetFolder = resolve(root, 'app/test-results-item-trials/packets');
const sha = value => createHash('sha256').update(value).digest('hex');
const files = (await readdir(packetFolder)).filter(name => /-raw-\d+\.json$/.test(name)).sort();
const seen = new Map(), rows = [];
for (const name of files) {
  const bytes = await readFile(resolve(packetFolder, name)), packet = JSON.parse(bytes);
  const sourceHash = sha(`${packet.reference.base}|${packet.reference.raw}|${packet.reference.layer}|${packet.key}|${JSON.stringify(packet.rig.rest[packet.direction].keypoints)}`);
  if (seen.has(sourceHash)) { seen.get(sourceHash).duplicatePackets.push(packet.id); continue; }
  const base = await decodePngBytes(Buffer.from(packet.reference.base, 'base64'));
  const source = await decodePngBytes(Buffer.from(packet.reference.raw, 'base64'));
  const layer = await decodePngBytes(Buffer.from(packet.reference.layer, 'base64'));
  const w = base.w, h = base.h, isKey = p => source.data[p * 4 + 3] >= 128 && keyScore(packet.key, ...source.data.subarray(p * 4, p * 4 + 3)) >= KT;
  const row = { id: packet.id, packetSha256: sha(bytes), sourceHash, duplicatePackets: [], dimensions: [w, h], key: packet.key, visibleKey: 0, keyOutsideFrozenBody: 0, allJoints: 0, gearOccludedJoints: 0, unsupportedInFrozenBody: 0, exactVisibleKeyJoints: 0, noVisibleKeyWithinThreePixels: 0, missingWitnesses: [] };
  for (let p = 0; p < w * h; p++) if (isKey(p)) { row.visibleKey++; if (!base.data[p * 4 + 3]) row.keyOutsideFrozenBody++; }
  for (const joint of packet.rig.rest[packet.direction].keypoints) {
    row.allJoints++;
    const x = Math.max(0, Math.min(w - 1, Math.floor(joint.x * w))), y = Math.max(0, Math.min(h - 1, Math.floor(joint.y * h))), p = y * w + x;
    if (layer.data[p * 4 + 3]) { row.gearOccludedJoints++; continue; }
    if (!base.data[p * 4 + 3]) { row.unsupportedInFrozenBody++; continue; }
    if (isKey(p)) { row.exactVisibleKeyJoints++; continue; }
    let nearest = Number.POSITIVE_INFINITY;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h && isKey(Y * w + X)) nearest = Math.min(nearest, Math.hypot(dx, dy));
    }
    if (!Number.isFinite(nearest)) row.noVisibleKeyWithinThreePixels++;
    row.missingWitnesses.push({ label: joint.label, pixel: [x, y], nearestVisibleKeyWithinWindow: Number.isFinite(nearest) ? nearest : null });
  }
  const registration = extractCell({ key: `rest/${packet.direction}/0`, call: 0, base, out: source, route: packet.key, band: { x: 0, y: 0, w, h } });
  row.registrationOffset = registration.offset; row.registrationShifted = registration.shifted;
  seen.set(sourceHash, row); rows.push(row);
}
const totals = Object.fromEntries(['visibleKey', 'keyOutsideFrozenBody', 'allJoints', 'gearOccludedJoints', 'unsupportedInFrozenBody', 'exactVisibleKeyJoints', 'noVisibleKeyWithinThreePixels'].map(field => [field, rows.reduce((n, row) => n + row[field], 0)]));
const output = { version: process.version, examinedPackets: files.length, uniqueSources: rows.length, rows, totals, limits: ['Stored joints are assigned reference coordinates, not independently labeled source-image anatomy.', 'Gear occlusion and absent visible-key support are abstentions, not measured joint displacement.', 'Nearest key support does not prove semantic landmark identity.', 'Prior canonical-conditioning live comparisons were mixed and did not qualify a new default.'] };
await writeFile(resolve(folder, 'source-witness-results.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ examinedPackets: files.length, uniqueSources: rows.length, ...totals }));
