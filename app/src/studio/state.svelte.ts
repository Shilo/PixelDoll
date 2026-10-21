// Studio state: UI (size class, theme, tabs, sheets, playback), the open project + outfit with undo/redo and autosave,
// item generations (drafts) and the create-character run. Pixel data lives in $state.raw (deep proxies over the manifest
// made recolour/compose take seconds, B5); manifest edits bump doc.rev.
import { applyDress, dressOf, openSource, saveDress, saveSplit, type DressState } from '../lib/dress/project.ts';
import { splitBase } from '../lib/dress/regions.ts';
import { deriveMaterials, randomOutfit, recolour, storeVariants } from '../lib/dress/dress.ts';
import { drawList } from '../lib/compose/compose.ts';
import { deleteItem, listProjects, loadProject, originOf } from '../lib/store/project.ts';
import * as db from '../lib/store/db.ts';
import type { DirectionName, Manifest, Preset, Project, ZOverride } from '../lib/store/manifest.ts';
import { evaluateItem, loadDrafts, type Draft, type ItemResult } from '../lib/items/run.ts';
import { SLOTS } from '../lib/items/items.ts';
import { app } from '../lib/app.svelte.ts';
import { itemRoute, type NewItemInput } from './itemRoute.ts';
import { addMove, createCharacter, saveCopy, type CreateSpec, type MoveSpec, type Progress } from './create.ts';
import { GROUPS, groupOf, uniqueBy } from './model.ts';
import { queue, type JobRec } from '../lib/pixellab/queue.ts';

// ---------- small persistence helpers (every storage access can throw: private mode, blocked site data) ----------
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ } };
const K = { theme: 'pixeldoll.theme', welcomed: 'pixeldoll.welcomed', last: 'pixeldoll.studio.project' };
export const DEMO = 'fixture:s2';

// ---------- UI ----------
export type Size = 'expanded' | 'medium' | 'compact' | 'landscape';
export type SheetId = null | 'connect' | 'create' | 'newitem' | 'export' | 'activity' | 'item' | 'move' | 'rename';
const sizeNow = (): Size => {
  const w = innerWidth, h = innerHeight;
  if (h < 500 && w > h) return 'landscape';
  if (w < 600 || (w < 1024 && h > w)) return 'compact'; // B10: portrait tablets stack stage over wardrobe (T1 P1-3)
  if (w < 1024) return 'medium';
  return 'expanded';
};

export const ui = $state({
  size: sizeNow(),
  dpr: devicePixelRatio || 1,
  theme: (lsGet(K.theme) === 'light' ? 'light' : 'dark') as 'light' | 'dark',
  welcome: !lsGet(K.welcomed),
  sidebar: true,
  inspector: true,
  drawer: innerWidth >= 900, // medium size: wardrobe pane, pushes the stage
  tab: 'wardrobe' as 'wardrobe' | 'colours' | 'moves', // phone
  inspTab: 'item' as 'item' | 'colours' | 'moves',
  group: 'Head',
  selected: '', // item id, or "gen:<draft id>"
  sheet: null as SheetId,
  newItem: { group: 'Head', slot: '', prompt: '' },
  anim: '',
  dir: 'south' as DirectionName,
  all: false,
  playing: !matchMedia('(prefers-reduced-motion: reduce)').matches, // reduced motion: start paused, Play is one tap
  frame: 0,
  zoom: 0, // device px per sprite px; 0 = fit
  bg: 'checker' as 'checker' | 'solid',
  toast: '',
});
let afterConnect: (() => void) | null = null;

export function initUi() {
  const on = () => { ui.size = sizeNow(); ui.dpr = devicePixelRatio || 1; };
  addEventListener('resize', on);
  applyTheme();
  return () => removeEventListener('resize', on);
}
export function applyTheme() { document.documentElement.dataset.theme = ui.theme; }
export function toggleTheme() { ui.theme = ui.theme === 'dark' ? 'light' : 'dark'; lsSet(K.theme, ui.theme); applyTheme(); }
export function dismissWelcome() { ui.welcome = false; lsSet(K.welcomed, '1'); }
let toastT: ReturnType<typeof setTimeout> | undefined;
export function toast(s: string) { ui.toast = s; clearTimeout(toastT); toastT = setTimeout(() => (ui.toast = ''), 4000); }

