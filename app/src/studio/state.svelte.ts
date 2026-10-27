// Studio state: UI (size class, theme, tabs, sheets, playback), the open project + outfit with undo/redo and autosave,
// item generations (drafts) and the create-character run. Pixel data lives in $state.raw (deep proxies over the manifest
// made recolor/compose take seconds, B5); manifest edits bump doc.rev.
import { applyDress, dressOf, openSource, saveDress, saveSplit, type DressState } from '../lib/dress/project.ts';
import { splitBase } from '../lib/dress/regions.ts';
import { deriveMaterials, randomOutfit, recolor, storeVariants } from '../lib/dress/dress.ts';
import { drawList } from '../lib/compose/compose.ts';
import { deleteItem, listProjects, loadProject, originOf } from '../lib/store/project.ts';
import * as db from '../lib/store/db.ts';
import type { CellKey, DirectionName, Item, Manifest, Preset, Project, ZOverride } from '../lib/store/manifest.ts';
import type { ItemPaletteRepairPlan, Draft, ItemResult } from '../lib/items/run.ts';
import { loadDrafts } from '../lib/items/drafts.ts';
import { app } from '../lib/app.svelte.ts';
import { accountTier } from '../lib/pixellab/plans.ts';
import type { NewItemInput } from './itemRoute.ts';
import type { BodyPaletteRepairPlan, CreateSpec, MeasurementRecoveryPlan, MoveSpec, Progress } from './create.ts';
import { GROUPS, groupOf, uniqueBy } from './model.ts';
import { queue, type JobRec } from '../lib/pixellab/queue.ts';
import type { SetupSpec } from './setup.ts';
import { listFits, clearFinishedFits, resumeFits } from '../lib/equipment/fits.ts';
import type { EquipmentDesign, FitDraft } from '../lib/equipment/types.ts';
import { lazy, LoadError } from '../lib/lazy.ts';
import type { Img } from '../lib/image/png.ts';

// Replacing this module must not leave old paid-flow closures driving beside newly resumed state.
// A full dev reload destroys those closures; the disconnected queue refuses further submissions.
const hmrReloading = import.meta.hot?.data.flowReloading === true;
// The paid pipelines load on first use, outside the startup bundle (lib/lazy.ts).
const createFlow = () => lazy(() => import('./create.ts'));
const itemFlow = async () => (await lazy(() => import('./itemRoute.ts'))).itemRoute;
const itemRun = () => lazy(() => import('../lib/items/run.ts'));
const fitFlow = () => lazy(() => import('../lib/equipment/fit.ts'));
const setupFlow = () => lazy(() => import('./setup.ts'));
/** After startup: fetch the pipelines so a later action still works offline or after a deploy replaced their files.
 * A failure is logged by lazy() and shown again when the action runs. */
export const prefetchFlows = () => Promise.allSettled([createFlow(), itemFlow(), itemRun(), fitFlow(), setupFlow()]);
import.meta.hot?.dispose((data) => {
  data.flowReloading = true;
  queue.disconnect();
  window.location.reload();
});

// ---------- small persistence helpers (every storage access can throw: private mode, blocked site data) ----------
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ } };
const K = { theme: 'pixeldoll.theme', welcomed: 'pixeldoll.welcomed', last: 'pixeldoll.studio.project' };
export const DEMO = 'fixture:s2';

// ---------- UI ----------
export type Size = 'expanded' | 'medium' | 'compact' | 'landscape';
export type SheetId = null | 'inspect' | 'connect' | 'create' | 'newitem' | 'export' | 'activity' | 'item' | 'move' | 'rename' | 'import' | 'delete' | 'setup' | 'savedesign' | 'fitdesign';
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
  tab: 'wardrobe' as 'wardrobe' | 'colors' | 'outfits' | 'moves', // phone
  inspTab: 'item' as 'item' | 'colors' | 'moves',
  group: 'Head',
  selected: '', // item id, or "gen:<draft id>"
  sheet: null as SheetId,
  sheetBusy: false,
  importSource: 'device' as 'device' | 'pixellab',
  newItemTab: 'create' as 'create' | 'designs',
  designId: '',
  designMode: 'copy' as 'copy' | 'fit',
  fitId: '',
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
let afterConnect: { run: () => void; requiresRig: boolean } | null = null;

export function initUi() {
  const on = () => { ui.size = sizeNow(); ui.dpr = devicePixelRatio || 1; };
  // Backgrounded or closing: keep any unsaved outfit synchronously (an unload can abort IndexedDB), then flush the autosave
  // debounce. pagehide covers reload/close/navigation; hidden covers mobile, where pagehide may never fire. No beforeunload,
  // which would cost the back/forward cache.
  const hide = () => { if (document.visibilityState === 'hidden') { keepUnsaved(); void flushSave(); } };
  const leave = () => { keepUnsaved(); void flushSave(); };
  // Actions started without awaiting them (Make item, Keep it, Reset, a review check) would otherwise drop a load failure.
  const unhandled = (e: PromiseRejectionEvent) => { if (e.reason instanceof LoadError) { e.preventDefault(); toast(e.reason.message); } };
  addEventListener('unhandledrejection', unhandled);
  addEventListener('resize', on);
  addEventListener('pagehide', leave);
  document.addEventListener('visibilitychange', hide);
  applyTheme();
  return () => { removeEventListener('unhandledrejection', unhandled); removeEventListener('resize', on); removeEventListener('pagehide', leave); document.removeEventListener('visibilitychange', hide); };
}
export function applyTheme() { document.documentElement.dataset.theme = ui.theme; document.documentElement.style.colorScheme = ui.theme; }
export function toggleTheme() { ui.theme = ui.theme === 'dark' ? 'light' : 'dark'; lsSet(K.theme, ui.theme); applyTheme(); }
export function dismissWelcome() { ui.welcome = false; lsSet(K.welcomed, '1'); }
let toastT: ReturnType<typeof setTimeout> | undefined;
export function toast(s: string) { ui.toast = s; clearTimeout(toastT); toastT = setTimeout(() => (ui.toast = ''), 4000); }

/** Only the queue-leader tab drives generations. Explain blocked actions above any open native modal. */
const follower = () => {
  if (queue.role !== 'follower') return false;
  ui.sheet = 'activity';
  return true;
};

