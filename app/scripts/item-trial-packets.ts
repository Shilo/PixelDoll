// Public frozen inputs for the local item trial screen. This script cannot call PixelLab.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runBench } from './bench.ts';
import { cutBase, over } from '../src/lib/compose/compose.ts';
import { encodePngBytes } from '../src/lib/image/pngraw.ts';
import { bytesToBase64, type Img } from '../src/lib/image/png.ts';
import { toChroma } from '../src/lib/image/chroma.ts';
import { cutGrid, packGrid } from '../src/lib/items/items.ts';
import type { DirectionName, Rig } from '../src/lib/rig/rig.ts';

const output = resolve('test-results-item-trials/packets');
mkdirSync(output, { recursive: true });
const encode = async (image: Img) => bytesToBase64(await encodePngBytes(image));
const cutsOf = (cut?: Uint8Array) => cut ? [...cut.keys()].filter(p => cut[p]) : [];
const prompts = {
  'a-chest': 'a brown leather vest with small metal buckles',
  'a-cape': 'a long deep red cape attached at the shoulders, matching the approved reference',
  'b-tunic': 'an emerald green short-sleeved tunic with gold edging and a small gold neck tie',
  'b-cloak': 'a dark brick-red hooded cape, open in front, matching the approved reference',
  'b-greathelm': 'a steel greathelm with a narrow dark eye slit and small ventilation holes',
} as const;
const seeds = [110601, 110602];
const summary = [];
const packets = new Map<string, unknown>();
for (const [caseId, prompt] of Object.entries(prompts)) {
  const { cases, results } = await runBench(caseId);
  const spec = cases.find(c => c.id === caseId)!;
  const sample = results.find(r => r.id === caseId)!;
  const body = JSON.parse(readFileSync(new URL(`../test/fixtures/bench/body${spec.body}.json`, import.meta.url), 'utf8')) as { rig: Rig };
  const standing = sample.cells.filter(c => c.key.startsWith('rest/'));
  for (const direction of ['south', 'east'] as DirectionName[]) {
    const reference = standing.find(c => c.key === `rest/${direction}/0`)!;
    const targets = sample.cells.filter(c => c.key.startsWith(`walk/${direction}/`));
    if (!reference || targets.length !== 8) throw new Error(`Incomplete public trial input for ${caseId}/${direction}.`);
    // Packing all standing and selected body cells applies one production ramp to the entire body sample.
    const pooled = [ ...standing.map(c => c.base), ...targets.map(c => c.base) ];
    const shared = cutGrid(toChroma(packGrid(pooled, pooled.map(() => null), 1).image, spec.key), pooled.length, body.rig.cell.w, body.rig.cell.h, 1);
    const sharedRest = shared[standing.indexOf(reference)];
    const canonical = cutBase(toChroma(reference.base, spec.key), [cutsOf(reference.cut)]);
    over(canonical, reference.layer);
    const sharedCanonical = cutBase(sharedRest, [cutsOf(reference.cut)]);
    over(sharedCanonical, reference.layer);
    for (const conditioning of ['raw', 'canonical', 'shared'] as const) {
      for (const seed of seeds) {
        const id = `${caseId}-${direction}-${conditioning}-${seed}`;
        const packet = {
          version: 1, id, label: `${caseId} / Walk ${direction} / ${conditioning} / ${seed}`,
          caseId, direction, anim: 'walk', conditioning, seed, slot: spec.slot,
          key: spec.key, prompt, cell: body.rig.cell, rig: body.rig,
          reference: {
            base: await encode(reference.base), raw: await encode(reference.out),
            layer: await encode(reference.layer), cut: cutsOf(reference.cut),
            ...(conditioning !== 'raw' ? { conditioned: await encode(conditioning === 'canonical' ? canonical : sharedCanonical) } : {}),
          },
          targets: await Promise.all(targets.map(async (target, index) => ({
            key: target.key, base: await encode(target.base), expectedLayer: await encode(target.layer),
            expectedCut: cutsOf(target.cut),
            poses: body.rig.animations.find(a => a.id === 'walk')?.sources?.[direction]?.keypoints?.[index],
            ...(conditioning === 'shared' ? { keyed: await encode(shared[standing.length + index]) } : {}),
          }))),
        };
        writeFileSync(resolve(output, `${id}.json`), JSON.stringify(packet));
        packets.set(id, packet);
        summary.push({ id, targets: targets.length, source: caseId, conditioning, seed });
      }
    }
  }
}
writeFileSync(resolve(output, 'index.json'), JSON.stringify(summary, null, 2));
const trials: { packet: unknown; arm: 'edit' | 'transfer' | 'pose' }[] = [];
const add = (id: string, arm: 'edit' | 'transfer' | 'pose') => {
  const packet = packets.get(id);
  if (!packet) throw new Error(`The trial plan has no packet ${id}.`);
  trials.push({ packet, arm });
};
for (const seed of seeds) {
  for (const caseId of ['b-tunic', 'b-cloak']) {
    for (const direction of ['south', 'east']) {
      for (const arm of ['edit', 'transfer'] as const) add(`${caseId}-${direction}-raw-${seed}`, arm);
      for (const conditioning of ['canonical', 'shared']) add(`${caseId}-${direction}-${conditioning}-${seed}`, 'edit');
    }
  }
  for (const caseId of ['b-greathelm', 'b-cloak']) {
    for (const conditioning of ['raw', 'canonical']) add(`${caseId}-east-${conditioning}-${seed}`, 'pose');
  }
  for (const caseId of ['a-chest', 'a-cape']) {
    for (const direction of ['south', 'east']) {
      for (const arm of ['edit', 'transfer'] as const) add(`${caseId}-${direction}-raw-${seed}`, arm);
    }
  }
  for (const conditioning of ['raw', 'canonical']) add(`a-cape-east-${conditioning}-${seed}`, 'pose');
}
writeFileSync(resolve(output, 'matched-item-trials.plan.json'), JSON.stringify({ version: 1, kind: 'pixeldoll-item-trial-plan', id: 'matched-item-routes-2026-11-06-r1', label: 'Matched item route and conditioning comparisons', trials }));
console.log(`Prepared ${summary.length} public trial packets in ${output}. No requests were submitted.`);