/** Only the queue-leader tab drives generations (R6 P1-1). True (with a toast) in a second PixelDoll tab, which only mirrors. */
const follower = () => queue.role === 'follower' && (toast('PixelDoll is open in another tab. Generate there, or close it to generate here.'), true);

/** Run a spending action; without a key the Connect sheet opens first and the action runs once a key is set. */
export function withKey(fn: () => void) {
  if (follower()) return;
  if (app.key && !app.keyRejected) return fn();
  afterConnect = fn;
  ui.sheet = 'connect';
}
export function connected() {
  const f = afterConnect;
  afterConnect = null;
  ui.sheet = null;
  f?.();
}

// ---------- project + outfit ----------
export interface ProjectRef { id: string; name: string; demo: boolean; dev: boolean; savedAt: string }
class Store {
  project = $state.raw<Project | null>(null);
  projects = $state.raw<ProjectRef[]>([]);
  results = $state.raw<Record<string, ItemResult | null>>({});
}
export const store = new Store();
export const doc = $state({
  id: '',
  loading: true,
  error: '',
  rev: 0,
  items: {} as Preset['items'],
  variants: {} as Preset['variants'],
  saved: '',
  undo: [] as { label: string; snap: string }[],
  redo: [] as { label: string; snap: string }[],
});
export const isDemo = () => doc.id.startsWith('fixture:');

/** What the stage shows: the project with the selected colour variants swapped in (exact ramp swap), and the playing cell. */
class View {
  project = $derived.by(() => {
    void doc.rev;
    const p = store.project;
    return p ? recolour(p, $state.snapshot(doc.variants)) : null;
  });
  anim = $derived(store.project?.manifest.rig.animations.find((a) => a.id === ui.anim));
  cell = $derived(this.anim ? this.anim.frames[ui.frame % this.anim.frames.length].cell : 0);
}
export const view = new View();

export async function refreshProjects() {
  const own = (await listProjects().catch(() => [])).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  store.projects = [{ id: DEMO, name: 'Adventurer (demo)', demo: true, dev: false, savedAt: '' }, ...own.map((p) => ({ id: p.id, name: p.manifest.name, demo: false, dev: originOf(p) === 'dev', savedAt: p.savedAt }))];
}

export async function openProject(id: string, keep?: { wear?: string }) {
  doc.loading = true;
  doc.error = '';
  try {
    const r = await openSource(id);
    const split = await splitBase(r.project); // B15: shirt / shorts colour regions on the base (idempotent; fixtures in memory)
    deriveMaterials(r.project); // items without materials (new items, fresh fixtures)
    if (split.dirty && !id.startsWith('fixture:')) await saveSplit(id, r.project.manifest, split);
    const m = r.project.manifest;
    const pr = r.current ?? m.presets[0] ?? { items: {}, variants: {} };
    doc.items = { ...pr.items };
    doc.variants = { ...pr.variants };
    if (keep?.wear) { const it = m.items.find((i) => i.id === keep.wear); if (it) doc.items[it.slot] = it.id; }
    doc.undo = [];
    doc.redo = [];
    doc.id = id;
    if (!m.rig.animations.some((a) => a.id === ui.anim)) ui.anim = (m.rig.animations.find((a) => a.id === 'walk') ?? m.rig.animations[0]).id;
    if (!m.rig.directions.some((d) => d.id === ui.dir)) ui.dir = m.rig.directions[0].id;
    ui.frame = 0;
    store.project = r.project;
    ui.selected = keep?.wear ?? m.items.find((i) => i.id !== m.rig.baseItem && doc.items[i.slot] === i.id)?.id ?? '';
    if (ui.selected) ui.group = groupOf(m.items.find((i) => i.id === ui.selected)!.slot).id;
    lsSet(K.last, id);
    doc.rev++;
  } catch (e) {
    doc.error = (e as Error).message;
    if (id !== DEMO) return openProject(DEMO);
  } finally {
    doc.loading = false;
  }
}
export const lastProject = () => lsGet(K.last) ?? DEMO;