/** Run a spending action; without a key the Connect sheet opens first and the action runs once a key is set. */
export function withKey(fn: () => void, requiresRig = false) {
  if (follower()) return;
  if (requiresRig && app.key && accountTier(app.balance) === 0) { afterConnect = null; ui.sheet = 'connect'; return; }
  if (app.key && !app.keyRejected) return fn();
  afterConnect = { run: fn, requiresRig };
  ui.sheet = 'connect';
}
export function connected() {
  const f = afterConnect;
  afterConnect = null;
  ui.sheet = null;
  f?.run();
}
export const pendingConnectionAllowsFree = () => !!afterConnect && !afterConnect.requiresRig;
/** Closing Connect cancels its spending action, including when the balance request is still in flight. */
export function clearPendingConnection() { afterConnect = null; }

// ---------- project + outfit ----------
export interface ProjectRef { id: string; name: string; demo: boolean; dev: boolean; savedAt: string }
class Store {
  project = $state.raw<Project | null>(null);
  projects = $state.raw<ProjectRef[]>([]);
  results = $state.raw<Record<string, ItemResult | null>>({});
}
export const store = new Store();
class DesignSource {
  project = $state.raw<Project | null>(null);
  itemId = $state('');
  variants = $state.raw<Preset['variants']>({});
}
export const designSource = new DesignSource();
class EquipmentState {
  fits = $state.raw<FitDraft[]>([]);
  running = $state<string[]>([]);
  preparing = $state<string[]>([]);
  previewDesign = $state.raw<EquipmentDesign | null>(null);
}
export const equipment = new EquipmentState();
export async function refreshFits() { equipment.fits = await listFits(); }
/** Resuming a stage loads the fitting pipeline. If that (or storage) fails, say so; the fit stays running and a reload
 * resumes it. */
export async function resumeFitStages() { try { await resumeFits(); } catch (e) { toast(e instanceof Error ? e.message : String(e)); } }
export function openFit(id: string) { equipment.previewDesign = null; ui.fitId = id; ui.designId = ''; ui.sheet = 'fitdesign'; }
/** Accepted items pin the source even after its library entry has been deleted. */
export function openPinnedDesign(itemId: string) {
  const item = store.project?.manifest.items.find((i) => i.id === itemId);
  if (!item?.design) return;
  equipment.previewDesign = item.design.snapshot;
  ui.designId = ''; ui.designMode = 'fit'; ui.fitId = ''; ui.sheet = 'fitdesign';
}
export async function openItemExtension(itemId: string, anims?: string[]) {
  if (follower()) return;
  const id = doc.id;
  const sheet = ui.sheet;
  const pending = `${id}/${itemId}`;
  if (equipment.preparing.includes(pending)) return;
  equipment.preparing = [...equipment.preparing, pending];
  try {
    await flushSave();
    const fit = await (await fitFlow()).prepareExtensionFit(id, itemId, { anims });
    await refreshFits();
    if (doc.id === id && ui.sheet === sheet) openFit(fit.id);
    else toast('Equipment fit prepared in Activity');
  } catch (e) { toast(e instanceof Error ? e.message : 'Could not prepare this equipment fit.'); }
  finally { equipment.preparing = equipment.preparing.filter((key) => key !== pending); }
}
export const extensionPreparing = (itemId: string) => equipment.preparing.includes(`${doc.id}/${itemId}`);
/** A hidden sheet never owns the lifetime of a paid fit stage. */
async function trackFit(id: string, action: () => Promise<FitDraft>) {
  if (equipment.running.includes(id)) return;
  equipment.running = [...equipment.running, id];
  try {
    const finished = await action();
    toast(finished.stage === 'rest-review' || finished.stage === 'fit-review' ? 'Equipment fit is ready for review in Activity' : 'Equipment fit needs attention in Activity');
  } catch (e) { toast(e instanceof Error ? e.message : 'The equipment fit needs attention in Activity.'); }
  finally { equipment.running = equipment.running.filter((x) => x !== id); await refreshFits(); }
}
export const runFitStage = (id: string, stage: 'rest' | 'pose', poseBudget = 0) => trackFit(id, async () => { const f = await fitFlow(); return stage === 'rest' ? f.runRestFit(id) : f.approveRestAndPose(id, poseBudget); });
export const retryFitStage = (id: string, stage: 'rest' | 'pose', budget: number) => trackFit(id, async () => (await fitFlow()).retryFit(id, stage, budget));
/** Capture the displayed colorway before opening a sheet or changing characters. */
export function openSaveDesign(itemId: string) {
  if (!store.project || !store.project.manifest.items.some((i) => i.id === itemId && i.slot !== 'body' && i.status === 'accepted')) return;
  designSource.project = { manifest: structuredClone(store.project.manifest), images: new Map(store.project.images) };
  designSource.itemId = itemId;
  designSource.variants = $state.snapshot(doc.variants);
  ui.sheet = 'savedesign';
}
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
  /** Worn drafts, slot -> draft id: shown over the outfit, never in doc.items, so autosave, undo, outfits and exports never
   *  see a draft. Cleared when a saved item or None takes the slot, on discard and when another character opens. */
  drafts: {} as Record<string, string>,
});
export const isDemo = () => doc.id.startsWith('fixture:');

/** What the stage shows: the project with the selected color variants swapped in (exact ramp swap) and the worn drafts' current
 *  previews, the outfit with those drafts on, and the playing cell. */
class View {
  recolored = $derived.by(() => {
    void doc.rev;
    const p = store.project;
    return p ? recolor(p, $state.snapshot(doc.variants)) : null;
  });
  project = $derived.by(() => this.recolored && withDrafts(this.recolored));
  items = $derived.by(() => ({ ...doc.items, ...doc.drafts }));
  anim = $derived(store.project?.manifest.rig.animations.find((a) => a.id === ui.anim));
  cell = $derived(this.anim ? this.anim.frames[ui.frame % this.anim.frames.length].cell : 0);
}
export const view = new View();

export async function refreshProjects() {
  const listed = await listProjects().catch((e: unknown) => { console.error('projects', e); toast(`Could not read your saved characters: ${(e as Error).message}`); return null; }), own = (listed ?? []).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  store.projects = [{ id: DEMO, name: 'Adventurer (demo)', demo: true, dev: false, savedAt: '' }, ...own.map((p) => ({ id: p.id, name: p.manifest.name, demo: false, dev: originOf(p) === 'dev', savedAt: p.savedAt }))];
  // Drop unload snapshots of characters deleted here or in another tab (only when the listing is known to be complete).
  if (listed) try { for (const k of Object.keys(localStorage)) if (k.startsWith(UNSAVED) && !store.projects.some((p) => k === UNSAVED + p.id)) localStorage.removeItem(k); } catch { /* storage blocked */ }
}

