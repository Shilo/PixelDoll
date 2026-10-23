// Dress-up persistence (browser): open a fixture or an IndexedDB project, save outfit presets + materials + z overrides.
// IndexedDB projects (M2/M3 records with a manifest) are written back in place; fixtures get a side record "dress-<source>".
import { loadFixture } from '../compose/fixture.ts';
import { loadProject, type StoredProject } from '../store/project.ts';
import { stableStringify } from '../image/hash.ts';
import * as db from '../store/db.ts';
import type { Manifest, Material, Preset, Project, ZOverride } from '../store/manifest.ts';
import { supportedFormat } from '../store/manifest.ts';
import type { Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';

export interface Outfit { items: Preset['items']; variants: Preset['variants'] }
export interface DressState { materials: Material[]; presets: Preset[]; zOverrides: Record<string, ZOverride[]>; hides: Record<string, string[] | null>; current?: Outfit; itemIds?: string[] }
interface ProjectRecord { id: string; manifest?: Manifest; dress?: { current?: Outfit }; character?: StoredProject['character']; moveRecovery?: StoredProject['moveRecovery'] }

export const FIXTURES = ['s2', 's1'];

/** Sources: "fixture:<name>" and every IndexedDB project record holding a pixeldoll/1 manifest. */
export async function listSources(): Promise<{ id: string; label: string }[]> {
  const recs = (await db.all<ProjectRecord>('projects')).filter((r) => supportedFormat(r?.manifest?.format) && r.id?.startsWith('rig-'));
  return [
    ...FIXTURES.map((f) => ({ id: `fixture:${f}`, label: `fixture ${f}` })),
    ...recs.map((r) => ({ id: r.id, label: `${r.manifest!.name} · ${r.id} · ${r.manifest!.items.length} items` })),
  ];
}

export async function openSource(id: string): Promise<{ project: Project; current?: Outfit }> {
  if (id.startsWith('fixture:')) {
    const name = id.slice(8);
    const project = await loadFixture(async (p) => new Uint8Array(await (await fetch(`./fixtures/${name}/${p}`)).arrayBuffer()));
    const saved = await db.get<DressState>('projects', `dress-${id}`).catch(() => undefined);
    if (saved) applyDress(project.manifest, saved);
    return { project, current: saved?.current };
  }
  const { rec, project } = await loadProject(id); // B4's loader (store/project.ts)
  return { project, current: (rec as ProjectRecord).dress?.current };
}

export const dressOf = (m: Manifest, current?: Outfit): DressState => ({
  itemIds: m.items.map((it) => it.id),
  materials: m.materials,
  presets: m.presets,
  zOverrides: Object.fromEntries(m.slots.map((s) => [s.id, s.zOverrides ?? []])),
  hides: Object.fromEntries(m.items.map((it) => [it.id, it.hides ?? null])),
  current,
});

/** Overlay a saved dress state; item.materials are rebuilt from material owners. */
export function applyDress(m: Manifest, d: DressState) {
  // An older autosave does not own items added after its snapshot. Retain their palettes, while allowing palette removal
  // for items that the snapshot actually covered. Never restore materials for an item already removed in another action.
  const owners = new Set([...(d.itemIds ?? []), ...d.materials.map((x) => x.owner)]), current = new Set(m.items.map((it) => it.id));
  m.materials = [...structuredClone(d.materials).filter((x) => current.has(x.owner)), ...m.materials.filter((x) => current.has(x.owner) && !owners.has(x.owner))];
  m.presets = structuredClone(d.presets);
  for (const s of m.slots) if (d.zOverrides[s.id]) s.zOverrides = structuredClone(d.zOverrides[s.id]);
  for (const it of m.items) {
    it.materials = m.materials.filter((x) => x.owner === it.id).map((x) => x.id);
    const h = d.hides?.[it.id];
    if (h !== undefined) h ? (it.hides = [...h]) : delete it.hides;
  }
}

/** B15: persist a base region split (splitBase + deriveMaterials ran on `m`): new cell blobs, then one atomic update of the
 * base cells, regions mark, base materials, baseHash and the items moved from the old hash. */
export async function saveSplit(id: string, m: Manifest, split: { oldHash: string; images: Map<string, Img> }) {
  const blobs = new Map<string, Blob>();
  for (const [h, im] of split.images) blobs.set(h.slice(7), new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
  const base = m.items.find((i) => i.id === m.rig.baseItem)!;
  await db.updateCharacter<ProjectRecord>(id, blobs, (rec) => {
    if (!rec?.manifest) throw new Error(`project ${id} vanished`);
    const cur = rec.manifest, cb = cur.items.find((i) => i.id === cur.rig.baseItem)!;
    if (cur.rig.baseHash === m.rig.baseHash && cur.rig.baseHash !== split.oldHash && cb.regions === base.regions) return rec; // another tab completed the same split
    if (cur.rig.baseHash !== split.oldHash && cur.rig.baseHash !== m.rig.baseHash) throw new Error('This character changed while preparing its colours. Open it again before editing.');
    const receiptMatches = rec.moveRecovery?.bodyRigVersion === stableStringify({ rig: cur.rig, character: rec.character });
    cb.layers = structuredClone(base.layers);
    cb.regions = base.regions;
    cb.materials = [...base.materials];
    cur.materials = [...cur.materials.filter((x) => x.owner !== cb.id), ...structuredClone(m.materials.filter((x) => x.owner === cb.id))];
    if (cur.rig.baseHash === split.oldHash) {
      cur.rig.baseHash = m.rig.baseHash;
      for (const it of cur.items) if (it.baseHash === split.oldHash) it.baseHash = m.rig.baseHash;
    }
    if (receiptMatches && rec.moveRecovery) rec.moveRecovery = { ...rec.moveRecovery, bodyRigVersion: stableStringify({ rig: cur.rig, character: rec.character }) };
    return rec;
  });
}

/** Save. For IndexedDB projects: one atomic read-modify-write (db.update), so concurrent item writes are kept (R6 P1-5). */
export async function saveDress(id: string, m: Manifest, current: Outfit) {
  const d = structuredClone(dressOf(m, current));
  if (id.startsWith('fixture:')) return db.put('projects', `dress-${id}`, { id: `dress-${id}`, kind: 'dress', ...d });
  await db.update<ProjectRecord>('projects', id, (rec) => {
    if (!rec?.manifest) throw new Error(`project ${id} vanished`);
    const manifest = rec.manifest, live = new Set(manifest.items.map((it) => it.id));
    const known = new Set([...(d.itemIds ?? Object.keys(d.hides ?? {})), ...d.materials.map((mat) => mat.owner)]);
    const retained = rec.dress?.current;
    // A fit accepted after this snapshot owns its new materials and current equipped slot/variant selection.
    const newSlots = Object.entries(retained?.items ?? {}).filter(([, item]) => item && live.has(item) && !known.has(item));
    const materials = [...d.materials.filter((mat) => live.has(mat.owner)), ...manifest.materials.filter((mat) => live.has(mat.owner) && !known.has(mat.owner))];
    const materialIds = new Set(materials.map((mat) => mat.id));
    for (const mat of materials) if (mat.linkTo && !materialIds.has(mat.linkTo)) delete mat.linkTo;
    const extraVariants = Object.fromEntries(Object.entries(retained?.variants ?? {}).filter(([id]) => materials.some((mat) => mat.id === id && !known.has(mat.owner))));
    const current = d.current && { items: { ...d.current.items, ...Object.fromEntries(newSlots) }, variants: { ...d.current.variants, ...extraVariants } };
    const cleaned = { ...d, materials, current };
    for (const preset of [...cleaned.presets, ...(current ? [current] : [])]) {
      for (const slot of Object.keys(preset.items)) if (preset.items[slot] && !live.has(preset.items[slot]!)) preset.items[slot] = null;
      for (const material of Object.keys(preset.variants)) if (!materialIds.has(material)) delete preset.variants[material];
    }
    applyDress(manifest, cleaned);
    rec.dress = { current };

    return rec;
  });
}