// ---- undo/redo: snapshots of the dress state (outfit, colours, presets, layer order, hides) ----
const snap = () => JSON.stringify(dressOf(store.project!.manifest, { items: $state.snapshot(doc.items), variants: $state.snapshot(doc.variants) }));
function restore(s: string) {
  const d = JSON.parse(s) as DressState;
  applyDress(store.project!.manifest, d);
  doc.items = { ...d.current!.items };
  doc.variants = { ...d.current!.variants };
  bump();
  save();
}
/** Every user edit goes through here: undo entry, apply, re-render, autosave. */
export function commit(label: string, fn: () => void) {
  if (!store.project) return;
  doc.undo = [...doc.undo.slice(-99), { label, snap: snap() }];
  doc.redo = [];
  fn();
  bump();
  save();
}
/** Manifest edits are in place; a new top-level object lets every `$derived(store.project.manifest)` see the change. */
function bump() {
  const p = store.project!;
  store.project = { manifest: { ...p.manifest }, images: p.images };
  doc.rev++;
}
export function undo() {
  const e = doc.undo.at(-1);
  if (!e) return;
  doc.redo = [...doc.redo, { label: e.label, snap: snap() }];
  doc.undo = doc.undo.slice(0, -1);
  restore(e.snap);
}
export function redo() {
  const e = doc.redo.at(-1);
  if (!e) return;
  doc.undo = [...doc.undo, { label: e.label, snap: snap() }];
  doc.redo = doc.redo.slice(0, -1);
  restore(e.snap);
}

let saveT: ReturnType<typeof setTimeout> | undefined;
function save() {
  clearTimeout(saveT);
  const id = doc.id, m = store.project?.manifest;
  if (!m) return;
  saveT = setTimeout(async () => {
    const cur = { items: $state.snapshot(doc.items), variants: $state.snapshot(doc.variants) };
    storeVariants(m, cur.variants);
    try { await saveDress(id, m, cur); doc.saved = new Date().toLocaleTimeString(); } catch (e) { console.error('autosave', e); toast(`Could not save: ${(e as Error).message}`); }
  }, 400);
}

// ---- edits ----
const itemById = (id: string) => store.project?.manifest.items.find((i) => i.id === id);
export function wear(id: string) {
  const it = itemById(id);
  if (!it) return;
  const on = doc.items[it.slot] === id;
  commit(`${on ? 'Take off' : 'Wear'} ${it.name}`, () => { doc.items[it.slot] = on ? null : id; });
  ui.selected = id;
}
export function clearSlots(slots: string[]) {
  commit('Take off', () => { for (const s of slots) doc.items[s] = null; });
}
export function setVariant(matId: string, name: string | null) {
  commit('Colour change', () => { if (name == null) delete doc.variants[matId]; else doc.variants[matId] = name; });
}
export function resetColours(matIds?: string[]) {
  commit('Reset colours', () => { for (const k of matIds ?? Object.keys(doc.variants)) delete doc.variants[k]; });
}
export function randomize() {
  const r = randomOutfit(store.project!.manifest);
  commit('Random look', () => { doc.items = { ...r.items, body: store.project!.manifest.rig.baseItem }; doc.variants = r.variants; });
}
export function applyPreset(p: Preset) {
  commit(`Wear ${p.name}`, () => { doc.items = { ...p.items }; doc.variants = { ...p.variants }; });
}
export function savePreset(name: string) {
  const m = store.project!.manifest;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `outfit-${m.presets.length + 1}`;
  commit('Save outfit', () => {
    const pr: Preset = { id, name, items: $state.snapshot(doc.items), variants: $state.snapshot(doc.variants) };
    m.presets = [...m.presets.filter((p) => p.id !== id), pr];
  });
}
export function deletePreset(id: string) {
  const m = store.project!.manifest;
  commit('Delete outfit', () => { m.presets = m.presets.filter((p) => p.id !== id); });
}
export const sameOutfit = (p: Preset) =>
  Object.keys({ ...p.items, ...doc.items }).every((k) => (p.items[k] ?? null) === (doc.items[k] ?? null) || k === 'body') &&
  JSON.stringify(Object.entries(p.variants).sort()) === JSON.stringify(Object.entries($state.snapshot(doc.variants)).sort());

