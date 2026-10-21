// Generic export (manifest-spec §3, §5, §6.6): validation, the exported manifest.json, _stripN strips, baked composites,
// LPC-style credits (provenance trail).
import type { Img } from '../image/png.ts';
import { validateRig } from '../rig/rig.ts';
import type { Engine, Manifest, Project } from '../store/manifest.ts';
import { bakedSheet, layerSheet, sheetPath, sheetRow } from './sheets.ts';
import { recolour } from '../dress/dress.ts';
import { bakedFrame, layerFrame } from '../compose/compose.ts';

export type OutFile = { name: string; data: string | Img | Uint8Array };

/** Invariants checked before export (spec §3); export refuses on any error. Stale items are warnings, not errors. */
export function validate(p: Project): string[] {
  const m = p.manifest, e = validateRig(m.rig);
  const bodies = m.items.filter((i) => i.slot === 'body');
  if (bodies.length !== 1 || bodies[0].id !== m.rig.baseItem) e.push('exactly one item in slot "body" must be rig.baseItem');
  const seen = new Map<string, string>();
  for (const mat of m.materials) {
    for (const c of mat.ramp) seen.has(c) ? e.push(`colour ${c} in ramps ${seen.get(c)} and ${mat.id}`) : seen.set(c, mat.id);
    for (const [v, r] of Object.entries(mat.variants)) if (r.length !== mat.ramp.length) e.push(`${mat.id}.${v}: ${r.length} colours for a ${mat.ramp.length}-colour ramp`);
  }
  const mirrored = m.rig.directions.some((d) => d.mirrorOf);
  for (const it of m.items) {
    if (!m.slots.some((s) => s.id === it.slot)) e.push(`${it.id}: unknown slot ${it.slot}`);
    for (const l of it.layers) {
      const f = layerFrame(m.rig, l);
      if (![f.w, f.h, f.x, f.y].every(Number.isInteger) || f.w < 1 || f.h < 1) e.push(`${it.id}.${l.id}: cell ${f.w}x${f.h} / pivot ${f.x},${f.y} must be integers`);
      // a mirrored row is a flip of the whole layer cell: only correct if that cell is centred on the rig cell
      if (mirrored && 2 * (m.rig.pivot.x - f.x) + f.w !== m.rig.cell.w) e.push(`${it.id}.${l.id}: cell ${f.w} with pivot x ${f.x} is not centred on the rig cell (mirrored directions flip it)`);
      for (const [anim, dirs] of Object.entries(l.cells ?? {})) {
        const a = m.rig.animations.find((x) => x.id === anim);
        if (!a) { e.push(`${it.id}.${l.id}: unknown animation ${anim}`); continue; }
        for (const [dir, cells] of Object.entries(dirs ?? {})) {
          if (cells!.length !== a.cells) e.push(`${it.id}.${l.id} ${anim}/${dir}: ${cells!.length} cells, rig has ${a.cells}`);
          for (const h of cells!) {
            const im = h && p.images.get(h);
            if (h && !im) e.push(`${it.id}.${l.id} ${anim}/${dir}: image ${h.slice(0, 15)} missing`);
            else if (im && (im.w !== f.w || im.h !== f.h)) e.push(`${it.id}.${l.id} ${anim}/${dir}: cell ${im.w}x${im.h}, layer cell ${f.w}x${f.h}`);
          }
        }
      }
    }
  }
  return e;
}

export interface ManifestOptions { engines: Engine[]; baked: boolean; pixelsPerUnit?: number; exportedAt?: string }