let openRequest = 0, opening = ''; // opening: the character the newest open is loading ('' when it finished)
/** keep.wear: equip that item (Keep it). keep.quiet: reload the open character in place (a draft saved itself): the view, the
 *  selection and undo stay, and the stage does not show loading. */
export async function openProject(id: string, keep?: { wear?: string; quiet?: boolean }) {
  const request = ++openRequest, quiet = !!keep?.quiet && id === doc.id, seen = edits; // edits so far are saved before the read
  opening = id;
  await flushSave();
  if (request !== openRequest) return;
  if (!quiet) doc.loading = true;
  doc.error = '';
  try {
    const r = await openSource(id);
    if (request !== openRequest) return;
    const split = await splitBase(r.project); // B15: shirt / shorts color regions on the base (idempotent; fixtures in memory)
    deriveMaterials(r.project); // items without materials (new items, fresh fixtures)
    if (split.dirty && !id.startsWith('fixture:')) await saveSplit(id, r.project.manifest, split);
    if (request !== openRequest) return;
    await flushSave(); // an edit made to the previous character while this one loaded lands before it is replaced
    if (request !== openRequest) return;
    // an edit to this same character while it reloaded (outfits, layer order, hides) is newer than the read: read it again
    if (id === doc.id && edits !== seen) return openProject(id, keep);
    const m = r.project.manifest;
    const pr = r.current ?? m.presets[0] ?? { items: {}, variants: {} };
    const unsaved = takeUnsaved(id, m), current = unsaved ?? pr; // replace, never merge: a reset or removal deletes keys
    if (!quiet) { doc.items = { ...current.items }; doc.variants = { ...current.variants }; } // in place: keep the live outfit
    if (id !== doc.id) doc.drafts = {};
    if (keep?.wear) { const it = m.items.find((i) => i.id === keep.wear); if (it) { doc.items[it.slot] = it.id; delete doc.drafts[it.slot]; } }
    if (!quiet) { doc.undo = []; doc.redo = []; }
    doc.id = id;
    if (!m.rig.animations.some((a) => a.id === ui.anim)) ui.anim = (m.rig.animations.find((a) => a.id === 'walk') ?? m.rig.animations[0]).id;
    if (!m.rig.directions.some((d) => d.id === ui.dir)) ui.dir = m.rig.directions[0].id;
    if (!quiet) ui.frame = 0;
    store.project = r.project;
    if (!quiet) ui.selected = keep?.wear ?? m.items.find((i) => i.id !== m.rig.baseItem && doc.items[i.slot] === i.id)?.id ?? '';
    if (ui.selected && !quiet) ui.group = groupOf(m.items.find((i) => i.id === ui.selected)!.slot).id;
    lsSet(K.last, id);
    doc.rev++;
    savedEdits = edits; // nothing is pending (flushed above): what was just loaded is saved, so only later edits count
    // Keep it equips the accepted item while opening, or an outfit left unsaved by an unload; persist it now.
    if (keep?.wear || unsaved) { save(); await flushSave(); }
  } catch (e) {
    if (request !== openRequest) return;
    doc.error = (e as Error).message;
    // The demo's own open clears doc.error: say why the requested character is not shown.
    if (id !== DEMO) { console.error('open', e); toast(`Could not open that character: ${doc.error}`); return openProject(DEMO); }
  } finally {
    if (request === openRequest) { doc.loading = false; opening = ''; }
  }
}
export const lastProject = () => lsGet(K.last) ?? DEMO;
/** Work finishing in the background reloads only the character in view, never one the user is leaving: reopening it would
 *  cancel the open of the newly picked one. */
const viewing = (id: string) => doc.id === id && (!opening || opening === id);

// ---- undo/redo: snapshots of the dress state (outfit, colors, presets, layer order, hides) ----
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
  const before = { ...doc.items };
  fn();
  // a saved item put on or taken off a slot replaces the draft worn there
  for (const slot of Object.keys(doc.drafts)) if ((doc.items[slot] ?? null) !== (before[slot] ?? null)) delete doc.drafts[slot];
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
let pendingSave: (() => Promise<void>) | null = null;
let saving: Promise<void> = Promise.resolve();
export async function flushSave() {
  clearTimeout(saveT);
  const pending = pendingSave;
  pendingSave = null;
  if (pending) saving = saving.then(pending);
  await saving;
}
let edits = 0, savedEdits = 0;
function save() {
  clearTimeout(saveT);
  const id = doc.id, m = store.project?.manifest;
  if (!m) return;
  const n = ++edits, cur = { items: $state.snapshot(doc.items), variants: $state.snapshot(doc.variants) };
  pendingSave = async () => {
    storeVariants(m, cur.variants);
    try {
      await saveDress(id, m, cur);
      doc.saved = new Date().toLocaleTimeString();
      if (n === edits) { savedEdits = n; lsSet(unsavedKey(id), null); }
    } catch (e) { console.error('autosave', e); toast(`Could not save: ${(e as Error).message}`); }
  };
  saveT = setTimeout(() => void flushSave(), 400);
}

// IndexedDB writes started while a page unloads may never finish, so the unsaved dress state (the undo snapshot: outfit,
// colors, saved outfits, layer order, hides) also goes to localStorage (synchronous) until a save lands; openProject
// re-applies it with applyDress and saves it.
const UNSAVED = 'pixeldoll.unsaved.', unsavedKey = (id: string) => UNSAVED + id;
function keepUnsaved() {
  // While another character loads, doc and store.project still describe this one, so its snapshot stays consistent.
  if (edits === savedEdits || !doc.id || !store.project) return;
  try { lsSet(unsavedKey(doc.id), snap()); } catch (e) { console.error('unsaved snapshot', e); }
}
function takeUnsaved(id: string, m: Manifest): Pick<Preset, 'items' | 'variants'> | null {
  try {
    const d = JSON.parse(lsGet(unsavedKey(id)) ?? 'null') as DressState | null;
    // Validate the whole shape first: applyDress changes the manifest in place, so a bad snapshot must not half-apply.
    const obj = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
    const current = d?.current;
    if (!d || !current || !obj(current) || !obj(current.items) || !obj(current.variants) || !Array.isArray(d.materials) || !Array.isArray(d.presets) || !obj(d.zOverrides) || (d.hides != null && !obj(d.hides))) return null;
    applyDress(m, d); // keeps items added since and never revives removed ones
    // An item deleted since (another tab) is dropped rather than worn as a dangling id.
    return { items: Object.fromEntries(Object.entries(current.items).filter(([, it]) => it == null || m.items.some((i) => i.id === it))), variants: { ...current.variants } };
  } catch { return null; }
}