export function toggleHide(itemId: string, slot: string) {
  const m = store.project!.manifest, it = itemById(itemId)!;
  const cur = it.hides ?? m.slots.find((s) => s.id === it.slot)?.hides ?? [];
  commit(`${cur.includes(slot) ? 'Show' : 'Hide'} ${slot}`, () => { it.hides = cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot]; });
}

/** Move the item's front layer one step in the draw order of the current frame (all directions, or only the current one). */
export function moveLayer(itemId: string, step: 1 | -1, onlyDir: boolean) {
  const m = store.project!.manifest, it = itemById(itemId)!;
  const a = m.rig.animations.find((x) => x.id === ui.anim)!, cell = a.frames[ui.frame % a.frames.length].cell;
  const order = drawList(m, $state.snapshot(doc.items), ui.anim, ui.dir, cell);
  const i = order.findIndex((d) => d.item.id === itemId && d.layer.role === 'fg');
  const j = i + step;
  if (i < 0 || j < 0 || j >= order.length) return;
  const nz = order[j].z + step; // just past the neighbour
  const slot = m.slots.find((s) => s.id === it.slot)!;
  const o: ZOverride = { layer: 'fg', z: nz, ...(onlyDir ? { dir: ui.dir } : {}) };
  commit(step > 0 ? 'Bring forward' : 'Send backward', () => {
    slot.zOverrides = [...(slot.zOverrides ?? []).filter((x) => !(x.layer === 'fg' && x.dir === o.dir && !x.anim && x.cell == null)), o];
  });
}
export function resetLayer(itemId: string) {
  const m = store.project!.manifest, slot = m.slots.find((s) => s.id === itemById(itemId)!.slot)!;
  commit('Reset layer order', () => { slot.zOverrides = structuredClone(SLOTS.find((s) => s.id === slot.id)?.zOverrides ?? []); }); // ladder default (T3)
}

export async function removeItem(itemId: string) {
  const it = itemById(itemId);
  if (!it || isDemo()) return;
  await deleteItem(doc.id, itemId);
  toast(`Removed ${it.name}`);
  await openProject(doc.id);
}

/** The demo is a bundled fixture; items are generated into an editable copy in IndexedDB. */
export async function copyDemo(): Promise<string> {
  const id = await saveCopy(store.project!, 'Adventurer copy');
  await refreshProjects();
  await openProject(id);
  return id;
}

/** Rename the open (own) character: the manifest name is also the exported name. */
export async function renameProject(name: string) {
  if (isDemo()) return;
  const ok = await db.update<{ manifest?: Manifest }>('projects', doc.id, (rec) => {
    if (!rec?.manifest) throw new Error('gone');
    rec.manifest.name = name;
    return rec;
  }).then(() => true, () => false);
  if (!ok) return;
  store.project!.manifest.name = name;
  bump();
  await refreshProjects();
}

/** Wardrobe tap: wear an item that is off; a worn item is only selected (take it off with its check or "None"). */
export function pick(id: string) {
  const it = itemById(id);
  if (it && doc.items[it.slot] !== id) wear(id);
  else ui.selected = id;
}

// ---------- item generations ----------
export interface Gen { draft: Draft; input: NewItemInput; phase: 'running' | 'review' | 'failed'; status: string; error?: string }
export const gens = $state<Gen[]>([]);
const GENS_KEY = 'studio-drafts'; // projects store, no `manifest` -> ignored by project listings
const saveGens = () => db.put('projects', GENS_KEY, { id: GENS_KEY, gens: $state.snapshot(gens) });