/** project manifest -> exported manifest.json: cells dropped, sheet paths added, stale items excluded. */
export function exportManifest(p: Project, o: ManifestOptions): { manifest: Manifest; warnings: string[] } {
  const src = p.manifest, warnings: string[] = [];
  const items = src.items.filter((it) => {
    const ok = it.baseHash === src.rig.baseHash;
    if (!ok) warnings.push(`${it.id}: stale (baseHash differs from the rig), excluded`);
    return ok;
  });
  const ids = new Set(items.map((i) => i.id));
  const m: Manifest = structuredClone({ ...src, items, export: undefined });
  for (const it of m.items)
    for (const l of it.layers) {
      const f = layerFrame(m.rig, l);
      delete l.cells;
      l.sheets = Object.fromEntries(m.rig.animations.map((a) => [a.id, sheetPath(it, l, a.id)]));
      Object.assign(l, { cell: { w: f.w, h: f.h }, pivot: { x: f.x, y: f.y } }); // explicit in manifest.json: readers never default
    }
  for (const pr of m.presets) for (const s in pr.items) if (pr.items[s] && !ids.has(pr.items[s]!)) pr.items[s] = null;
  m.export = {
    exportedAt: o.exportedAt ?? new Date().toISOString(),
    layout: 'pixeldoll-sheets/1',
    engines: o.engines,
    pixelsPerUnit: o.pixelsPerUnit ?? m.rig.cell.w,
    ...(o.baked ? (({ w, h, x, y }) => ({ baked: m.presets.map((x) => x.id), bakedCell: { w, h }, bakedPivot: { x, y } }))(bakedFrame(m)) : {}),
  };
  return { manifest: m, warnings };
}

const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** CREDITS.csv: one row per generating call (LPC credits spirit: every shipped sheet traceable to its source). */
export function creditsCsv(m: Manifest): string {
  const rows = [['item', 'name', 'slot', 'sheets', 'endpoint', 'jobId', 'seed', 'createdAt', 'prompt', 'source']];
  for (const it of m.items) {
    const sheets = it.layers.flatMap((l) => Object.values(l.sheets ?? {})).join(' ');
    for (const pv of it.provenance.length ? it.provenance : [undefined])
      rows.push([it.id, it.name, it.slot, sheets, pv?.endpoint ?? '', pv?.jobId ?? '', String(pv?.seed ?? ''), pv?.createdAt ?? '', it.prompt, 'PixelLab (https://pixellab.ai)']);
  }
  return rows.map((r) => r.map(csv).join(',')).join('\n') + '\n';
}

/** Layer sheets (all engines need them) + manifest + credits. */
export function coreFiles(p: Project, m: Manifest): OutFile[] {
  const files: OutFile[] = [{ name: 'manifest.json', data: JSON.stringify(m, null, 2) + '\n' }, { name: 'CREDITS.csv', data: creditsCsv(m) }];
  const byId = new Map(p.manifest.items.map((i) => [i.id, i]));
  for (const it of m.items)
    for (const l of it.layers) {
      const srcLayer = byId.get(it.id)!.layers.find((x) => x.id === l.id)!;
      for (const a of m.rig.animations) files.push({ name: l.sheets![a.id], data: layerSheet(p, srcLayer, a.id) });
    }
  return files;
}

/** generic/<item>_<layer>/<anim>_<dir>_strip<N>.png and baked/<preset>/<anim>.png (reuses the layer sheets already built).
 *  Layer sheets keep source ramps (materials + preset variants are in the manifest); baked sheets apply the preset's variants. */
export function genericFiles(p: Project, m: Manifest, sheets: Map<string, Img>, o: { strips: boolean; baked: boolean }): OutFile[] {
  const files: OutFile[] = [];
  const { rig } = m;
  if (o.strips) for (const it of m.items)
    for (const l of it.layers)
      for (const a of rig.animations)
        rig.directions.forEach((d, r) =>
          files.push({ name: `generic/${it.id}_${l.id}/${a.id}_${d.id}_strip${a.cells}.png`, data: sheetRow(sheets.get(l.sheets![a.id])!, r, layerFrame(rig, l).h) }));
  const bf = bakedFrame(m);
  if (o.baked) for (const pr of m.presets) for (const a of rig.animations) files.push({ name: `baked/${pr.id}/${a.id}.png`, data: bakedSheet(recolour(p, pr.variants), pr.items, a.id, bf) });
  return files;
}