/** Deleting a project never cancels paid jobs or removes shared cell blobs. */
export function deletionBlocked(): string {
  if (isDemo()) return 'The bundled demo cannot be deleted.';
  if (doc.loading) return 'Wait for the character to finish loading.';
  if (queue.role === 'follower') return 'Manage characters in the other PixelDoll tab, or close it first.';
  if (equipment.fits.some((f) => f.targetId === doc.id && f.stage !== 'accepted' && f.stage !== 'discarded')) return 'Finish or discard this character’s equipment fits in Activity before deleting it.';
  if (!queue.idle() || gens.some((g) => g.phase === 'running') || settling.size || (creating.spec && !creating.projectId) || (moving.spec && !moving.done) || (settingUp.spec && !settingUp.done)) return 'Finish or dismiss pending generation work before deleting a character.';
  return '';
}

export async function removeProject(): Promise<void> {
  await refreshFits(); // Persisted drafts may have changed in another tab since the menu opened.
  const reason = deletionBlocked();
  if (reason) throw new Error(reason);
  const id = doc.id, request = openRequest, name = store.project?.manifest.name ?? 'Character';
  await flushSave();
  await db.deleteCharacter(id);
  const deletedDrafts = new Set(gens.filter((g) => g.draft.rigId === id).map((g) => g.draft.spec.id));
  setGens(gens.filter((g) => g.draft.rigId !== id));
  store.results = Object.fromEntries(Object.entries(store.results).filter(([draftId]) => !deletedDrafts.has(draftId)));
  if (creating.projectId === id) Object.assign(creating, { spec: null, projectId: '', progress: null, error: '', warnings: [], views: [] });
  if (moving.projectId === id) await dismissMove();
  await refreshProjects();
  if (doc.id === id && request === openRequest) {
    lsSet(K.last, null);
    await openProject(store.projects.find((p) => !p.demo && !p.dev)?.id ?? DEMO);
  }
  toast(`Deleted ${name} from this device`);
}

// ---- edits ----
const itemById = (id: string) => store.project?.manifest.items.find((i) => i.id === id);
export function wear(id: string) {
  const it = itemById(id);
  if (!it) return;
  const on = doc.items[it.slot] === id && !doc.drafts[it.slot];
  delete doc.drafts[it.slot]; // a saved item put on or taken off replaces the draft worn in its slot
  if (doc.items[it.slot] !== (on ? null : id)) commit(`${on ? 'Take off' : 'Wear'} ${it.name}`, () => { doc.items[it.slot] = on ? null : id; });
  ui.selected = id;
}
export function clearSlots(slots: string[]) {
  for (const s of slots) delete doc.drafts[s];
  if (!slots.some((s) => doc.items[s])) return;
  commit('Take off', () => { for (const s of slots) doc.items[s] = null; });
}
export function setVariant(matId: string, name: string | null) {
  commit('Color change', () => { if (name == null) delete doc.variants[matId]; else doc.variants[matId] = name; });
}
export function resetColors(matIds?: string[]) {
  commit('Reset colors', () => { for (const k of matIds ?? Object.keys(doc.variants)) delete doc.variants[k]; });
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
  // Never replaces a saved outfit (a repeated or non-Latin name, a default name after a deletion); 'current' is the export's live look.
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'outfit';
  let id = base;
  for (let n = 2; id === 'current' || m.presets.some((p) => p.id === id); n++) id = `${base}-${n}`;
  commit('Save outfit', () => {
    const pr: Preset = { id, name, items: $state.snapshot(doc.items), variants: $state.snapshot(doc.variants) };
    m.presets = [...m.presets, pr];
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
  const nz = order[j].z + step; // just past the neighbor
  const slot = m.slots.find((s) => s.id === it.slot)!;
  const o: ZOverride = { layer: 'fg', z: nz, ...(onlyDir ? { dir: ui.dir } : {}) };
  commit(step > 0 ? 'Bring forward' : 'Send backward', () => {
    slot.zOverrides = [...(slot.zOverrides ?? []).filter((x) => !(x.layer === 'fg' && x.dir === o.dir && !x.anim && x.cell == null)), o];
  });
}
/** `ladder`: the slot's default order from lib/items SLOTS (T3), passed in so the item pipeline stays out of startup. */
export function resetLayer(itemId: string, ladder: ZOverride[]) {
  const m = store.project!.manifest, slot = m.slots.find((s) => s.id === itemById(itemId)!.slot)!;
  commit('Reset layer order', () => { slot.zOverrides = structuredClone(ladder); });
}

let itemPaletteRefresh = 0;
/** Free, explicit correction of one saved item view; keep the open outfit and inspector selection. */
export async function matchItemPalette(projectId: string, itemId: string, anim: string, dir: DirectionName, reviewed: ItemPaletteRepairPlan) {
  const request = openRequest;
  await flushSave();
  await (await itemRun()).matchItemColors(projectId, itemId, anim, dir, reviewed);
  if (doc.id !== projectId || request !== openRequest) return;
  const refresh = ++itemPaletteRefresh, fresh = await loadProject(projectId);
  if (doc.id !== projectId || request !== openRequest || refresh !== itemPaletteRefresh) return;
  store.project = fresh.project;
  doc.rev++;
}

export async function removeItem(itemId: string) {
  const it = itemById(itemId);
  if (!it || isDemo()) return;
  const projectId = doc.id, request = openRequest;
  await flushSave();
  await deleteItem(projectId, itemId);
  toast(`Removed ${it.name}`);
  if (doc.id === projectId && request === openRequest) await openProject(projectId);
}

/** The demo is a bundled fixture; items are generated into an editable copy in IndexedDB. */
export async function copyDemo(): Promise<string> {
  const project = store.project!; // the open character when asked, not after the pipeline loads
  const id = await (await createFlow()).saveCopy(project, 'Adventurer copy');
  await refreshProjects();
  await openProject(id);
  return id;
}

/** Rename the open (own) character: the manifest name is also the exported name. */
export async function renameProject(name: string) {
  if (isDemo()) return;
  const projectId = doc.id;
  await db.update<{ manifest?: Manifest }>('projects', projectId, (rec) => {
    if (!rec?.manifest) throw new Error('gone');
    rec.manifest.name = name;
    return rec;
  });
  if (doc.id === projectId) { store.project!.manifest.name = name; bump(); }
  await refreshProjects();
}

/** Wear an item if it is off and select it; a worn item stays on. Wardrobe tiles toggle with `wear` instead. */
export function pick(id: string) {
  const it = itemById(id);
  if (it && (doc.items[it.slot] !== id || doc.drafts[it.slot])) wear(id);
  else ui.selected = id;
}

// ---------- item generations ----------
// Bump when PixelLab request wording changes. Work saved with other wording no longer matches its ledger records and would
// resend paid calls, so it waits for review instead of resuming by itself.
export const REQUEST_TEXT = 2;
const STOPPED = 'Generation stopped. Review Activity before trying again.';
const halted = (r: { status?: string; requestText?: number }) => r.status === 'failed' || r.requestText !== REQUEST_TEXT;
export interface Gen { draft: Draft; input: NewItemInput; phase: 'running' | 'review' | 'failed'; status: string; error?: string; requestText?: number }
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
// A failed read rejects: an empty list would let the next save overwrite the stored drafts and cleanUp prune their records.
const readGens = async () => uniqueBy((await db.get<{ gens: Gen[] }>('projects', GENS_KEY))?.gens ?? [], (g) => g.draft.spec.id);
/** The ONLY way the list is replaced: one entry per draft id (already-persisted duplicates heal on the next save). Synchronous,
 * so no caller can splice with a length read before an await (the B13 regression that doubled every draft). */
function setGens(list: Gen[]) {
  const uniq = uniqueBy(list, (g) => g.draft.spec.id);
  mirrored = JSON.stringify(uniq);
  gens.splice(0, gens.length, ...uniq);
  takeOffGone();
}
/** A worn draft that failed or is gone (saved or discarded in another tab) comes off, so the item under it shows again. */
function takeOffGone() {
  for (const [slot, id] of Object.entries(doc.drafts)) if (!gens.some((g) => g.draft.spec.id === id && g.phase !== 'failed')) delete doc.drafts[slot];
}
/** Once per page (a second call, e.g. a Studio remount, returns the same promise). */
export function loadGens(): Promise<void> {
  if (hmrReloading) return Promise.resolve();
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
  const outdated = gens.filter((g) => g.phase === 'running' && g.requestText !== REQUEST_TEXT);
  for (const g of outdated) Object.assign(g, { phase: 'failed', status: '', error: STOPPED });
  takeOffGone();
  if (outdated.length) void saveGens();
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
  }, (e) => console.error('drafts', e));
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
  await resumeSetup();
  await resumeFitStages();
  await refreshFits();
}