// One runner per draft: a second runItem on the same draft (e.g. the Studio remounting and loading the drafts again)
// re-rolls calls twice and pays twice (seen live). Drafts load once per page.
// Only the queue leader runs drafts, creates and moves (R6 P1-1: two tabs re-rolled the same draft and overwrote each
// other's studio-drafts). A follower tab shows the leader's drafts, re-read when the ledger changes, and takes over when
// the leader's tab closes.
const runningGens = new Set<string>();
let loading: Promise<void> | null = null, gensReady = false, driving = false, takingOver = false, mirrored = '', mirrorAt = 0;
const readGens = async () => uniqueBy((await db.get<{ gens: Gen[] }>('projects', GENS_KEY).catch(() => undefined))?.gens ?? [], (g) => g.draft.spec.id);
/** The ONLY way the list is replaced: one entry per draft id (already-persisted duplicates heal on the next save). Synchronous,
 * so no caller can splice with a length read before an await (the B13 regression that doubled every draft). */
function setGens(list: Gen[]) {
  const uniq = uniqueBy(list, (g) => g.draft.spec.id);
  mirrored = JSON.stringify(uniq);
  gens.splice(0, gens.length, ...uniq);
}
/** Once per page (a second call, e.g. a Studio remount, returns the same promise). */
export function loadGens(): Promise<void> {
  return (loading ??= (async () => {
    setGens(await readGens());
    gensReady = true;
    if (queue.role !== 'follower') drive();
    else for (const g of gens) if (g.phase === 'review') void evalGen(g);
  })());
}
function drive() {
  if (driving) return;
  driving = true;
  for (const g of gens) if (g.phase === 'running') void runGen(g);
    else if (g.phase === 'review') void evalGen(g);
  void cleanUp(WEEK, false).catch((e) => console.error('cleanup', e)); // R6 P2-14: prune week-old records nothing needs (blobs: Clear finished only)
}
queue.subscribe((s) => {
  if (!gensReady || driving) return;
  if (s.role !== 'follower') { void takeOver(); return; }
  if (Date.now() - mirrorAt < 2000) return;
  mirrorAt = Date.now();
  void readGens().then((list) => {
    if (driving || JSON.stringify(list) === mirrored) return;
    setGens(list);
    for (const g of gens) if (g.phase === 'review' && !store.results[g.draft.spec.id]) void evalGen(g);
  });
});
/** This follower tab just became the leader: continue the old leader's drafts, create and move. */
async function takeOver() {
  if (driving || takingOver) return;
  takingOver = true;
  const list = await readGens();
  if (driving) return;
  setGens(list);
  drive();
  await resumeCreate();
  await resumeMove();
}

export async function startItem(input: NewItemInput) {
  const ctx = await loadProject(doc.id);
  const taken = gens.map((g) => g.draft.spec.id);
  gens.push({ draft: itemRoute.draft(ctx, input, taken), input, phase: 'running', status: 'Starting' });
  const g = gens.at(-1)!;
  ui.selected = `gen:${g.draft.spec.id}`;
  ui.group = groupOf(input.slot).id;
  await saveGens();
  void runGen(g, ctx);
}
async function runGen(g: Gen, ctx?: Awaited<ReturnType<typeof loadProject>>) {
  const id = g.draft.spec.id;
  if (runningGens.has(id)) return;
  runningGens.add(id);
  try { await runGenOnce(g, ctx); } finally { runningGens.delete(id); }
}
async function runGenOnce(g: Gen, ctx?: Awaited<ReturnType<typeof loadProject>>) {
  g.phase = 'running';
  g.error = undefined;
  try {
    ctx ??= await loadProject(g.draft.rigId);
    const res = await itemRoute.run(g.draft, ctx, {
      status: (s) => (g.status = s === 'design call' ? 'Designing' : 'Adding the other moves'),
      persist: saveGens,
      result: (r) => (store.results = { ...store.results, [g.draft.spec.id]: r }),
    });
    store.results = { ...store.results, [g.draft.spec.id]: res };
    g.phase = res?.qa && res.cells.length ? 'review' : 'failed';
    if (g.phase === 'failed') g.error = g.draft.log.at(-1) ?? 'PixelLab did not return usable frames';
    g.status = '';
  } catch (e) {
    g.phase = 'failed';
    g.error = (e as Error).message;
  }
  await saveGens();
  if (g.phase === 'review') toast(`${g.input.name} is ready to review`);
}
async function evalGen(g: Gen) {
  const ctx = await loadProject(g.draft.rigId);
  store.results = { ...store.results, [g.draft.spec.id]: await evaluateItem(g.draft, ctx) };
}
export const genOf = (sel: string) => gens.find((g) => `gen:${g.draft.spec.id}` === sel);