export function selfTest() {
  const hash = 'sha256:' + '0'.repeat(64);
  const p = {
    images: new Map(),
    manifest: {
      format: 'pixeldoll/1', name: 't', app: 'x', materials: [{ id: 'a', label: 'a', owner: 'base', ramp: ['#000000'], variants: { v: ['#111111', '#222222'] } }],
      rig: { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, directions: [{ id: 'south' }], animations: [{ id: 'walk', cells: 2, loop: true, frames: [{ cell: 0, ms: 100 }, { cell: 1, ms: 100 }] }], baseItem: 'base', baseHash: hash },
      slots: [{ id: 'body', z: 10, class: 'base' }, { id: 'head', z: 130, class: 'rigid' }],
      items: [
        { id: 'base', name: 'Base', slot: 'body', status: 'accepted', mirror: 'flip', materials: [], prompt: 'p, "q"', baseHash: hash, provenance: [], layers: [{ id: 'main', role: 'fg', z: 10, cells: { walk: { south: [null, null] } } }] },
        { id: 'old', name: 'Old', slot: 'head', status: 'stale', mirror: 'flip', materials: [], prompt: '', baseHash: 'sha256:1', provenance: [], layers: [{ id: 'main', role: 'fg', z: 130 }] },
      ],
      presets: [{ id: 'default', name: 'D', items: { body: 'base', head: 'old' }, variants: {} }],
    },
  } as unknown as Project;
  const errs = validate(p);
  console.assert(errs.length === 1 && errs[0].includes('a.v'), `validate: variant length only (${errs.join('; ')})`);
  const { manifest: m, warnings } = exportManifest(p, { engines: ['generic'], baked: true, exportedAt: 'T' });
  console.assert(warnings.length === 1 && m.items.length === 1 && m.presets[0].items.head === null, 'stale item excluded and unequipped');
  console.assert(!m.items[0].layers[0].cells && m.items[0].layers[0].sheets!.walk === 'layers/body/base/main/walk.png', 'cells -> sheets');
  console.assert(m.export!.pixelsPerUnit === 64 && m.export!.baked![0] === 'default' && !!p.manifest.items[0].layers[0].cells, 'export info, source untouched');
  console.assert(creditsCsv(m).split('\n')[1].includes('"p, ""q"""'), 'csv quoting');
  console.assert(m.items[0].layers[0].cell!.w === 64 && m.items[0].layers[0].pivot!.y === 60 && m.export!.bakedCell!.w === 64, 'cell/pivot explicit per layer, baked cell');

  // oversize layer (S5 held item): 96 cell, pivot = rig pivot + 16
  const L96 = { id: 'main', role: 'fg', z: 130, cell: { w: 96, h: 96 }, pivot: { x: 48, y: 76 }, cells: { walk: { south: ['sha256:96', null] } } };
  p.manifest.items.push({ id: 'sw', name: 'Sword', slot: 'head', status: 'accepted', mirror: 'flip', materials: [], prompt: '', baseHash: hash, provenance: [], layers: [L96] } as never);
  p.manifest.materials[0].variants = {};
  const img = (n: number) => p.images.set('sha256:96', { w: n, h: n, data: new Uint8ClampedArray(n * n * 4) });
  img(96);
  console.assert(validate(p).length === 0, `oversize: 96 cell accepted (${validate(p).join('; ')})`);
  img(64);
  console.assert(validate(p).some((x) => x.includes('layer cell 96x96')), 'oversize: image must match the layer cell');
  img(96);
  p.manifest.rig.directions.push({ id: 'west', mirrorOf: 'south' });
  L96.pivot.x = 40;
  console.assert(validate(p).some((x) => x.includes('not centred')), 'oversize: off-centre cell rejected when mirrored');
  L96.pivot.x = 48;
  const m2 = exportManifest(p, { engines: ['generic'], baked: true }).manifest;
  console.assert(m2.export!.bakedCell!.w === 96 && m2.export!.bakedPivot!.y === 76 && m2.items[1].layers[0].cell!.h === 96, 'oversize: baked cell = union of layers');
}