export async function startItem(input: NewItemInput) {
  if (hmrReloading) return;
  // Startup may still be reading the stored drafts: saving before they load would overwrite them.
  try { await loadGens(); } catch (e) { toast(`Saved item drafts could not be read: ${(e as Error).message}. Reload to try again.`); return; }
  const ctx = await loadProject(doc.id), route = await itemFlow();
  const taken = gens.map((g) => g.draft.spec.id); // read and claimed with no await between: concurrent starts get distinct ids
  gens.push({ draft: route.draft(ctx, input, taken), input, phase: 'running', status: 'Starting', requestText: REQUEST_TEXT });
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
  // a draft saved or discarded meanwhile keeps no result: a late preview must not bring it back
  const result = (r: ItemResult | null) => { if (gens.includes(g)) store.results = { ...store.results, [g.draft.spec.id]: r }; };
  try {
    ctx ??= await loadProject(g.draft.rigId);
    const res = await (await itemFlow()).run(g.draft, ctx, {
      status: (s) => (g.status = s === 'design call' ? 'Designing' : 'Adding the other moves'),
      persist: saveGens,
      result,
    });
    if (!gens.includes(g)) return;
    result(res);
    g.phase = res?.qa && res.cells.length ? 'review' : 'failed';
    if (g.phase === 'failed') g.error = g.draft.log.at(-1) ?? 'PixelLab did not return usable frames';
    g.status = '';
  } catch (e) {
    // The pipeline did not load, so this attempt submitted nothing: keep the draft running for a reload to resume.
    if (e instanceof LoadError) { g.status = ''; toast(e.message); return; }
    g.phase = 'failed';
    g.error = (e as Error).message;
  }
  takeOffGone();
  await saveGens();
  if (g.phase !== 'review') return;
  // Review is optional (round 10, changes D7): a clean draft saves itself; warned or failed ones wait with their badge.
  const res = store.results[g.draft.spec.id];
  if (res && (await itemRun()).isClean(res) && (await autoSave(g))) return;
  toast(`${g.input.name} is ready to review`);
}
async function autoSave(g: Gen): Promise<boolean> {
  try { return await acceptGen(g, true); }
  catch (e) { g.draft.log.push(`not saved automatically: ${(e as Error).message}`); await saveGens(); return false; }
}
async function evalGen(g: Gen) {
  const ctx = await loadProject(g.draft.rigId);
  store.results = { ...store.results, [g.draft.spec.id]: await (await itemRun()).evaluateItem(g.draft, ctx) };
}
export const genOf = (sel: string) => gens.find((g) => `gen:${g.draft.spec.id}` === sel);

/** Wear or take off a draft of the open character while it generates or waits for review (display only: doc.drafts). */
export function wearDraft(id: string) {
  const g = gens.find((x) => x.draft.spec.id === id);
  if (!g || g.draft.rigId !== doc.id) return;
  const slot = g.draft.spec.slot;
  if (doc.drafts[slot] === id) delete doc.drafts[slot];
  else doc.drafts[slot] = id;
  ui.selected = `gen:${id}`;
}
/** The project plus each worn draft's current preview item; the saved manifest is never changed. A running draft without a
 *  preview yet is a layerless stand-in whose target cells are all pending, so the stage says it is loading. */
function withDrafts(p: Project): Project {
  const ids = Object.values(doc.drafts);
  if (!ids.length) return p;
  const m = p.manifest, items: Item[] = [], images = new Map(p.images), slots = [...m.slots];
  for (const id of ids) {
    const g = gens.find((x) => x.draft.spec.id === id), prev = store.results[id]?.preview, it = prev?.manifest.items.find((i) => i.id === id);
    if (!g || g.draft.rigId !== doc.id) continue;
    const running = g.phase === 'running';
    if (prev && it) {
      items.push(running ? it : { ...it, pending: undefined }); // only a running draft is still loading; other gaps are missing
      for (const [h, im] of prev.images) if (!images.has(h)) images.set(h, im);
      const slot = prev.manifest.slots.find((x) => x.id === it.slot);
      if (slot && !slots.some((x) => x.id === slot.id)) slots.push(slot);
    } else if (running) {
      const { spec } = g.draft;
      items.push({ id, name: g.input.name, slot: spec.slot, status: 'draft', mirror: 'generate', materials: [], prompt: spec.prompt, layers: [], baseHash: m.rig.baseHash, provenance: [],
        pending: spec.anims.flatMap((a) => (spec.clipDirs?.[a] ?? spec.dirs).flatMap((d) => Array.from({ length: m.rig.animations.find((x) => x.id === a)?.cells ?? 0 }, (_, i) => `${a}/${d}/${i}` as CellKey))) });
    }
  }
  return items.length ? { ...p, manifest: { ...m, items: [...m.items, ...items], slots }, images } : p;
}