// Keep it / Discard in flight for a draft: the other click is ignored (R6 P1-6: Discard during Keep it, then
// splice(indexOf(g) = -1) removed an unrelated, still-running draft).
const settling = new Set<string>();
const drop = (g: Gen) => { const i = gens.findIndex((x) => x.draft.spec.id === g.draft.spec.id); if (i >= 0) gens.splice(i, 1); };
export async function acceptGen(g: Gen) {
  const id = g.draft.spec.id;
  if (follower() || settling.has(id)) return;
  settling.add(id);
  try {
    const ctx = await loadProject(g.draft.rigId);
    const item = await itemRoute.accept(g.draft, ctx, store.results[id] ?? undefined);
    drop(g);
    await saveGens();
    if (doc.id === g.draft.rigId) await openProject(doc.id, { wear: item.id });
    toast(`${item.name} added`);
  } finally {
    settling.delete(id);
  }
}
export async function discardGen(g: Gen): Promise<boolean> {
  const id = g.draft.spec.id;
  if (follower() || settling.has(id)) return false;
  settling.add(id);
  try {
    drop(g);
    ui.selected = '';
    await saveGens();
    return true;
  } finally {
    settling.delete(id);
  }
}
export function retryGen(g: Gen) {
  const input = g.input;
  void discardGen(g).then((ok) => ok && withKey(() => void startItem(input)));
}

const WEEK = 7 * 86_400_000;
const FLOW_TAGS = ['studio-base', 'studio-rig', 'studio-move', 'm2-skel']; // create/move calls, re-attached by request hash
/**
 * Activity "Clear finished" (maxAge 0, sweeps blobs) and the leader's start-up prune (a week, records only). Deletes finished ledger records that no draft
 * references and no pending create/move may re-attach to (R6 P1-2), then, only while nothing is generating or being saved
 * in this tab, the blobs nothing references any more (R6 P2-15).
 * ponytail: a follower tab's copyDemo/M-page writes its blobs one transaction before its record; a sweep exactly in between
 * would drop them. Followers cannot generate, so the window is a demo copy; add a "recent blobs" grace list if that bites.
 */
export async function cleanUp(maxAge = 0, sweep = true): Promise<{ jobs: number; blobs: number }> {
  if (queue.role === 'follower') return { jobs: 0, blobs: 0 };
  const drafts = [...gens.map((g) => g.draft), ...(await loadDrafts().catch(() => []))];
  const refs = new Set(drafts.flatMap((d) => d.calls.flatMap((c) => [c.recId, ...c.old])));
  const flow = !!(creating.spec || moving.spec || (await db.get('projects', CREATE_KEY)) || (await db.get('projects', MOVE_KEY)));
  const cutoff = Date.now() - maxAge;
  const jobs = await queue.clearFinished((r) => refs.has(r.id) || (flow && FLOW_TAGS.includes(r.tag ?? '')) || (r.finishedAt ?? r.createdAt) > cutoff);
  const idle = sweep && !flow && queue.idle() && !runningGens.size && !settling.size;
  return { jobs, blobs: idle ? await db.gcBlobs() : 0 };
}


export function openNewItem(group: string, prefill?: { slot?: string; prompt?: string }) {
  ui.newItem = { group, slot: prefill?.slot ?? GROUPS.find((g) => g.id === group)!.slots[0], prompt: prefill?.prompt ?? '' };
  ui.sheet = 'newitem';
}

