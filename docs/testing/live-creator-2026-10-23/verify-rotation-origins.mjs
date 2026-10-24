// Offline audit. Pass the saved evidence directory outside Git. No API calls or project writes.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { unzip } from '../../../app/src/lib/store/zip.ts'
import { decodePngBytes } from '../../../app/src/lib/image/pngraw.ts'
import { feetY, opaqueBox } from '../../../app/src/lib/rig/normalize.ts'
const root = process.argv[2]
assert(root, 'Pass the local evidence directory containing the saved L01–L06 ZIPs')
const read = async name => { const files = await unzip(new Uint8Array(await readFile(`${root}/${name}`))); return { files, record: JSON.parse(new TextDecoder().decode(files.get('project.json'))) } }
const image = async (archive, hash) => decodePngBytes(archive.files.get(`cells/${hash.slice(7)}.png`))
const midpoint = (pose, size) => { const a = pose.find(k => k.label === 'LEFT LEG'), b = pose.find(k => k.label === 'RIGHT LEG'); return { x: (a.x + b.x) * size / 2, y: (a.y + b.y) * size / 2 } }
const span = values => Math.max(...values) - Math.min(...values)
const result = []
for (const id of ['L01', 'L02', 'L03', 'L04', 'L05', 'L06']) {
  const src = await read(`${id}-output.pixeldoll.zip`), m = src.record.manifest, size = m.rig.cell.w
  const actual = id === 'L04' ? await read('L04-aligned-output.pixeldoll.zip') : null
  const rows = []
  for (const d of m.rig.directions) {
    const rest = m.rig.rest[d.id], im = await image(src, rest.image), center = midpoint(rest.keypoints, size)
    const body = m.items.find(it => it.id === m.rig.baseItem).layers[0], idle = await image(src, body.cells.idle[d.id][0])
    const dy = m.rig.pivot.y - feetY(idle), top = opaqueBox(im).y0
    let topAfter = top + dy, midpointAfter = { ...center, y: center.y + dy }
    if (actual) {
      const ref = actual.record.manifest.rig.rest[d.id], actualImage = await image(actual, ref.image)
      topAfter = opaqueBox(actualImage).y0; midpointAfter = midpoint(ref.keypoints, size)
      assert.equal(topAfter, top + dy); assert(Math.abs(midpointAfter.y - center.y - dy) < 1e-10)
    }
    rows.push({ direction: d.id, shift: dy, top, topAfter, midpoint: center, midpointAfter })
  }
  result.push({ id, camera: m.rig.view, comparison: actual ? 'actual saved aligned copy' : 'proposed rigid shifts only', headRange: span(rows.map(r => r.top)), headRangeAfter: span(rows.map(r => r.topAfter)), ankleMidpointYRange: span(rows.map(r => r.midpoint.y)), ankleMidpointYRangeAfter: span(rows.map(r => r.midpointAfter.y)), rows })
}
const l04 = result.find(r => r.id === 'L04'), south = l04.rows.find(r => r.direction === 'south'), north = l04.rows.find(r => r.direction === 'north')
assert.equal(south.top, north.top); assert.equal(Math.abs(south.topAfter - north.topAfter), 5)
assert(l04.ankleMidpointYRangeAfter > l04.ankleMidpointYRange)
assert(result.filter(r => r.rows.some(d => d.shift)).every(r => r.headRangeAfter > r.headRange && r.ankleMidpointYRangeAfter > r.ankleMidpointYRange))
console.log(JSON.stringify({ credits: 0, note: 'Ankle midpoints are estimated proxies, not exact sole-contact origins.', result }, null, 2))