// Keep it / Discard in flight for a draft: the other click is ignored (R6 P1-6: Discard during Keep it, then
// splice(indexOf(g) = -1) removed an unrelated, still-running draft).
const settling = new Set<string>();
const drop = (g: Gen) => { const i = gens.findIndex((x) => x.draft.spec.id === g.draft.spec.id); if (i >= 0) gens.splice(i, 1); };
/** Keep it (or `auto`: a clean draft saving itself). Keep it wears the item; a saved draft keeps the slot it was worn in (same id)
 *  and reloads the open character in place. True when saved. */
export async function acceptGen(g: Gen, auto = false): Promise<boolean> {
  const id = g.draft.spec.id;
  if (follower() || settling.has(id)) return false;
  settling.add(id);
  try {
    const ctx = await loadProject(g.draft.rigId);
    const item = await (await itemFlow()).accept(g.draft, ctx, store.results[id] ?? undefined);
    const worn = doc.drafts[item.slot] === id;
    drop(g);
    await saveGens();
    // a draft saving itself never cancels the open of another character the user just started
    if (auto ? viewing(g.draft.rigId) : doc.id === g.draft.rigId) {
      if (ui.selected === `gen:${id}`) ui.selected = item.id;
      await openProject(doc.id, auto ? { quiet: true, ...(worn ? { wear: item.id } : {}) } : { wear: item.id });
    }
    toast(auto ? `${item.name} saved` : `${item.name} added`);
    return true;
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
    if (doc.drafts[g.draft.spec.slot] === id) delete doc.drafts[g.draft.spec.slot];
    await saveGens();
    return true;
  } finally {
    settling.delete(id);
  }
}
export function retryGen(g: Gen) {
  const input = g.input;
  withKey(() => void discardGen(g).then((ok) => { if (ok) return startItem(input); })); // closing Connect keeps the draft
}

const WEEK = 7 * 86_400_000;
const FLOW_TAGS = ['studio-base', 'studio-rig', 'studio-move', 'studio-setup', 'm2-skel']; // flows re-attached by request hash
/**
 * Activity "Clear finished" (maxAge 0, sweeps blobs) and the leader's start-up prune (a week, records only). Deletes finished ledger records that no draft
 * references and no pending create/move may re-attach to (R6 P1-2), then, only while nothing is generating or being saved
 * in this tab, the blobs nothing references any more (R6 P2-15).
 * Demo copying publishes its record and blobs atomically, including when a follower copies during a leader's sweep.
 */
export async function cleanUp(maxAge = 0, sweep = true): Promise<{ jobs: number; blobs: number }> {
  if (queue.role === 'follower') return { jobs: 0, blobs: 0 };
  await loadGens(); // before the drafts load, `gens` is empty and their records would look unreferenced
  if (maxAge === 0) await clearFinishedFits();
  const drafts = [...gens.map((g) => g.draft), ...(await loadDrafts())];
  const refs = new Set(drafts.flatMap((d) => d.calls.flatMap((c) => [c.recId, ...c.old])));
  const allFits = await listFits();
  equipment.fits = allFits;
  const fits = allFits.filter((fit) => fit.stage !== 'accepted' && fit.stage !== 'discarded');
  for (const fit of fits) for (const call of fit.calls) if (call.recId) refs.add(call.recId);
  const fitTags = new Set(fits.flatMap((fit) => fit.calls.map((call) => `${fit.id}:${call.id}`)));
  const flow = !!(creating.spec || moving.spec || settingUp.spec || fits.some((f) => f.stage === 'rest-running' || f.stage === 'pose-running') || (await db.get('projects', CREATE_KEY)) || (await db.get('projects', MOVE_KEY)) || (await db.get('projects', SETUP_KEY)));
  const cutoff = Date.now() - maxAge;
  const jobs = await queue.clearFinished((r) => refs.has(r.id) || fitTags.has(r.tag ?? '') || (flow && FLOW_TAGS.includes(r.tag ?? '')) || (r.finishedAt ?? r.createdAt) > cutoff);
  const idle = sweep && !flow && queue.idle() && !runningGens.size && !settling.size;
  return { jobs, blobs: idle ? await db.gcBlobs() : 0 };
}


export function openNewItem(group: string, prefill?: { slot?: string; prompt?: string }, tab: typeof ui.newItemTab = 'create') {
  ui.newItemTab = tab;
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

// A caught failure must stay terminal across reload; only an explicit start clears it. A load failure is not one: the
// pipeline never ran, so the saved run stays running for a reload to resume.
interface FlowDraft<S> { spec: S; status?: 'running' | 'failed'; error?: string; progress?: Progress | null; requestText?: number }
async function persistFlowFailure(key: string, record: object, error: unknown, write = (r: object): Promise<unknown> => db.put('projects', key, r)): Promise<string> {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof LoadError) return message;
  try { await write({ id: key, ...record, status: 'failed', error: message }); }
  catch { return `${message} Could not save this failure on this device. Dismiss this operation before reloading.`; }
  return message;
}