/** Progress of an item generation from the job ledger: share of calls done (+ the running calls' own progress). */
export function genProgress(g: Gen, jobs: JobRec[]): { pct: number; short: string; label: string } {
  if (g.phase === 'review') return { pct: 100, short: 'Review', label: 'ready to review' };
  if (g.phase === 'failed') return { pct: 0, short: 'Failed', label: 'failed' };
  const recs = g.draft.calls.map((c) => jobs.find((j) => j.id === c.recId));
  const part = recs.reduce((s, r) => s + (r?.state === 'done' ? 1 : r?.state === 'running' ? Math.min(0.95, r.jobs[0]?.progress ?? 0.1) : 0), 0);
  const pct = Math.round((part / Math.max(1, recs.length)) * 100);
  const waiting = recs.some((r) => r?.state === 'queued') && !recs.some((r) => r?.state === 'running');
  return { pct, short: waiting ? 'Queued' : `${pct}%`, label: `${g.status || 'Generating'} · ${pct}%` };
}

// ---------- create character ----------
export const creating = $state({ spec: null as CreateSpec | null, progress: null as Progress | null, error: '', projectId: '', warnings: [] as string[] });
const CREATE_KEY = 'studio-create';
export async function startCreate(spec: CreateSpec) {
  creating.spec = spec;
  creating.error = '';
  creating.projectId = '';
  creating.progress = null;
  await db.put('projects', CREATE_KEY, { id: CREATE_KEY, spec });
  try {
    const id = await createCharacter(spec, (p) => (creating.progress = p));
    creating.projectId = id;
    const rec = await db.get<{ rigQa?: { warnings?: string[] } }>('projects', id);
    creating.warnings = rec?.rigQa?.warnings ?? [];
    await db.del('projects', CREATE_KEY);
    await refreshProjects();
  } catch (e) {
    creating.error = (e as Error).message;
  }
}
let createResumed = false;
export async function resumeCreate() {
  if (createResumed || queue.role === 'follower') return; // the leader resumes it (takeOver)
  createResumed = true;
  const r = await db.get<{ spec: CreateSpec }>('projects', CREATE_KEY).catch(() => undefined);
  if (r?.spec && !creating.spec) void startCreate(r.spec);
}
export async function cancelCreate() {
  creating.spec = null;
  creating.progress = null;
  creating.error = '';
  await db.del('projects', CREATE_KEY);
}


// ---------- add a move (one at a time; resumable like create) ----------
export const moving = $state({ spec: null as MoveSpec | null, projectId: '', progress: null as Progress | null, error: '', done: false });
const MOVE_KEY = 'studio-move';
let moveRunning = false;
export async function startMove(projectId: string, spec: MoveSpec) {
  if (moveRunning) return;
  moveRunning = true;
  Object.assign(moving, { spec, projectId, progress: null, error: '', done: false });
  await db.put('projects', MOVE_KEY, { id: MOVE_KEY, spec, projectId });
  try {
    await addMove(projectId, spec, (p) => (moving.progress = p));
    moving.done = true;
    await db.del('projects', MOVE_KEY);
    if (doc.id === projectId) { await openProject(projectId); ui.anim = spec.id; ui.frame = 0; ui.playing = true; }
    toast(`${spec.id[0].toUpperCase() + spec.id.slice(1)} added`);
  } catch (e) {
    moving.error = (e as Error).message;
  } finally {
    moveRunning = false;
  }
}
let moveResumed = false;
export async function resumeMove() {
  if (moveResumed || queue.role === 'follower') return;
  moveResumed = true;
  const r = await db.get<{ spec: MoveSpec; projectId: string }>('projects', MOVE_KEY).catch(() => undefined);
  if (r?.spec && !moving.spec) void startMove(r.projectId, r.spec);
}
export async function dismissMove() {
  Object.assign(moving, { spec: null, projectId: '', progress: null, error: '', done: false });
  await db.del('projects', MOVE_KEY);
}
