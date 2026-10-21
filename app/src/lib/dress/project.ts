// Dress-up persistence (browser): open a fixture or an IndexedDB project, save outfit presets + materials + z overrides.
// IndexedDB projects (M2/M3 records with a manifest) are written back in place; fixtures get a side record "dress-<source>".
import { loadFixture } from '../compose/fixture.ts';
import { loadProject } from '../store/project.ts';
import * as db from '../store/db.ts';
import type { Manifest, Material, Preset, Project, ZOverride } from '../store/manifest.ts';

export interface Outfit { items: Preset['items']; variants: Preset['variants'] }
export interface DressState { materials: Material[]; presets: Preset[]; zOverrides: Record<string, ZOverride[]>; hides: Record<string, string[] | null>; current?: Outfit }
interface ProjectRecord { id: string; manifest?: Manifest; dress?: { current?: Outfit } }

export const FIXTURES = ['s2', 's1'];

/** Sources: "fixture:<name>" and every IndexedDB project record holding a pixeldoll/1 manifest. */
export async function listSources(): Promise<{ id: string; label: string }[]> {
  const recs = (await db.all<ProjectRecord>('projects')).filter((r) => r?.manifest?.format === 'pixeldoll/1');
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
  materials: m.materials,
  presets: m.presets,
  zOverrides: Object.fromEntries(m.slots.map((s) => [s.id, s.zOverrides ?? []])),
  hides: Object.fromEntries(m.items.map((it) => [it.id, it.hides ?? null])),
  current,
});

/** Overlay a saved dress state; item.materials are rebuilt from material owners. */
export function applyDress(m: Manifest, d: DressState) {
  m.materials = structuredClone(d.materials);
  m.presets = structuredClone(d.presets);
  for (const s of m.slots) if (d.zOverrides[s.id]) s.zOverrides = structuredClone(d.zOverrides[s.id]);
  for (const it of m.items) {
    it.materials = m.materials.filter((x) => x.owner === it.id).map((x) => x.id);
    const h = d.hides?.[it.id];
    if (h !== undefined) h ? (it.hides = [...h]) : delete it.hides;
  }
}

/** Save. For IndexedDB projects: one atomic read-modify-write (db.update), so concurrent item writes are kept (R6 P1-5). */
export async function saveDress(id: string, m: Manifest, current: Outfit) {
  const d = structuredClone(dressOf(m, current));
  if (id.startsWith('fixture:')) return db.put('projects', `dress-${id}`, { id: `dress-${id}`, kind: 'dress', ...d });
  await db.update<ProjectRecord>('projects', id, (rec) => {
    if (!rec?.manifest) throw new Error(`project ${id} vanished`);
    applyDress(rec.manifest, d);
    rec.dress = { current: d.current };
    return rec;
  });
}