// ---------- create character ----------
// Persist the inspector identity with the resumable spec. A new seed starts a distinct run.
function withActivityScope<T extends { seed: number; activityScope?: string }>(spec: T, kind: string): T {
  const prefix = `${kind}:${spec.seed}:`;
  return { ...spec, activityScope: spec.activityScope?.startsWith(prefix) ? spec.activityScope : `${prefix}${crypto.randomUUID()}` };
}
/** `views`: the standing views, shown while the rest of creation finishes (not persisted: a resume re-reads the cached draw). */
export const creating = $state({ spec: null as CreateSpec | null, progress: null as Progress | null, error: '', projectId: '', warnings: [] as string[], views: [] as { id: DirectionName; img: Img }[] });
const CREATE_KEY = 'studio-create';
let createRunning = false, createRevision = 0;
export async function startCreate(spec: CreateSpec) {
  if (hmrReloading || createRunning) return;
  createRunning = true;
  const revision = ++createRevision, current = () => revision === createRevision && createRunning;
  let failed = false;
  spec = withActivityScope({ ...spec, projectId: spec.projectId ?? `rig-${crypto.randomUUID()}` }, 'create'); // persisted before paid work; legacy pending specs migrate once
  creating.spec = spec;
  creating.error = '';
  creating.projectId = '';
  creating.progress = null;
  creating.views = [];
  try {
    await db.put('projects', CREATE_KEY, { id: CREATE_KEY, spec, status: 'running', requestText: REQUEST_TEXT });
    const id = await (await createFlow()).createCharacter(spec, (p) => { if (current() && !failed) creating.progress = p; }, (v) => { if (current() && !failed) creating.views = v; });
    if (!current()) return;
    creating.projectId = id;
    const rec = await db.get<{ rigQa?: { warnings?: string[] } }>('projects', id);
    if (!current()) return;
    creating.warnings = rec?.rigQa?.warnings ?? [];
    await db.del('projects', CREATE_KEY);
    if (current()) await refreshProjects();
  } catch (e) {
    if (current()) {
      failed = true;
      creating.error = e instanceof Error ? e.message : String(e);
      const error = await persistFlowFailure(CREATE_KEY, { spec, progress: $state.snapshot(creating.progress) }, e);
      if (current()) creating.error = error;
    }
  } finally {
    if (revision === createRevision) createRunning = false;
  }
}
let createResumed = false;
export async function resumeCreate() {
  if (hmrReloading || createResumed || queue.role === 'follower') return; // the leader resumes it (takeOver)
  createResumed = true;
  const r = await db.get<FlowDraft<CreateSpec>>('projects', CREATE_KEY).catch(() => undefined);
  if (!r?.spec || creating.spec) return;
  if (halted(r)) Object.assign(creating, { spec: r.spec, progress: r.progress ?? null, error: r.error || STOPPED, projectId: '', warnings: [], views: [] });
  else void startCreate(r.spec);
}
export async function cancelCreate() {
  if (createRunning) return;
  createRevision++;
  creating.spec = null;
  creating.progress = null;
  creating.error = '';
  creating.projectId = '';
  creating.warnings = [];
  creating.views = [];
  await db.del('projects', CREATE_KEY);
}


// ---------- add a move (one at a time, FIFO; resumable like create) ----------
type QueuedMove = { projectId: string; spec: MoveSpec };
/** `queued`: moves waiting for the current one. Persisted with it, so closing the sheet or reloading keeps the order. */
export const moving = $state({ spec: null as MoveSpec | null, projectId: '', progress: null as Progress | null, error: '', done: false, fitIds: [] as string[], warnings: [] as string[], queued: [] as QueuedMove[] });
const MOVE_KEY = 'studio-move';
let moveRunning = false, moveRevision = 0;
/** The stored move record without its queue (null: the current move is finished or dismissed). */
let moveRecord: object | null = null, moveWrites: Promise<unknown> = Promise.resolve();
/** The only writer of the stored move: writes run in order and each reads the live queue when it runs, so a move queued at any
 *  time is kept and an older record never comes back. Between moves the first waiting one is stored as running (a reload
 *  starts it). */
function storeMove(record = moveRecord) {
  moveRecord = record;
  const write = moveWrites.then(() => {
    const queued = $state.snapshot(moving.queued), [next, ...rest] = queued;
    if (moveRecord) return db.put('projects', MOVE_KEY, { ...moveRecord, queued });
    return next ? db.put('projects', MOVE_KEY, { id: MOVE_KEY, spec: next.spec, projectId: next.projectId, status: 'running', requestText: REQUEST_TEXT, queued: rest }) : db.del('projects', MOVE_KEY);
  });
  moveWrites = write.catch(() => {}); // ordering only: each caller handles its own write's error
  return write;
}
/** Queue moves behind the current one; start the first now when nothing is pending. A failed move holds the queue until it
 * is retried (the queue continues) or dismissed (the queue is dropped). */
