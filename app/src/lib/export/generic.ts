// Generic export (manifest-spec §3, §5, §6.6): validation, the exported manifest.json, _stripN strips, baked composites,
// LPC-style credits (provenance trail).
import type { Img } from '../image/png.ts';
import { validateRig } from '../rig/rig.ts';
import type { Engine, Manifest, Project } from '../store/manifest.ts';
import { bakedSheet, layerSheet, sheetPath, sheetRow } from './sheets.ts';
import { moveDirs, recolor, storeVariants, variantOf, variantRampOf } from '../dress/dress.ts';
import { bakedFrame, layerFrame } from '../compose/compose.ts';
import { validPaletteRepairs } from '../dress/item-palette.ts';

export type OutFile = { name: string; data: string | Img | Uint8Array };
const nativeDepth = (z: number) => Number.isInteger(z) && z >= -2147483648 && z <= 2147483647;

/** Invariants checked before export (spec §3); export refuses on any error. Stale items are warnings, not errors. */
export function validate(p: Project): string[] {
  const m = p.manifest, e = validateRig(m.rig);
  // IDs become archive paths and engine resource names; validate them before producing either.
  const id = /^[a-z0-9][a-z0-9_-]*$/;
  for (const [kind, rows] of [['slot', m.slots], ['material', m.materials], ['preset', m.presets]] as const) {
    const ids = new Set<string>();
    for (const row of rows) {
      if (!id.test(row.id)) e.push(`${kind} id "${row.id}" is invalid`);
      if (ids.has(row.id)) e.push(`duplicate ${kind} id ${row.id}`);
      ids.add(row.id);
    }
  }
  const itemIds = new Set<string>();
  for (const it of m.items) {
    const variant = it.variantOf && it.under && id.test(it.variantOf) && id.test(it.under) && it.id === `${it.variantOf}~${it.under}`;
    if (!id.test(it.id) && !variant) e.push(`item id "${it.id}" is invalid`);
    if (itemIds.has(it.id)) e.push(`duplicate item id ${it.id}`);
    itemIds.add(it.id);
    if (new Set(it.layers.map((l) => l.id)).size !== it.layers.length) e.push(`${it.id}: duplicate layer id`);
    if (it.designWarnings !== undefined && (!Array.isArray(it.designWarnings) || it.designWarnings.length > 100 || it.designWarnings.some((why) => typeof why !== 'string' || !why.trim() || why.length > 2000))) e.push(`${it.id}: invalid accepted appearance warnings`);
    if (it.paletteRepairs !== undefined && !validPaletteRepairs(it.paletteRepairs)) e.push(`${it.id}: invalid local palette repair history`);
  }
  for (const a of m.rig.animations) {
    if (!Number.isInteger(a.cells)) e.push(`${a.id}: cell count must be an integer`);
    for (const f of a.frames) if (!Number.isInteger(f.cell)) e.push(`${a.id}: frame cell ${f.cell} must be an integer`);
  }
  const bodies = m.items.filter((i) => i.slot === 'body' && !i.variantOf);
  if (bodies.length !== 1 || bodies[0].id !== m.rig.baseItem) e.push('exactly one item in slot "body" must be rig.baseItem');
  for (const variant of m.items.filter(i => i.slot === 'body' && i.variantOf)) {
    const cover = m.items.find(i => i.id === variant.under);
    if (variant.variantOf !== m.rig.baseItem || variant.id !== `${m.rig.baseItem}~${variant.under}` || !cover || cover.slot === 'body' || !m.slots.find(s => s.id === cover.slot)?.clips?.includes('body') || variant.baseHash !== m.rig.baseHash) e.push(`${variant.id}: invalid clipped body variant`);
  }
  for (const slot of m.slots) {
    if (!nativeDepth(slot.z) || slot.zOverrides?.some((o) => !nativeDepth(o.z))) e.push(`${slot.id}: slot and override depths must be finite integers in the signed 32-bit range`);
  }
  const seen = new Map<string, string>(), ids = new Set<string>();
  for (const mat of m.materials) {
    if (ids.has(mat.id)) e.push(`duplicate material ${mat.id}`);
    ids.add(mat.id);
    if (!m.items.some((it) => it.id === mat.owner)) e.push(`${mat.id}: unknown material owner ${mat.owner}`);
    for (const c of mat.ramp) {
      if (typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c)) { e.push(`${mat.id}: ramp colors must be six-digit #RRGGBB values`); continue; }
      const key = m.format === 'pixeldoll/2' ? `${mat.owner}:${c.toLowerCase()}` : c.toLowerCase();
      seen.has(key) ? e.push(`color ${c} in ramps ${seen.get(key)} and ${mat.id}`) : seen.set(key, mat.id);
    }
    for (const [v, r] of Object.entries(mat.variants)) {
      if (r.length !== mat.ramp.length) e.push(`${mat.id}.${v}: ${r.length} colors for a ${mat.ramp.length}-color ramp`);
      if (r.some((c) => typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c))) e.push(`${mat.id}.${v}: variant colors must be six-digit #RRGGBB values`);
    }
    if (mat.defaultVariant && mat.ramp.every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) && (m.format !== 'pixeldoll/2' || !variantRampOf(mat, mat.defaultVariant))) e.push(`${mat.id}: invalid default colorway`);
  }
  for (const mat of m.materials) if (mat.linkTo && !ids.has(mat.linkTo)) e.push(`${mat.id}: unknown linked material ${mat.linkTo}`);
  const mirrored = m.rig.directions.some((d) => d.mirrorOf);
  for (const it of m.items) {
    const single = it.layers.length === 1 && it.layers[0].id === 'main' && it.layers[0].role === 'fg';
    const split = it.layers.length === 2 && it.layers.some((l) => l.id === 'fg' && l.role === 'fg') && it.layers.some((l) => l.id === 'bg' && l.role === 'bg');
    if (!single && !split) e.push(`${it.id}: layers must be one main foreground layer or an fg/background bg pair`);
    for (const id of it.materials) {
      const mat = m.materials.find((x) => x.id === id);
      if (!mat || (mat.owner !== it.id && mat.owner !== it.variantOf)) e.push(`${it.id}: missing or foreign material ${id}`);
    }
    if (!m.slots.some((s) => s.id === it.slot)) e.push(`${it.id}: unknown slot ${it.slot}`);
    for (const l of it.layers) {
      if (!nativeDepth(l.z)) e.push(`${it.id}.${l.id}: layer depth must be a finite integer in the signed 32-bit range`);
      const f = layerFrame(m.rig, l);
      if (!['main', 'fg', 'bg'].includes(l.id) || !['fg', 'bg'].includes(l.role)) e.push(`${it.id}: invalid layer id or role`);
      if (![f.w, f.h, f.x, f.y].every(Number.isInteger) || f.w < 1 || f.h < 1 || f.w > 256 || f.h > 256 || f.x < 0 || f.x > f.w || f.y < 0 || f.y > f.h) e.push(`${it.id}.${l.id}: cell ${f.w}x${f.h} must be 1–256 px with an integer pivot inside the cell`);
      // a mirrored row is a flip of the whole layer cell: only correct if that cell is centered on the rig cell
      if (mirrored && 2 * (m.rig.pivot.x - f.x) + f.w !== m.rig.cell.w) e.push(`${it.id}.${l.id}: cell ${f.w} with pivot x ${f.x} is not centered on the rig cell (mirrored directions flip it)`);
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
  // Export is also a public API: do not depend on the Studio having materialized procedural swatches first.
  storeVariants(m, {}, ...m.presets.map((pr) => pr.variants));
  // A palette link can target a stale item. Freeze its resolved selections before dropping the excluded owner's metadata.
  const detached = m.materials.filter((mat) => ids.has(mat.owner) && mat.linkTo && !ids.has(m.materials.find((other) => other.id === mat.linkTo)?.owner ?? ''))
    .map((mat) => ({ mat, baseline: variantOf(m, {}, mat.id), selections: m.presets.map((pr) => variantOf(m, pr.variants, mat.id)) }));
  for (const { mat, baseline, selections } of detached) {
    delete mat.linkTo;
    delete mat.defaultVariant;
    if (m.format === 'pixeldoll/2' && baseline) mat.defaultVariant = baseline;
    m.presets.forEach((pr, i) => {
      if (selections[i]) pr.variants[mat.id] = selections[i];
      else delete pr.variants[mat.id];
    });
  }
  const materialIds = new Set(m.items.flatMap((it) => it.materials));
  for (const id of materialIds) {
    const linked = m.materials.find((mat) => mat.id === id)?.linkTo;
    if (linked) materialIds.add(linked);
  }
  m.materials = m.materials.filter((mat) => ids.has(mat.owner) && materialIds.has(mat.id));
  for (const pr of m.presets) for (const id of Object.keys(pr.variants)) if (!m.materials.some((mat) => mat.id === id)) delete pr.variants[id];
  for (const it of m.items)
    for (const l of it.layers) {
      const f = layerFrame(m.rig, l);
      delete l.cells;
      l.sheets = Object.fromEntries(m.rig.animations.map((a) => [a.id, sheetPath(it, l, a.id)]));
      if (it.materials.some((id) => variantOf(m, {}, id))) l.sourceSheets = Object.fromEntries(m.rig.animations.map((a) => [a.id, `sources/${sheetPath(it, l, a.id)}`]));
      else delete l.sourceSheets;
      Object.assign(l, { cell: { w: f.w, h: f.h }, pivot: { x: f.x, y: f.y } }); // explicit in manifest.json: readers never default
    }
  for (const pr of m.presets) for (const s in pr.items) if (pr.items[s] && !ids.has(pr.items[s]!)) pr.items[s] = null;
  // B10: the views each move has (the base has frames there); the other rows of its sheets are empty
  for (const a of m.rig.animations) {
    const directions = moveDirs(src, a.id);
    Object.assign(a, { directions });
    if (!directions.length) warnings.push(`${a.id}: no base frames; playback is unavailable for this move`);
  }
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

/** CREDITS.txt (CSV text; not .csv, which Godot imports as a translation table): one row per generating call (LPC credits spirit: every shipped sheet traceable to its source). */
export function creditsCsv(m: Manifest): string {
  const rows = [['item', 'name', 'slot', 'sheets', 'endpoint', 'jobId', 'seed', 'createdAt', 'prompt', 'source']];
  for (const it of m.items.filter((x) => !x.variantOf)) { // a tucked variant comes from its item's calls
    const sheets = it.layers.flatMap((l) => Object.values(l.sheets ?? {})).join(' ');
    for (const pv of it.provenance.length ? it.provenance : [undefined])
      rows.push([it.id, it.name, it.slot, sheets, pv?.endpoint ?? '', pv?.jobId ?? '', String(pv?.seed ?? ''), pv?.createdAt ?? '', it.prompt, 'PixelLab (https://pixellab.ai)']);
  }
  return [...new Set(rows.map((r) => r.map(csv).join(',')))].join('\n') + '\n'; // identical provenance steps once (T1 P2-7)
}

const ENGINE_START: Record<string, string> = {
  godot: 'Godot 4: copy this folder into your project and instance godot/Paperdoll.tscn (see godot/README.txt).',
  unity: 'Unity 6: copy this folder under Assets/; the importer builds a prefab in unity/Generated/ (see unity/README.txt).',
  phaser: 'Phaser 3.80+ / 4: copy this folder into your assets and use phaser/PaperdollContainer.js (see phaser/README.txt).',
  gdevelop: 'GDevelop: open gdevelop/game.json for an editable Sprite project with a paperdoll controller (see gdevelop/README.txt).',
  aseprite: 'Aseprite 1.3+ / zero code: open aseprite/<name>.aseprite, one layer per item (see aseprite/README.txt).',
  generic: 'Any engine: one PNG strip per layer, move and direction in generic/ (see generic/README.txt).',
};

/** Root README.txt: what is in the folder and how to start (T1 P2-6). */
export function readme(m: Manifest): string {
  const moves = m.rig.animations.map((a) => {
    const d = (a as { directions?: string[] }).directions;
    return `${a.id} (${a.cells} frames${d && d.length < m.rig.directions.length ? `, ${d.join(' + ')} only` : ''})`;
  });
  return `${m.name}: a paperdoll character exported by PixelDoll (${m.format}).

Quick start
${(m.export?.engines ?? []).map((e) => `  ${ENGINE_START[e] ?? e}`).join('\n')}

What is inside
  manifest.json   rig (cell ${m.rig.cell.w}x${m.rig.cell.h}, pivot ${m.rig.pivot.x},${m.rig.pivot.y}), moves, slots, items, colors and outfits
  layers/         one sheet per item layer and move: layers/<slot>/<item>/<layer>/<move>.png
                  rows = directions (${m.rig.directions.map((d) => d.id).join(', ')}), columns = frames${m.export?.baked ? `
  baked/          the finished character per outfit: baked/<outfit>/<move>.png` : ''}
  CREDITS.txt     where each item came from (PixelLab calls), CSV
  project.json   editable character for importing back into PixelDoll
  cells/         original frame and rest images for the editable copy

Outfit colors are baked into additional item layers, reused by matching outfits. The source layers remain available.
A colored body is a synced body_colour layer; its hidden original body remains the animation clock.

Moves: ${moves.join(', ')}.
A move lists the directions it has in rig.animations[].directions; its other sheet rows are empty.
Pixel art: use nearest-neighbor filtering and whole-pixel positions.
`;
}

/** Layer sheets (all engines need them) + README + manifest + credits. */
export function coreFiles(p: Project, m: Manifest): OutFile[] {
  const files: OutFile[] = [{ name: 'README.txt', data: readme(m) }, { name: 'manifest.json', data: JSON.stringify(m, null, 2) + '\n' }, { name: 'CREDITS.txt', data: creditsCsv(m) }];
  const byId = new Map(p.manifest.items.map((i) => [i.id, i]));
  const defaults = recolor(p, {});
  for (const it of m.items)
    for (const l of it.layers) {
      const srcLayer = byId.get(it.id)!.layers.find((x) => x.id === l.id)!;
      for (const a of m.rig.animations) {
        files.push({ name: l.sheets![a.id], data: layerSheet(l.sourceSheets ? defaults : p, srcLayer, a.id) });
        if (l.sourceSheets?.[a.id]) files.push({ name: l.sourceSheets[a.id], data: layerSheet(p, srcLayer, a.id) });
      }
    }
  return files;
}

/** generic/<item>_<layer>/<anim>_<dir>_strip<N>.png and baked/<preset>/<anim>.png (reuses the layer sheets already built).
 * Canonical layer sheets render approved defaults; sourceSheets retain source ramps. Baked sheets apply each preset. */
export function genericFiles(p: Project, m: Manifest, sheets: Map<string, Img>, o: { strips: boolean; baked: boolean }): OutFile[] {
  const files: OutFile[] = [];
  const { rig } = m;
  if (o.strips) for (const it of m.items)
    for (const l of it.layers)
      for (const a of rig.animations)
        rig.directions.forEach((d, r) => {
          const strip = sheetRow(sheets.get(l.sheets![a.id])!, r, layerFrame(rig, l).h);
          if (strip.data.some((v, i) => i % 4 === 3 && v)) files.push({ name: `generic/${it.id}_${l.id}/${a.id}_${d.id}_strip${a.cells}.png`, data: strip }); // no empty strips
        });
  if (o.strips) files.push({ name: 'generic/README.txt', data: `One PNG strip per item layer, move and direction: <item>_<layer>/<move>_<direction>_strip<frames>.png.
Frames sit left to right, each one cell of the layer (manifest.json items[].layers[].cell); columns are zero-based source cell indices.
Play rig.animations[].frames in order: use each entry's cell column for ms milliseconds, including repeated indices. Repeat only when loop is true.
The _stripN suffix lets GameMaker split the image on import; it does not encode the playlist, frame durations or origin.
Place every layer at character position minus layers[].pivot; oversize layers have their own cell and pivot.
The base is always worn. Resolve slot hiding, tucked variants (variantOf/under) and z order (layers[].z, slots[].zOverrides) from manifest.json.
A strip a move does not have (rig.animations[].directions) or an item has no frames for is left out. Mirrored rows are already flipped.
These strips and layers/ render approved default colorways. To recolor, start from sourceSheets when present (otherwise sheets),
replace each item's material ramp by the selected variant ramp, and follow linkTo/defaultVariant. All outfit ramps are stored in materials[].variants.
Baked sheets in baked/ apply the outfit's colors and layer visibility; their cell and pivot are export.bakedCell and export.bakedPivot.
Use nearest-neighbor filtering, whole-pixel positions and straight RGBA alpha. This is a PNG + JSON interchange format; engine playback needs integration.
` });
  const bf = bakedFrame(m);
  const ids = new Set(m.items.map((it) => it.id));
  const exported = { ...p, manifest: { ...p.manifest, materials: m.materials, items: p.manifest.items.filter((it) => ids.has(it.id)) } };
  if (o.baked) for (const pr of m.presets) for (const a of rig.animations) files.push({ name: `baked/${pr.id}/${a.id}.png`, data: bakedSheet(recolor(exported, pr.variants), pr.items, a.id, bf) });
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
  console.assert(warnings.some((warning) => warning.includes('old: stale')) && m.items.length === 1 && m.presets[0].items.head === null, 'stale item excluded and unequipped');
  console.assert(!m.items[0].layers[0].cells && m.items[0].layers[0].sheets!.walk === 'layers/body/base/main/walk.png', 'cells -> sheets');
  console.assert(m.export!.pixelsPerUnit === 64 && m.export!.baked![0] === 'default' && !!p.manifest.items[0].layers[0].cells, 'export info, source untouched');
  console.assert(creditsCsv(m).split('\n')[1].includes('"p, ""q"""'), 'csv quoting');
  const pv = { endpoint: '/x', seed: 7, createdAt: 'T' };
  console.assert(creditsCsv({ ...m, items: [{ ...m.items[0], provenance: [pv, pv] }] } as Manifest).trim().split('\n').length === 2, 'credits: identical steps once');
  console.assert((m.rig.animations[0] as { directions?: string[] }).directions!.length === 0 && readme(m).includes('Quick start'), 'move directions (empty base = none) + README');
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
  console.assert(validate(p).some((x) => x.includes('not centered')), 'oversize: off-center cell rejected when mirrored');
  L96.pivot.x = 48;
  const m2 = exportManifest(p, { engines: ['generic'], baked: true }).manifest;
  console.assert(m2.export!.bakedCell!.w === 96 && m2.export!.bakedPivot!.y === 76 && m2.items[1].layers[0].cell!.h === 96, 'oversize: baked cell = union of layers');
}
