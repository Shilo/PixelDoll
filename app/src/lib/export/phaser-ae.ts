// Phaser AE export: the shared runtime plus an adapter for the Phaser AE kernel (a separate engine from Phaser 3 and 4).
// The sheets are the export's own grids; the game lists them in its manifest's "assets" so its build copies them.
import type { Manifest } from '../store/manifest.ts';
import type { OutFile } from './generic.ts';
import { runtimeSources, runtimeTypes } from '../runtime/sources.ts';

/** The folder the README suggests inside the AE game's `game/` folder. */
export const aeFolder = (m: Manifest) =>
	`pixeldoll/${m.exportId ?? m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`;

export const PAPERDOLL_AE_JS =
	Object.values(runtimeSources).join('\n') +
	'\n' +
	`// PixelDoll runtime for Phaser AE (kernel 3). No engine import: pass the game object from './engine.js'.
// A doll is ONE roster object, doll.actor, made an aggregate: the actor owns position, scale, rotation, alpha, tint and
// visibility, sorts, picks, collides and is followed as one object, and once a frame it emits every equipment layer
// around its own interpolated transform, in drawList order. One clock per doll picks the cell for every layer.
//   import heroData from './pixeldoll/hero/manifest.json';
//   const hero = await loadPaperdoll(game, 'pixeldoll/hero/', { manifest: heroData });   // before await game.start()
//   const doll = new Paperdoll(game, 200, 150, hero); doll.play('walk', 'south'); doll.equip('head', null);
// doll.x, doll.y is the pivot (the feet) in world units. Manifest screen: "pixelArt": true keeps the pixels crisp.

export const texKey = (m, item, layer, anim) => 'pd:' + JSON.stringify([m._base, item, layer, anim]);
const fragmentKey = (anim, part) => part ? part + ':' + anim : anim;
const loads = new WeakMap(); // game.assets -> base URL and folder -> loading manifest
const retries = new WeakMap(); // game.assets -> base URL and folder -> { attempt, sheets that failed last time }
const grids = new WeakMap(); // game.assets -> texture keys this module registered
const available = (m, a) => m.rig.directions.filter((d) => !a.directions || a.directions.includes(d.id));
// Sums of fixed steps miss exact frame boundaries by float error (120 steps of 1/120 s are 999.99… ms): sampling adds
// this much, so a boundary lands on the step that reaches it at any step rate. Looping clocks wrap, so it never grows.
const BOUNDARY_MS = 1e-3;
// The kernel's own rule (world2d): an object moved farther than this in one step is cut, not swept.
const CUT = 256;
const TAU = Math.PI * 2;
// Recolorable sheets are decoded in full; a side larger than this is not a PixelDoll sheet.
const MAX_SIDE = 16384;

function perGame(map, game) {
  let value = map.get(game.assets);
  if (!value) map.set(game.assets, value = new Map());
  return value;
}

function registered(game) {
  let keys = grids.get(game.assets);
  if (!keys) grids.set(game.assets, keys = new Set());
  return keys;
}

/** Recolorable sheets keep exact straight RGBA: canvas readback premultiplies alpha and would miss palette entries. */
const recolorable = (item) => item.materials.length > 0;

/** A palette grid for one sheet and one set of colors, built once per game from the sheet's exact pixels. */
function paletteGrid(game, m, item, layer, anim, part, variants) {
  const original = texKey(m, item.id, layer.id, fragmentKey(anim, part));
  const table = paletteMap(m, item, variants);
  if (!table.size) return original;
  const key = original + ':palette:' + JSON.stringify([...table]), keys = registered(game);
  if (keys.has(key)) return key;
  const { pixels, w, h, cols, rows } = m._sources[original];
  let canvas = null;
  if (pixels) {
    canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(pixels.w, pixels.h) : document.createElement('canvas');
    canvas.width = pixels.w; canvas.height = pixels.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PixelDoll: Canvas 2D is unavailable');
    ctx.putImageData(new ImageData(applyPalette(pixels, table).data, pixels.w, pixels.h), 0, 0);
  }
  game.assets.addGrid(key, canvas, w, h, cols, rows);
  keys.add(key);
  return key;
}

/** The palette grids an outfit draws: its shown items (tucked variants included), every move and action fragment. */
function prepareColors(game, m, preset) {
  const { items, variants } = resolvePreset(m, preset);
  for (const item of shownItems(m, equipped(m, items))) if (recolorable(item)) for (const layer of item.layers) for (const a of m.rig.animations) {
    paletteGrid(game, m, item, layer, a.id, null, variants);
    for (const part of ['lower', 'upper']) if (layer.actionSheets?.[part]?.[a.id]) paletteGrid(game, m, item, layer, a.id, part, variants);
  }
}

/**
 * Loads every layer sheet under \`base\` (relative to the game's base URL) and registers each as a grid in the atlas.
 * options.manifest: the folder's manifest.json as a static JSON import, so a headless replay (which fetches nothing)
 * builds the same frames; without it the manifest is fetched. options.prepare: outfit ids (or preset objects) whose
 * colors are built now, under the loading screen, besides the first outfit's. Await it before game.start().
 * It throws naming the file; calling it again retries, fetching the files that failed afresh.
 */
export async function loadPaperdoll(game, base, options = {}) {
  base = base.endsWith('/') ? base : base + '/';
  const cache = perGame(loads, game), id = (game.assets.baseURL ?? '') + '|' + base;
  if (!cache.has(id)) {
    const work = load(game, base, id, options.manifest);
    cache.set(id, work);
    work.catch(() => cache.delete(id));
  }
  const m = await cache.get(id);
  // the palette grid cache skips colors already built, so a later caller's outfits are prepared too
  for (const preset of [m.presets[0] ?? { items: {}, variants: {} }, ...(options.prepare ?? [])]) prepareColors(game, m, preset);
  return m;
}

function load(game, base, id, data) {
  const retry = perGame(retries, game).get(id) ?? { attempt: 0, failed: new Set() };
  // Only the files that failed last time are fetched again past the loader's cache; this attempt records its own.
  const refetch = retry.failed, failed = new Set();
  retry.attempt++;
  const url = (file) => base + file + (refetch.has(file) ? '?pixeldoll=' + retry.attempt : '');
  const fail = (files, message) => {
    for (const file of files) failed.add(file);
    retry.failed = failed;
    perGame(retries, game).set(id, retry);
    return new Error('PixelDoll: ' + message);
  };
  const loaded = async (items, files) => {
    const job = game.assets.load(items);
    await job;
    if (job.ok) return;
    throw fail((job.failed ?? []).map((f) => files.get(f.key) ?? f.key),
      'failed to load ' + (job.failed ?? []).map((f) => (f.url ?? f.key) + (f.error ? ' (' + f.error + ')' : '')).join(', '));
  };
  return game.assets.track('pixeldoll:' + id, async () => {
    let source = data;
    if (!source) {
      const key = 'pd:manifest:' + id;
      if (refetch.has('manifest.json') || !game.assets.has(key))
        await loaded([{ kind: 'json', key, url: url('manifest.json') }], new Map([[key, 'manifest.json']]));
      source = game.assets.get(key);
      if (!source?.rig) throw fail(['manifest.json'], base + 'manifest.json did not load (a headless run fetches nothing: pass options.manifest)');
    }
    const m = structuredClone(source);
    m._base = id;
    m._sources = {};
    const entries = [];
    for (const it of m.items) for (const l of it.layers) for (const a of m.rig.animations) {
      const { w, h } = layerFrame(m.rig, l), grid = { w, h, cols: a.cells, rows: m.rig.directions.length, exact: recolorable(it) };
      entries.push({ key: texKey(m, it.id, l.id, a.id), sheet: l.sourceSheets?.[a.id] ?? l.sheets[a.id], ...grid });
      for (const part of ['lower', 'upper']) {
        const sheet = l.actionSheets?.[part]?.[a.id];
        if (sheet) entries.push({ key: texKey(m, it.id, l.id, fragmentKey(a.id, part)), sheet, ...grid });
      }
    }
    const sheets = [...new Set(entries.map((e) => e.sheet))];
    const exact = new Set(entries.filter((e) => e.exact).map((e) => e.sheet));
    const bytesKey = (sheet) => 'pd:bytes:' + id + sheet;
    const files = new Map(sheets.map((s) => [bytesKey(s), s]));
    await loaded(sheets.filter((s) => refetch.has(s) || !game.assets.has(bytesKey(s))).map((s) => ({ kind: 'binary', key: bytesKey(s), url: url(s) })), files);
    // Headless (no image decoding) every sheet registers blank, as the kernel's own loader does, so a replay holds the
    // same frames. In a browser an empty or broken file is an error.
    const browser = typeof createImageBitmap === 'function';
    // Decode everything first, then register in a fixed order, so frame indices match a headless replay.
    const settled = await Promise.allSettled(sheets.map(async (s) => {
      if (!browser) return [s, { bitmap: null, pixels: null }];
      const bytes = game.assets.get(bytesKey(s));
      let bitmap = null;
      try {
        if (!bytes?.byteLength) throw new Error('the file is empty');
        bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        const pixels = exact.has(s) ? await decodePngBytes(new Uint8Array(bytes), MAX_SIDE) : null;
        return [s, { bitmap, pixels }];
      } catch (error) {
        bitmap?.close?.();
        const cause = String(error?.message ?? error);
        throw Object.assign(new Error(base + s + ' could not be decoded (' + cause + ')' + (cause.includes('8-bit') ? '; save it as an 8-bit RGBA PNG' : '')), { sheet: s });
      }
    }));
    const decoded = new Map(settled.flatMap((r) => r.status === 'fulfilled' ? [r.value] : []));
    try {
      const problems = settled.flatMap((r) => r.status === 'rejected' ? [[r.reason.sheet, r.reason.message]] : []);
      for (const e of entries) {
        const bitmap = decoded.get(e.sheet)?.bitmap;
        if (bitmap && (bitmap.width !== e.w * e.cols || bitmap.height !== e.h * e.rows) && !problems.some(([s]) => s === e.sheet))
          problems.push([e.sheet, base + e.sheet + ' is ' + bitmap.width + 'x' + bitmap.height + ', expected ' + e.w * e.cols + 'x' + e.h * e.rows]);
      }
      if (problems.length) throw fail(problems.map(([s]) => s), problems.map(([, message]) => message).join('; '));
      const keys = registered(game);
      for (const e of entries) {
        const { bitmap, pixels } = decoded.get(e.sheet);
        m._sources[e.key] = { pixels, w: e.w, h: e.h, cols: e.cols, rows: e.rows };
        // a sheet fetched again after a failure repaints its grid in place
        if (!keys.has(e.key) || refetch.has(e.sheet)) { game.assets.addGrid(e.key, bitmap, e.w, e.h, e.cols, e.rows); keys.add(e.key); }
      }
    } finally {
      for (const { bitmap } of decoded.values()) bitmap?.close?.();
    }
    perGame(retries, game).delete(id);
    return m;
  });
}

/** '#rrggbb' or '#rrggbbaa' (how the kernel reads a tint back) as the sink's 0xRRGGBBAA. */
function packTint(css) {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(css ?? '#ffffff');
  if (!hex) throw new Error('PixelDoll: tint must be #rrggbb or #rrggbbaa, not ' + css);
  return (parseInt(hex[1], 16) * 256 + parseInt(hex[2] ?? 'ff', 16)) >>> 0;
}

function lerpAngle(from, to, t) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return from + d * t;
}

function wrapDelta(d, size) {
  if (size <= 0) return d;
  d %= size;
  if (d > size / 2) d -= size; else if (d < -size / 2) d += size;
  return d;
}

export class Paperdoll {
  /**
   * @param options { id?, layer?, z?, scale?, tags?, box? }: id names the actor, layer is a layer the composed world
   * declares, z nudges its depth, tags go on the actor, and box { w, h, x, y } is the actor's box in pixels with the
   * pivot at (x, y) inside it (default: the rig cell and pivot).
   */
  constructor(game, x, y, manifest, preset = manifest.presets[0] ?? { items: {}, variants: {} }, options = {}) {
    const resolved = resolvePreset(manifest, preset);
    const body = manifest.items.find((i) => i.id === manifest.rig.baseItem);
    if (!body?.layers.some((l) => l.role === 'fg')) throw new Error('PixelDoll: missing foreground body layer');
    const box = options.box ?? rigFrame(manifest.rig), scale = options.scale ?? 1;
    this.game = game;
    this.m = manifest;
    this.equipped = resolved.items;
    this.variants = resolved.variants;
    this.box = { w: box.w, h: box.h, x: box.x, y: box.y };
    this.nudge = options.z ?? 0;
    this.anim = null; this.dir = null; this.elapsed = 0; this.stamp = -1;
    this.action = null;
    this.layerActions = false;
    this.placed = [];
    this.drawn = null;
    this.version = 0;
    this.tinted = { css: null, packed: 0xffffffff };
    this.disposed = false;
    // A world's first layer is its backdrop's: a doll goes on the "world" layer when the world has one.
    const layers = game.world?.layers ?? [];
    const layer = options.layer ?? (layers.includes('world') ? 'world' : layers[0]);
    /** The doll as one game object: its box is options.box around the pivot, for picking, collision and camera follow. */
    this.actor = game.spawn({
      id: options.id ?? 'pixeldoll', tags: options.tags ?? [], ...(layer ? { layer } : {}),
      x: x + (box.w / 2 - box.x) * scale, y: y + (box.h / 2 - box.y) * scale, width: box.w, height: box.h, scale
    });
    this.onWorld = !!layer && layers.includes(layer);
    const doll = this;
    game.roster.aggregate(this.actor, { get count() { return doll.placed.length; }, emit: (out, alpha, view) => this.emit(out, alpha, view) });
    const name = 'pixeldoll:' + this.actor.id;
    this.stepper = game.step(name, (dt) => this.tick(dt));
    // The feet correction follows the actor's live scale; the world resolves depth after frame callbacks.
    this.framer = game.frame(name, () => this.place());
    this.place();
  }

  get alive() { return !this.disposed && this.actor.alive; }
  /** From the pivot to the actor's center: the box offset, scaled and turned like the actor. */
  offset(a = this.actor) {
    const dx = (this.box.w / 2 - this.box.x) * a.sx, dy = (this.box.h / 2 - this.box.y) * a.sy;
    const cos = Math.cos(a.rot), sin = Math.sin(a.rot);
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  }
  get x() { return this.actor.x - this.offset().x; }
  set x(v) { this.actor.x = v + this.offset().x; }
  get y() { return this.actor.y - this.offset().y; }
  set y(v) { this.actor.y = v + this.offset().y; }
  /** Scales around the pivot (actor.scale scales around the box center). */
  get scale() { return this.actor.scale; }
  set scale(v) { const x = this.x, y = this.y; this.actor.scale = v; this.x = x; this.y = y; this.place(); }
  /** The doll's own depth nudge; actor.z also holds a top-down world's feet correction. */
  get z() { return this.nudge; }
  set z(v) { this.nudge = v; this.place(); }
  get visible() { return this.actor.visible; }
  set visible(v) { this.actor.visible = !!v; }
  get alpha() { return this.actor.alpha; }
  set alpha(v) { this.actor.alpha = v; }
  get tint() { return this.actor.tint; }
  set tint(v) { this.actor.tint = v; }
  /** Moves the doll without the engine's in-between frame (a respawn or a cut). */
  teleport(x, y) { this.x = x; this.y = y; this.actor.snap(); }

  move() { return this.anim && this.m.rig.animations.find((a) => a.id === this.anim); }
  /** A once-only move has played to its end and holds its last cell. */
  get completed() {
    const move = this.move();
    return !!move && !move.loop && this.elapsed + BOUNDARY_MS >= timelineDuration(move.frames);
  }
  cell() {
    const move = this.move();
    return move ? sampleTimeline(move.frames, this.elapsed + BOUNDARY_MS, move.loop) : null;
  }

  /** A clip started during this step starts counting next step, whichever step ran first. */
  frameNow() { return this.game.clock?.frame ?? -1; }

  tick(dt) {
    if (!this.actor.alive) { this.dispose(); return; }
    const ms = Math.max(0, dt) * 1000, now = this.frameNow();
    const move = this.move();
    if (move && this.stamp !== now) {
      this.elapsed += ms;
      if (move.loop) this.elapsed %= timelineDuration(move.frames);
    }
    if (this.action && this.action.stamp !== now) {
      this.action.elapsed += ms;
      if (this.action.elapsed + BOUNDARY_MS >= timelineDuration(this.action.move.frames)) this.action = null;
    }
    this.sync();
  }

  play(anim, dir, restart = false) {
    const move = this.m.rig.animations.find((a) => a.id === anim);
    if (!move || !available(this.m, move).some((d) => d.id === dir)) throw new Error('PixelDoll: unavailable move/direction ' + anim + '/' + dir);
    this.action = null;
    if (restart || anim !== this.anim || dir !== this.dir || this.completed) { this.elapsed = 0; this.stamp = this.frameNow(); }
    this.anim = anim; this.dir = dir;
    this.sync();
  }

  /** Turns the active move without restarting it: playlist entry, time, loop count and completion are kept. */
  setDirection(dir) {
    const move = this.move();
    if (!move) throw new Error('PixelDoll: no active move');
    if (!available(this.m, move).some((d) => d.id === dir)) throw new Error('PixelDoll: unavailable move/direction ' + this.anim + '/' + dir);
    if (dir === this.dir) return;
    this.dir = dir;
    this.sync();
  }

  get actionPlaying() { return this.action !== null; }
  setActionLayering(enabled) { this.layerActions = !!enabled; }
  canLayerAction(anim, dir) {
    const move = this.m.rig.animations.find((a) => a.id === anim);
    const walk = this.walkCell();
    return !!(move && walk && walk.direction === dir && available(this.m, move).some((d) => d.id === dir) &&
      canExportLayerAction(this.m, this.equipped, walk.clip, dir, anim));
  }
  playAction(anim, dir) {
    const move = this.m.rig.animations.find((a) => a.id === anim);
    if (!move || !available(this.m, move).some((d) => d.id === dir)) throw new Error('PixelDoll: unavailable move/direction ' + anim + '/' + dir);
    const layered = this.layerActions && this.canLayerAction(anim, dir);
    this.action = { move, dir, elapsed: 0, layered, lower: layered ? this.walkCell() : null, stamp: this.frameNow() };
    this.sync();
    return layered ? 'layered' : 'full';
  }
  /** Ends the action now and shows the gait again. */
  cancelAction() { this.action = null; this.sync(); }
  walkCell() {
    const cell = this.cell();
    return cell === null ? null : { clip: this.anim, direction: this.dir, cell };
  }

  equip(slot, itemId) {
    if (slot === 'body' || !validEquipment(this.m, slot, itemId)) throw new Error('PixelDoll: invalid equipment for ' + slot);
    this.equipped[slot] = itemId; this.version++; this.checkActionOutfit(); this.sync();
  }

  applyPreset(preset) {
    const resolved = resolvePreset(this.m, preset);
    this.equipped = resolved.items;
    this.checkActionOutfit();
    this.setVariants(resolved.variants);
  }

  setVariants(variants) { this.variants = { ...variants }; this.version++; this.sync(); }

  checkActionOutfit() {
    const action = this.action;
    if (action?.layered && action.lower)
      action.layered = canExportLayerAction(this.m, this.equipped, action.lower.clip, action.dir, action.move.id);
  }

  /** The item drawn in a slot: "<item>~<other>" (baked: hair tucked under a worn helmet, slots[].clips) when it exists. */
  shown(slot) {
    return shownItems(this.m, equipped(this.m, this.equipped)).find((item) => item.slot === slot)?.id;
  }

  frameIndex(direction, cell, cells) {
    return this.m.rig.directions.findIndex((d) => d.id === direction) * cells + cell;
  }

  /** Records each layer's frame and offset from the pivot in draw order, when the pose or appearance changed. */
  sync() {
    const cell = this.cell(), action = this.action;
    const pose = action && { clip: action.move.id, direction: action.dir, cell: sampleTimeline(action.move.frames, action.elapsed + BOUNDARY_MS, false) };
    if (action?.layered) action.lower = holdActionWalk(action.lower, this.walkCell(), action.dir);
    const signature = JSON.stringify([this.anim, this.dir, cell, pose, action?.layered, action?.lower, this.version]);
    if (signature === this.drawn) return;
    this.drawn = signature;
    const placed = [];
    const show = (item, layer, clip, part, direction, at, point) => {
      const f = layerFrame(this.m.rig, layer), key = paletteGrid(this.game, this.m, item, layer, clip, part, this.variants);
      placed.push({
        key,
        frame: this.game.assets.frames(key) + this.frameIndex(direction, at, this.m.rig.animations.find((a) => a.id === clip).cells),
        w: f.w, h: f.h, ox: point.x + f.w / 2 - f.x, oy: point.y + f.h / 2 - f.y
      });
    };
    // A whole-body action needs no gait; a layered one was only allowed with one.
    if (action)
      for (const draw of exportedActionDraws(this.m, this.equipped, pose, action.lower, action.layered))
        show(draw.item, draw.layer, draw.clip, draw.part, draw.direction, draw.cell, draw.point);
    else if (cell !== null)
      for (const draw of drawList(this.m, this.equipped, this.anim, this.dir, cell))
        if (draw.layer) show(draw.item, draw.layer, this.anim, null, this.dir, cell, { x: 0, y: 0 });
    this.placed = placed;
  }

  /** A top-down world sorts by y + height * |sy| / 2 + z: z puts the actor's sort point at the pivot. */
  place() {
    if (!this.alive) return;
    const a = this.actor;
    // the kernel's sort key ignores rotation: y + height * |sy| / 2 + z; this puts it at the pivot's y
    a.z = this.nudge - (this.game.world?.kind === 'topdown' ? this.offset().y + (this.box.h * Math.abs(a.sy)) / 2 : 0);
  }

  /** The aggregate's draw, once a frame: every layer around the actor's interpolated transform, in draw order. */
  emit(out, alpha, view) {
    const a = this.actor, p = a.prev, b = this.box;
    if (!this.placed.length) return;
    const dx = a.x - p.x, dy = a.y - p.y, cut = dx * dx + dy * dy > CUT * CUT;
    let cx = cut ? a.x : p.x + dx * alpha, cy = cut ? a.y : p.y + dy * alpha;
    const wrap = this.game.roster.wrap;
    if (wrap && view && this.onWorld) {
      cx = view.cx + wrapDelta(cx - view.cx, wrap.w);
      cy = view.cy + wrapDelta(cy - view.cy, wrap.h);
    }
    // a sign flip is a mirror, not a squash: never interpolate scale through zero (the kernel's rule)
    const sx = (p.sx < 0) !== (a.sx < 0) ? a.sx : p.sx + (a.sx - p.sx) * alpha;
    const sy = (p.sy < 0) !== (a.sy < 0) ? a.sy : p.sy + (a.sy - p.sy) * alpha;
    const rot = lerpAngle(p.rot, a.rot, alpha), cos = Math.cos(rot), sin = Math.sin(rot);
    if (this.tinted.css !== a.tint) this.tinted = { css: a.tint, packed: packTint(a.tint) };
    // offsets from the box center, scaled and turned like the actor
    const bx = b.w / 2 - b.x, by = b.h / 2 - b.y;
    for (const part of this.placed) {
      const ox = (part.ox - bx) * sx, oy = (part.oy - by) * sy;
      out.add(cx + ox * cos - oy * sin, cy + ox * sin + oy * cos, part.w, part.h, part.frame, this.tinted.packed, rot, sx, sy, a.alpha);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.action = null;
    this.stepper.cancel();
    this.framer.cancel();
    this.placed = [];
  }

  /** Removes the doll now; leaving its scene removes it too. Safe to call more than once. */
  destroy() {
    const live = this.actor.alive;
    this.dispose();
    if (!live) return;
    this.game.roster.aggregate(this.actor, null);
    this.actor.destroy();
  }
}
`;