export async function queueMoves(projectId: string, specs: MoveSpec[]) {
  if (hmrReloading || !specs.length) return;
  moving.queued = [...moving.queued, ...specs.map((spec) => ({ projectId, spec }))];
  if (moveRunning || (moving.spec && !moving.done)) { await storeMove(); return; }
  const [next, ...rest] = moving.queued;
  moving.queued = rest;
  await startMove(next.projectId, next.spec);
}
export async function startMove(projectId: string, spec: MoveSpec) {
  if (hmrReloading || moveRunning) return;
  spec = withActivityScope($state.snapshot(spec), 'move'); // queued specs are reactive proxies, which storage cannot clone
  moveRunning = true;
  const revision = ++moveRevision, current = () => revision === moveRevision && moveRunning;
  let failed = false;
  Object.assign(moving, { spec, projectId, progress: null, error: '', done: false, fitIds: [], warnings: [] });
  try {
    await storeMove({ id: MOVE_KEY, spec, projectId, status: 'running', requestText: REQUEST_TEXT });
    const result = await (await createFlow()).addMove(projectId, spec, (p) => { if (current() && !failed) moving.progress = p; });
    if (!current()) return;
    moving.fitIds = result.fitIds; moving.warnings = result.warnings;
    await refreshFits();
    if (!current()) return;
    moving.done = true;
    await storeMove(null); // the next waiting move replaces this record in one write, so a reload between moves keeps the queue
    if (!current()) return;
    const moveName = spec.id[0].toUpperCase() + spec.id.slice(1).replace(/-/g, ' ');
    if (spec.itemsOnly) { // items posed onto a move the body already had: the move and the undo history stay as they are
      if (viewing(projectId)) { await openProject(projectId, { quiet: true }); if (!current()) return; }
      const names = spec.items.map((id) => store.project?.manifest.items.find((i) => i.id === id)?.name ?? 'Equipment').join(', ');
      toast(`${names} ${spec.itemMethod === 'grid' ? 'redrawn' : 'posed'} for ${moveName}`);
    } else {
      if (viewing(projectId)) { await openProject(projectId); if (!current()) return; if (viewing(projectId)) { ui.anim = spec.id; ui.frame = 0; ui.playing = true; } }
      toast(`${moveName} added`);
    }
  } catch (e) {
    if (current()) {
      failed = true;
      moving.error = e instanceof Error ? e.message : String(e);
      const error = await persistFlowFailure(MOVE_KEY, { spec, projectId, progress: $state.snapshot(moving.progress) }, e, storeMove);
      if (current()) moving.error = error;
    }
  } finally {
    if (revision === moveRevision) moveRunning = false;
  }
  // the live queue after the finish steps: a move queued while this one finished is never left behind
  if (revision === moveRevision && moving.done && moving.queued.length) {
    const [next, ...rest] = moving.queued;
    moving.queued = rest;
    await startMove(next.projectId, next.spec);
  }
}
/** Explicit consent to retry only the reviewed joint checks, keeping the original body request identity. */
export async function retryMoveMeasurements(projectId: string, spec: MoveSpec, reviewed: MeasurementRecoveryPlan) {
  const pending = JSON.stringify($state.snapshot(spec));
  const unchanged = () => !hmrReloading && !moveRunning && moving.projectId === projectId && !!moving.error && !moving.done && JSON.stringify($state.snapshot(moving.spec)) === pending;
  if (!unchanged()) throw new Error('This operation changed. Review the joint checks again.');
  const current = await (await createFlow()).measurementRecoveryPlan(projectId, { ...spec, measurementRecovery: undefined });
  const ids = (value: string[]) => JSON.stringify([...value].sort());
  if (!unchanged() || current.checks <= 0 || !current.recordIds.length || current.rigVersion !== reviewed.rigVersion || current.checks !== reviewed.checks || ids(current.recordIds) !== ids(reviewed.recordIds)) {
    throw new Error('The pending joint checks changed. Review their cost again.');
  }
  await startMove(projectId, { ...$state.snapshot(spec), measurementRecovery: { id: crypto.randomUUID(), recordIds: [...current.recordIds], rigVersion: current.rigVersion } });
}
/** Explicit bounded color cleanup on the reviewed cached body; all paid measurements still use the changed PNGs. */
export async function matchMoveBodyColors(projectId: string, spec: MoveSpec, reviewed: BodyPaletteRepairPlan) {
  const pending = JSON.stringify($state.snapshot(spec));
  const unchanged = () => !hmrReloading && !moveRunning && moving.projectId === projectId && !!moving.error && !moving.done && !spec.bodyPaletteRepair && JSON.stringify($state.snapshot(moving.spec)) === pending;
  if (!unchanged()) throw new Error('This operation changed. Review the body colors again.');
  const current = await (await createFlow()).bodyPaletteRepairPlan(projectId, { ...spec, measurementRecovery: undefined });
  const review = (plan: typeof current) => JSON.stringify({ ...plan, directions: [...plan.directions].sort(), rawHashes: [...plan.rawHashes].sort(), recordIds: [...plan.recordIds].sort() });
  if (!unchanged() || current.changedPixels <= 0 || current.changedFrames <= 0 || !current.directions.length || review(current) !== review(reviewed)) {
    throw new Error('The body color corrections changed. Review their cost again.');
  }
  await startMove(projectId, { ...$state.snapshot(spec), measurementRecovery: undefined, bodyPaletteRepair: { id: crypto.randomUUID(), version: 'near-rest-v1', rigVersion: current.rigVersion } });
}
let moveResumed = false;
export async function resumeMove() {
  if (hmrReloading || moveResumed || queue.role === 'follower') return;
  moveResumed = true;
  const r = await db.get<FlowDraft<MoveSpec> & { projectId: string; queued?: QueuedMove[] }>('projects', MOVE_KEY).catch(() => undefined);
  if (!r?.spec || moving.spec) return;
  const { queued, ...record } = r;
  moving.queued = queued ?? [];
  moveRecord = record; // a halted move keeps its stored record while moves are queued behind it
  if (halted(r)) Object.assign(moving, { spec: r.spec, projectId: r.projectId, progress: r.progress ?? null, error: r.error || STOPPED, done: false, fitIds: [], warnings: [] });
  else void startMove(r.projectId, r.spec);
}
/** Drops the failed or finished move and the moves queued for the same character; other characters' queued moves go on. */
export async function dismissMove() {
  if (moveRunning) return;
  moveRevision++;
  const others = moving.queued.filter((q) => q.projectId !== moving.projectId);
  Object.assign(moving, { spec: null, projectId: '', progress: null, error: '', done: false, fitIds: [], warnings: [], queued: others });
  await storeMove(null);
  // others stay queued until one starts: a move started meanwhile (e.g. an item repair) takes them up when it finishes
  if (moveRunning || moving.spec || !moving.queued.length) return;
  const [next, ...rest] = moving.queued;
  moving.queued = rest;
  await startMove(next.projectId, next.spec);
}

// ---------- imported character setup ----------
export const settingUp = $state({ spec: null as SetupSpec | null, progress: null as Progress | null, error: '', done: false, warnings: [] as string[] });
const SETUP_KEY = 'studio-setup';
let setupRunning = false, setupResumed = false, setupRevision = 0;
export async function startSetup(spec: SetupSpec) {
  if (hmrReloading || setupRunning) return;
  spec = withActivityScope(spec, 'setup');
  setupRunning = true;
  const revision = ++setupRevision, current = () => revision === setupRevision && setupRunning;
  let failed = false;
  Object.assign(settingUp, { spec, progress: null, error: '', done: false, warnings: [] });
  try {
    await flushSave();
    await db.put('projects', SETUP_KEY, { id: SETUP_KEY, spec, status: 'running', requestText: REQUEST_TEXT });
    await (await setupFlow()).setupCharacter(spec, (p) => { if (current() && !failed) settingUp.progress = p; });
    if (!current()) return;
    settingUp.done = true;
    const rec = await db.get<{ rigQa?: { warnings?: string[] } }>('projects', spec.projectId);
    if (!current()) return;
    settingUp.warnings = rec?.rigQa?.warnings ?? [];
    await db.del('projects', SETUP_KEY);
    if (!current()) return;
    if (viewing(spec.projectId)) await openProject(spec.projectId);
    toast('Character ready for skeleton-posed items and new moves');
  } catch (e) {
    if (current()) {
      failed = true;
      settingUp.error = e instanceof Error ? e.message : String(e);
      const error = await persistFlowFailure(SETUP_KEY, { spec, progress: $state.snapshot(settingUp.progress) }, e);
      if (current()) settingUp.error = error;
    }
  }
  finally { if (revision === setupRevision) setupRunning = false; }
}
export async function resumeSetup() {
  if (hmrReloading || setupResumed || queue.role === 'follower') return;
  setupResumed = true;
  const rec = await db.get<FlowDraft<SetupSpec>>('projects', SETUP_KEY).catch(() => undefined);
  if (!rec?.spec || settingUp.spec) return;
  if (halted(rec)) Object.assign(settingUp, { spec: rec.spec, progress: rec.progress ?? null, error: rec.error || 'Setup stopped. Review Activity before trying again.', done: false, warnings: [] });
  else void startSetup(rec.spec);
}
export async function dismissSetup() {
  if (setupRunning) return;
  setupRevision++;
  Object.assign(settingUp, { spec: null, progress: null, error: '', done: false, warnings: [] });
  await db.del('projects', SETUP_KEY);
}
