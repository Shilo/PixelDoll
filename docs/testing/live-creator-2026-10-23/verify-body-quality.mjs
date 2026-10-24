// Saved-art audit only: no service requests, no changes to projects. Pass the external L01–L06 evidence directory.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { unzip } from '../../../app/src/lib/store/zip.ts'
import { decodePngBytes } from '../../../app/src/lib/image/pngraw.ts'
import { bodyComponents, clipQa } from '../../../app/src/lib/rig/clips.ts'
import { cellHash } from '../../../app/src/lib/rig/rig.ts'
const root = process.argv[2]
assert(root, 'Pass the saved evidence directory')
const result = []; let checkedFrames = 0
for (const id of ['L01', 'L02', 'L03', 'L04', 'L05', 'L06']) {
  const archive = await unzip(new Uint8Array(await readFile(`${root}/${id}-output.pixeldoll.zip`)))
  const { manifest: m } = JSON.parse(new TextDecoder().decode(archive.get('project.json')))
  const load = hash => decodePngBytes(archive.get(`cells/${hash.slice(7)}.png`))
  const body = m.items.find(it => it.id === m.rig.baseItem).layers[0], clips = []
  for (const a of m.rig.animations) for (const d of m.rig.directions.filter(d => !d.mirrorOf)) {
    const source = a.sources?.[d.id]
    if (!source?.measured) continue
    const rest = await load(m.rig.rest[d.id].image), frames = await Promise.all(body.cells[a.id][d.id].map(load))
    let disconnectedPixels = 0
    for (const f of frames) { const before = await cellHash(f); disconnectedPixels += bodyComponents(f).detachedPixels; assert.equal(await cellHash(f), before); checkedFrames++ }
    const qa = clipQa({ anim: a.id, rest, frames, requested: source.keypoints, measured: source.measured, stray: 0, disconnectedPixels })
    assert.deepEqual(qa.fails, [], `${id}/${a.id}/${d.id}: saved valid output must remain usable`)
    clips.push({ clip: `${a.id}/${d.id}`, ...qa })
  }
  result.push({ id, frameSize: m.rig.cell.w, clips })
}
const west = result.find(r => r.id === 'L04').clips.find(c => c.clip === 'walk/west')
assert.equal(west.adherence, 2.71)
assert(west.warnings.some(w => /estimated arm-joint difference/.test(w)))
assert(west.warnings.some(w => /silhouette bottom/.test(w)))
console.log(JSON.stringify({ credits: 0, checkedFrames, note: 'Observations retain estimates and pixels; they neither prove bad artwork nor trigger a body redraw.', result }, null, 2))