export const PAPERDOLL_AE_DTS = `// Types for paperdoll.js, the PixelDoll runtime for Phaser AE. Data types are in types.d.ts.
import type { Manifest, Preset } from './types.js';

/** The parts of the kernel's \`game\` (from './engine.js') the doll uses. */
export interface PaperdollGame {
  assets: {
    load(items: never): unknown;
    get(key: string): unknown;
    has(key: string): boolean;
    track(key: string, work: never): Promise<unknown>;
    addGrid(...args: never[]): number;
    frames(key: string): number;
    baseURL: string;
  };
  roster: { aggregate(handle: never, aggregate: never): void };
  world?: unknown;
  clock?: { readonly frame: number };
  spawn(spec: never): PaperdollActor;
  step(name: string, fn: (dt: number) => void): { cancel(): void };
  frame(name: string, fn: (alpha: number) => void): { cancel(): void };
}

/** What every actor has; Paperdoll<typeof game> gives doll.actor your game's full Sprite type instead. */
export interface PaperdollActor {
  readonly id: string;
  readonly alive: boolean;
  x: number;
  y: number;
  rot: number;
  scale: number;
  alpha: number;
  tint: string;
  visible: boolean;
}

export interface PaperdollOptions {
  /** Names the actor (the first is id-1). Default 'pixeldoll'. */
  id?: string;
  /** A layer the composed world declares. Default: "world" when the world has it, else its first layer. */
  layer?: string;
  /** Moves the doll's depth. Default 0. */
  z?: number;
  /** Uniform scale around the pivot. Default 1. */
  scale?: number;
  /** Tags on the actor, for queries and collision rules. */
  tags?: string[];
  /** The actor's box in pixels, with the pivot at (x, y) inside it. Default: the rig cell and pivot. */
  box?: { w: number; h: number; x: number; y: number };
}

export interface LoadOptions {
  /** The folder's manifest.json (a static JSON import). Without it the manifest is fetched; a headless run fetches nothing. */
  manifest?: unknown;
  /** Outfit ids or objects whose colors are built under the loading screen, besides the first outfit's. */
  prepare?: (Preset | string)[];
}

export type LoadedManifest = Manifest & { readonly _base: string };

/** Loads every sheet under \`base\` (relative to the game's base URL). */
export function loadPaperdoll(game: PaperdollGame, base: string, options?: LoadOptions): Promise<LoadedManifest>;

export class Paperdoll<G extends PaperdollGame = PaperdollGame> {
  constructor(game: G, x: number, y: number, manifest: LoadedManifest, preset?: Preset | string, options?: PaperdollOptions);
  /** The doll as one game object (a Sprite with every composed pack's fields): follow, pick, collide, tween or inspect it. */
  readonly actor: ReturnType<G['spawn']>;
  /** False once the doll is destroyed, its actor killed or its scene left. */
  readonly alive: boolean;
  /** The pivot (the feet), in world units: read from and written to the actor. */
  x: number;
  y: number;
  /** Uniform scale around the pivot. */
  scale: number;
  /** The doll's depth nudge. */
  z: number;
  visible: boolean;
  /** The actor's opacity, 0..1, for every layer. */
  alpha: number;
  /** The actor's tint, #rrggbb, multiplied into every layer. */
  tint: string;
  readonly anim: string | null;
  readonly dir: string | null;
  readonly equipped: Record<string, string | null>;
  readonly variants: Record<string, string | null>;
  /** A once-only move has played to its end and holds its last cell. */
  readonly completed: boolean;
  readonly actionPlaying: boolean;
  /** Moves the doll without the engine's in-between frame. */
  teleport(x: number, y: number): void;
  play(anim: string, dir: string, restart?: boolean): void;
  setDirection(dir: string): void;
  equip(slot: string, itemId: string | null): void;
  applyPreset(preset: Preset | string): void;
  setVariants(variants: Record<string, string | null>): void;
  setActionLayering(enabled: boolean): void;
  canLayerAction(anim: string, dir: string): boolean;
  playAction(anim: string, dir: string): 'layered' | 'full';
  cancelAction(): void;
  shown(slot: string): string | undefined;
  /** Removes the doll now; leaving its scene removes it too. */
  destroy(): void;
}
`;

export const phaserAeRuntime = {
	revision: 1,
	files: [
		{ name: 'paperdoll.js', data: PAPERDOLL_AE_JS },
		{ name: 'paperdoll.d.ts', data: PAPERDOLL_AE_DTS },
		{ name: 'types.d.ts', data: runtimeTypes }
	]
};

export function phaserAeFiles(m: Manifest, folder = false): OutFile[] {
	const assetsDir = aeFolder(m);
	const dir = folder ? '<folder>/<character>/' : assetsDir;
	const runtime = folder ? '<folder>/pixeldoll-phaser-ae/' : `${dir}phaser-ae/`;
	const assets = [
		'manifest.json',
		...new Set(
			m.items.flatMap((it) =>
				it.layers.flatMap((l) =>
					m.rig.animations.flatMap((a) => [
						l.sourceSheets?.[a.id] ?? l.sheets![a.id],
						...(['lower', 'upper'] as const).flatMap((part) => l.actionSheets?.[part]?.[a.id] ?? [])
					])
				)
			)
		)
		// The folder layout cannot know where the picked folder sits under game/, so its list is relative to the character
		// folder and the README says how to prefix it; editing the list would pause automatic publishing.
	].map((file) => (folder ? file : assetsDir + file));
	const initial = m.rig.animations.find((a) => (a.directions ?? m.rig.directions).length > 0);
	return [
		...(folder ? [] : phaserAeRuntime.files.map((f) => ({ ...f, name: 'phaser-ae/' + f.name }))),
		{ name: 'phaser-ae/assets.json', data: JSON.stringify(assets, null, 1) + '\n' },
		{
			name: 'phaser-ae/README.txt',
			data: `Phaser AE (the Phaser Game Agent's engine, not Phaser 3 or 4)

This is a local integration for a game folder made with the phaser-ae CLI: the game's build copies the files itself.
Phaser's own route for your files is "npm run -s upload" (Phaser AE Pro), which hosts them on phaser.io under keys in
game/assets.json; this export does not use it. PixelDoll's runtime (paperdoll.js) is MIT; the Phaser AE engine is
under Phaser's own license.

1. ${
				folder
					? `Keep the character under game/${dir}, where <folder> is the path from game/ to the folder you picked in
   PixelDoll and <character> is this character's folder in it. If you picked game/ itself, leave out "<folder>/"
   everywhere below: <character>/manifest.json and './pixeldoll-phaser-ae/paperdoll.js'.
   Its runtime is at ../pixeldoll-phaser-ae/paperdoll.js relative to this character folder. When copying the
   character, copy pixeldoll-phaser-ae too and keep them in the same parent folder. Include the shared module under game/
   so the build can import it. Rebuild and reload a running game to pick up runtime changes.
   Phaser AE's publish uploads game/ as the game's private source, including this folder's project.json (item prompts)
   and cells/.`
					: `Copy into the game's folder, under game/${dir}, only what the game needs: manifest.json, the phaser-ae/ folder and
   every file listed in phaser-ae/assets.json. Leave project.json, cells/, baked/ and the docs out: the game folder is
   the source that publishing uploads.`
			}
2. phaser-ae/assets.json is a list of paths for the "assets" list in game/manifest.json (not for game/assets.json):
   add them there, so the build copies the sheets next to the game. Set "pixelArt": true in its "screen".${
			folder
				? `
   The paths are relative to this character folder: prefix each with the path from game/ to it
   (${dir}), for example ${dir}manifest.json. Do not edit phaser-ae/assets.json; PixelDoll
   manages it. After adding moves or items, add the new paths from phaser-ae/assets.json the same way.`
				: ''
		}
3. Load once, before the first scene, in a module of its own (hero.ts), and import it where it is needed:
     // hero.ts
     import { game } from './engine.js'
     import { loadPaperdoll } from './${runtime}paperdoll.js'
     import heroData from './${dir}manifest.json'
     export const hero = await loadPaperdoll(game, '${dir}', { manifest: heroData })
     // main.ts imports './hero.js' before await game.start(); a scene file in game/scenes/:
     import { game } from '../engine.js'
     import { Paperdoll } from '../${runtime}paperdoll.js'
     import { hero } from '../hero.js'
     // in the scene's enter(), synchronously:
     const doll = new Paperdoll(game, 360, 640, hero)
     doll.play(${JSON.stringify(initial?.id ?? 'walk')}, ${JSON.stringify(initial?.directions?.[0] ?? m.rig.directions[0]?.id ?? 'south')})
     game.rig.follow(doll.actor)
Passing the imported manifest lets a headless replay, which fetches no files, build the same doll. loadPaperdoll
throws naming the file; calling it again retries, fetching the files that failed afresh. The first outfit's colors are
built under the loading screen; list other outfits in options.prepare, or the first doll wearing them builds them.

The doll is one game object, doll.actor (its id is "pixeldoll-1" for the first doll unless options.id says otherwise;
use doll.actor.id). The actor owns the doll's position, scale, rotation, alpha, tint and visibility, so collision,
tweens, verbs and the camera act on it directly, and it draws every layer itself, in order, so they move and sort
together. doll.x, doll.y is the pivot (the feet) in world units; doll.scale scales around the pivot, actor.scale around
the box center. Its box (options.box, default the rig cell around the pivot) is what picking and collision see. In a
top-down world it sorts at its feet: actor.z holds that correction plus options.z, so nudge depth with doll.z.
Put still dolls on whole-pixel positions (with an unscaled, aligned camera) so pixel art stays crisp.
The doll's clock is a step of the scene that created it: create it synchronously in the scene that shows it, and it
pauses with that scene and is removed when the scene is left (doll.alive turns false). A doll created after an awaited
load in enter() would belong to whatever scene is current then. A clip started with play() counts from the next step.
Read doll.completed for a once-only move that has ended.
Switch outfits with doll.applyPreset(outfitId) (an id from manifest.json's presets, or a preset object); it replaces the equipped items and the color selections, so call setVariants after it to keep custom colors. Unknown outfit IDs throw without changing the doll.
Call setActionLayering(true) to enable moving attacks when the ${folder ? 'character export' : 'ZIP'} contains precut fragments (manifest.actionLayers). canLayerAction(move, direction) checks the whole action set and equipped gear. Invalid playAction calls throw without changing playback. playAction(move, direction) returns "layered" or "full", plays once and leaves the gait clock running; a full action also plays on a doll with no move yet. Read actionPlaying for completion. Calling play cancels the action. An outfit that cannot be layered switches the action to full once; it stays full until the next action. A layered action holds the last gait cell in the action's direction when the gait faces away. Turning back resumes drawing the current gait cell. Both clocks keep running.

play(anim, dir) preserves an active clip's progress, starts changed moves/directions at the beginning and replays a completed once-only clip. Pass true as the third argument to restart explicitly.
doll.setDirection(dir) turns the active move (e.g. an aimed attack) while keeping its frame, time, loop position and completion. The current direction is a no-op; an unavailable direction or no active move throws before changing state.
Invalid move/direction, equipment and outfit IDs throw before changing state. Equip an item with doll.equip(slot, itemId); null empties a non-body slot.
Recolor with doll.setVariants({ "<material-id>": "<variant-id>" }).
setVariants replaces all explicit color selections. Omitted keys or null restore material defaults; an empty-string selection uses source colors. Linked materials follow their target's selection. Only variants listed in materials[].variants can be selected; an unknown material or variant id selects nothing.
Palette swaps match exact source RGBs, read from the PNG itself, and use the stored material ramps. Each recolored sheet is added to the atlas once and kept until the game ends; translucent pixels are drawn through the atlas's canvas, which can move them by a step or two.
doll.destroy() removes the doll before its scene ends; it is safe to call more than once.
paperdoll.d.ts types the doll API (Paperdoll is generic over the game, so doll.actor is your game's Sprite) and
types.d.ts the manifest data. Where a doll is stored or passed around, write its type as Paperdoll<typeof game>
(for example "let player: Paperdoll<typeof game> | null"), so doll.actor keeps your game's Sprite type.
Sheets: one grid per layer and move, a row per direction in manifest.rig.directions order and a column per cell.
`
		}
	];
}
