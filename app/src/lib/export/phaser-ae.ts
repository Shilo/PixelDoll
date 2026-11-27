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
// A doll is ONE roster object (doll.actor) made an aggregate: it sorts, picks, collides and is followed as one, and each
// frame it emits every equipment layer around its own interpolated position, in drawList order, so the layers can
// neither drift apart nor interleave with anything else. One clock per doll picks the cell for every layer.
//   import heroData from './pixeldoll/hero/manifest.json';
//   const hero = await loadPaperdoll(game, 'pixeldoll/hero/', heroData);   // before await game.start()
//   const doll = new Paperdoll(game, 200, 150, hero); doll.play('walk', 'south'); doll.equip('head', null);
// x, y is the doll's pivot (its feet) in world units. Manifest screen: "pixelArt": true keeps the pixels crisp.

export const texKey = (m, item, layer, anim) => 'pd:' + JSON.stringify([m._base, item, layer, anim]);
const fragmentKey = (anim, part) => part ? part + ':' + anim : anim;
const loads = new WeakMap(); // game.assets -> base URL and folder -> loading manifest
const grids = new WeakMap(); // game.assets -> texture keys this module registered
const available = (m, a) => m.rig.directions.filter((d) => !a.directions || a.directions.includes(d.id));
// Sums of fixed steps miss exact frame boundaries by float error (120 steps of 1/120 s are 999.99… ms): sampling adds
// this much, so a boundary lands on the step that reaches it at any step rate.
const BOUNDARY_MS = 1e-3;
// The kernel's own rule (world2d): an object moved farther than this in one step is cut, not swept.
const CUT = 256;

function registered(game) {
  let keys = grids.get(game.assets);
  if (!keys) grids.set(game.assets, keys = new Set());
  return keys;
}

function loaded(job, what) {
  if (job.ok) return;
  const failed = (job.failed ?? []).map((f) => (f.url ?? f.key ?? String(f)) + (f.error ? ' (' + f.error + ')' : ''));
  throw new Error('PixelDoll: failed to load ' + (failed.length ? failed.join(', ') : what));
}

/** Pixels the palette swap reads; null where there is nothing to draw on (a headless run reserves blank frames). */
function decode(bytes) {
  if (!bytes || !bytes.byteLength || typeof createImageBitmap !== 'function') return Promise.resolve(null);
  return createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}

function packTint(css) {
  const hex = /^#([0-9a-f]{6})$/i.exec(css);
  if (!hex) throw new Error('PixelDoll: tint must be #rrggbb, not ' + css);
  return (parseInt(hex[1], 16) * 256 + 255) >>> 0;
}

/**
 * Loads every layer sheet under \`base\` (relative to the game's base URL) and registers each as a grid in the atlas.
 * Pass the folder's manifest.json as \`data\` (a static JSON import), so a headless replay, which fetches nothing, builds
 * the same frames; without it the manifest is fetched too. Await it before game.start(), under the loading screen.
 * It throws after the engine's retries; calling it again retries the whole load.
 */
export async function loadPaperdoll(game, base, data) {
  base = base.endsWith('/') ? base : base + '/';
  let cache = loads.get(game.assets);
  if (!cache) loads.set(game.assets, cache = new Map());
  const id = (game.assets.baseURL ?? '') + '|' + base;
  if (cache.has(id)) return cache.get(id);
  const work = game.assets.track('pixeldoll:' + id, async () => {
    let source = data;
    if (!source) {
      const key = 'pd:manifest:' + id;
      const manifestJob = game.assets.load([{ kind: 'json', key, url: base + 'manifest.json' }]);
      await manifestJob;
      loaded(manifestJob, base + 'manifest.json');
      source = game.assets.get(key);
      if (!source?.rig) throw new Error('PixelDoll: ' + base + 'manifest.json did not load (a headless run fetches nothing: pass the manifest to loadPaperdoll)');
    }
    const m = structuredClone(source);
    m._base = id;
    m._sources = {};
    const entries = [];
    for (const it of m.items) for (const l of it.layers) for (const a of m.rig.animations) {
      const { w, h } = layerFrame(m.rig, l), grid = { w, h, cols: a.cells, rows: m.rig.directions.length };
      entries.push({ key: texKey(m, it.id, l.id, a.id), sheet: l.sourceSheets?.[a.id] ?? l.sheets[a.id], ...grid });
      for (const part of ['lower', 'upper']) {
        const sheet = l.actionSheets?.[part]?.[a.id];
        if (sheet) entries.push({ key: texKey(m, it.id, l.id, fragmentKey(a.id, part)), sheet, ...grid });
      }
    }
    const sheets = [...new Set(entries.map((e) => e.sheet))];
    const bytesKey = (sheet) => 'pd:bytes:' + id + sheet;
    const job = game.assets.load(sheets.filter((s) => !game.assets.has(bytesKey(s))).map((s) => ({ kind: 'binary', key: bytesKey(s), url: base + s })));
    await job;
    loaded(job, base);
    const pixels = new Map(await Promise.all(sheets.map(async (s) => [s, await decode(game.assets.get(bytesKey(s)))])));
    for (const e of entries) {
      const image = pixels.get(e.sheet);
      if (image && (image.width !== e.w * e.cols || image.height !== e.h * e.rows))
        throw new Error('PixelDoll: ' + base + e.sheet + ' is ' + image.width + 'x' + image.height + ', expected ' + e.w * e.cols + 'x' + e.h * e.rows);
    }
    const keys = registered(game);
    for (const e of entries) {
      const image = pixels.get(e.sheet);
      m._sources[e.key] = { image, w: e.w, h: e.h, cols: e.cols, rows: e.rows };
      if (!keys.has(e.key)) { game.assets.addGrid(e.key, image, e.w, e.h, e.cols, e.rows); keys.add(e.key); }
    }
    return m;
  });
  cache.set(id, work);
  try { return await work; } catch (error) { cache.delete(id); throw error; }
}

export class Paperdoll {
  /**
   * @param options { id?: string, layer?: string, z?: number, scale?: number, tags?: string[] }: id names the actor,
   * layer is a layer the composed world declares, z nudges the doll's depth and tags go on the actor for queries.
   */
  constructor(game, x, y, manifest, preset = manifest.presets[0] ?? { items: {}, variants: {} }, options = {}) {
    const resolved = resolvePreset(manifest, preset);
    const body = manifest.items.find((i) => i.id === manifest.rig.baseItem);
    if (!body?.layers.some((l) => l.role === 'fg')) throw new Error('PixelDoll: missing foreground body layer');
    this.game = game;
    this.m = manifest;
    this.equipped = resolved.items;
    this.variants = resolved.variants;
    this.state = { x, y, scale: options.scale ?? 1, z: options.z ?? 0, alpha: 1, tint: '#ffffff', packed: packTint('#ffffff') };
    this.anim = null; this.dir = null; this.elapsed = 0;
    this.action = null;
    this.layerActions = false;
    this.placed = [];
    // A world's first layer is its backdrop's: a doll goes on the "world" layer when the world has one.
    const layers = game.world?.layers ?? [];
    const layer = options.layer ?? (layers.includes('world') ? 'world' : layers[0]);
    /** The doll as one game object: its box is the rig cell around the pivot, for picking, collision and camera follow. */
    this.actor = game.spawn({ id: options.id ?? 'pixeldoll', tags: options.tags ?? [], ...(layer ? { layer } : {}) });
    const doll = this;
    game.roster.aggregate(this.actor, { get count() { return doll.placed.length; }, emit: (out, alpha) => this.emit(out, alpha) });
    this.layout(true);
    this.stepper = game.step('pixeldoll', (dt) => this.tick(dt));
  }

  get x() { return this.state.x; }
  set x(v) { this.state.x = v; this.layout(); }
  get y() { return this.state.y; }
  set y(v) { this.state.y = v; this.layout(); }
  get scale() { return this.state.scale; }
  set scale(v) { this.state.scale = v; this.layout(); }
  get z() { return this.state.z; }
  set z(v) { this.state.z = v; this.layout(); }
  get visible() { return this.actor.visible; }
  set visible(v) { this.actor.visible = !!v; }
  get alpha() { return this.state.alpha; }
  set alpha(v) { this.state.alpha = v; }
  get tint() { return this.state.tint; }
  set tint(v) { this.state.packed = packTint(v); this.state.tint = v; }
  /** Moves the doll without the engine's in-between frame (a respawn or a cut). */
  teleport(x, y) { this.state.x = x; this.state.y = y; this.layout(true); }

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

  tick(dt) {
    const ms = Math.max(0, dt) * 1000;
    if (this.anim) this.elapsed += ms;
    if (this.action) {
      this.action.elapsed += ms;
      if (this.action.elapsed + BOUNDARY_MS >= timelineDuration(this.action.move.frames)) this.cancelAction();
    }
    this.sync();
  }

  play(anim, dir, restart = false) {
    const move = this.m.rig.animations.find((a) => a.id === anim);
    if (!move || !available(this.m, move).some((d) => d.id === dir)) throw new Error('PixelDoll: unavailable move/direction ' + anim + '/' + dir);
    this.cancelAction();
    if (restart || anim !== this.anim || dir !== this.dir || this.completed) this.elapsed = 0;
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
    this.action = { move, dir, elapsed: 0, layered };
    this.sync();
    return layered ? 'layered' : 'full';
  }
  cancelAction() { this.action = null; }
  walkCell() {
    const cell = this.cell();
    return cell === null ? null : { clip: this.anim, direction: this.dir, cell };
  }

  equip(slot, itemId) {
    if (slot === 'body' || !validEquipment(this.m, slot, itemId)) throw new Error('PixelDoll: invalid equipment for ' + slot);
    this.equipped[slot] = itemId; this.checkActionOutfit(); this.sync();
  }

  applyPreset(preset) {
    const resolved = resolvePreset(this.m, preset);
    this.equipped = resolved.items;
    this.checkActionOutfit();
    this.setVariants(resolved.variants);
  }

  setVariants(variants) { this.variants = { ...variants }; this.sync(); }

  checkActionOutfit() {
    if (this.action?.layered) this.action.layered = this.canLayerAction(this.action.move.id, this.action.dir);
  }

  /** @param {'lower' | 'upper' | null} [part] */
  texture(item, layer, anim = this.anim, part = null) {
    const original = texKey(this.m, item.id, layer.id, fragmentKey(anim, part));
    const table = paletteMap(this.m, item, this.variants);
    if (!table.size) return original;
    const key = original + ':palette:' + JSON.stringify([...table]), keys = registered(this.game);
    if (!keys.has(key)) {
      const { image, w, h, cols, rows } = this.m._sources[original];
      let canvas = null;
      if (image) {
        canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(image.width, image.height) : document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('PixelDoll: Canvas 2D is unavailable');
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        pixels.data.set(applyPalette({ w: canvas.width, h: canvas.height, data: pixels.data }, table).data);
        ctx.putImageData(pixels, 0, 0);
      }
      this.game.assets.addGrid(key, canvas, w, h, cols, rows);
      keys.add(key);
    }
    return key;
  }

  /** The item drawn in a slot: "<item>~<other>" (baked: hair tucked under a worn helmet, slots[].clips) when it exists. */
  shown(slot) {
    return shownItems(this.m, equipped(this.m, this.equipped)).find((item) => item.slot === slot)?.id;
  }

  frameIndex(direction, cell, cells) {
    return this.m.rig.directions.findIndex((d) => d.id === direction) * cells + cell;
  }

  /** Records each layer's texture, cell and offset from the pivot in draw order; emit() draws them. */
  sync() {
    const cell = this.cell(), placed = [];
    const show = (item, layer, clip, part, direction, at, point) => {
      const f = layerFrame(this.m.rig, layer);
      placed.push({
        key: this.texture(item, layer, clip, part),
        local: this.frameIndex(direction, at, this.m.rig.animations.find((a) => a.id === clip).cells),
        w: f.w, h: f.h, ox: point.x + f.w / 2 - f.x, oy: point.y + f.h / 2 - f.y
      });
    };
    if (this.action) {
      // A whole-body action needs no gait; a layered one was only allowed with one.
      const { move, dir, elapsed, layered } = this.action;
      const pose = { clip: move.id, direction: dir, cell: sampleTimeline(move.frames, elapsed + BOUNDARY_MS, false) };
      for (const draw of exportedActionDraws(this.m, this.equipped, pose, this.walkCell(), layered))
        show(draw.item, draw.layer, draw.clip, draw.part, draw.direction, draw.cell, draw.point);
    } else if (cell !== null)
      for (const draw of drawList(this.m, this.equipped, this.anim, this.dir, cell))
        if (draw.layer) show(draw.item, draw.layer, this.anim, null, this.dir, cell, { x: 0, y: 0 });
    this.placed = placed;
  }

  /** Places the actor: its box is the rig cell around the pivot, and in a top-down world z puts its sort point at the feet. */
  layout(cut = false) {
    const { x, y, scale, z } = this.state, f = rigFrame(this.m.rig), a = this.actor;
    a.width = f.w;
    a.height = f.h;
    a.scale = scale;
    a.x = x + (f.w / 2 - f.x) * scale;
    a.y = y + (f.h / 2 - f.y) * scale;
    a.z = z - (this.game.world?.kind === 'topdown' ? (f.h - f.y) * scale : 0);
    if (cut) a.snap();
  }

  /** The aggregate's draw, once a frame: every layer around the actor's interpolated pivot, in draw order. */
  emit(out, alpha) {
    const a = this.actor, f = rigFrame(this.m.rig), { scale, packed } = this.state;
    const dx = a.x - a.prev.x, dy = a.y - a.prev.y, cut = dx * dx + dy * dy > CUT * CUT;
    let cx = cut ? a.x : a.prev.x + dx * alpha, cy = cut ? a.y : a.prev.y + dy * alpha;
    // A wrapping world draws each object at its image nearest the camera; an aggregate places its own instances.
    const wrap = this.game.roster.wrap, view = this.game.world?.view;
    if (wrap && view) {
      cx -= wrap.w * Math.round((cx - view.cx) / wrap.w);
      cy -= wrap.h * Math.round((cy - view.cy) / wrap.h);
    }
    const px = cx - (f.w / 2 - f.x) * scale, py = cy - (f.h / 2 - f.y) * scale;
    for (const part of this.placed)
      out.add(px + part.ox * scale, py + part.oy * scale, part.w * scale, part.h * scale,
        this.game.assets.frames(part.key) + part.local, packed, 0, 1, 1, this.state.alpha);
  }

  destroy() {
    this.cancelAction();
    this.stepper.cancel();
    this.game.roster.aggregate(this.actor, null);
    this.actor.destroy();
  }
}
`;

export const PAPERDOLL_AE_DTS = `// Types for paperdoll.js, the PixelDoll runtime for Phaser AE. Data types are in types.d.ts.
import type { Manifest, Preset } from './types.js';

/** The parts of the kernel's \`game\` (from './engine.js') the doll uses. */
export interface PaperdollGame {
  assets: { load(items: never): unknown; addGrid(...args: never[]): number; frames(key: string): number };
  roster: { aggregate(handle: never, aggregate: never): void };
  spawn(spec: never): unknown;
  step(name: string, fn: (dt: number) => void): { cancel(): void };
}

export interface PaperdollOptions {
  /** Names the actor (id-1, id-2 …). Default 'pixeldoll'. */
  id?: string;
  /** A layer the composed world declares. Default: "world" when the world has it, else its first layer. */
  layer?: string;
  /** Moves the doll's depth. Default 0. */
  z?: number;
  /** Uniform scale. Default 1. */
  scale?: number;
  /** Tags on the actor, for queries and collision rules. */
  tags?: string[];
}

export type LoadedManifest = Manifest & { readonly _base: string };

/** Loads every sheet under \`base\` (relative to the game's base URL). Pass the folder's manifest.json as \`data\`. */
export function loadPaperdoll(game: PaperdollGame, base: string, data?: unknown): Promise<LoadedManifest>;

export class Paperdoll {
  constructor(game: PaperdollGame, x: number, y: number, manifest: LoadedManifest, preset?: Preset | string, options?: PaperdollOptions);
  /** The doll as one game object: follow it, pick it, collide with it or inspect it. Its box is the rig cell. */
  readonly actor: unknown;
  /** The pivot (the feet), in world units. */
  x: number;
  y: number;
  scale: number;
  z: number;
  visible: boolean;
  /** Opacity 0..1 for every layer. */
  alpha: number;
  /** #rrggbb multiplied into every layer. */
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
  shown(slot: string): string | undefined;
  destroy(): void;
}
`;

export function phaserAeFiles(m: Manifest): OutFile[] {
	const dir = aeFolder(m);
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
	].map((file) => dir + file);
	const initial = m.rig.animations.find((a) => (a.directions ?? m.rig.directions).length > 0);
	return [
		{ name: 'phaser-ae/paperdoll.js', data: PAPERDOLL_AE_JS },
		{ name: 'phaser-ae/paperdoll.d.ts', data: PAPERDOLL_AE_DTS },
		{ name: 'phaser-ae/types.d.ts', data: runtimeTypes },
		{ name: 'phaser-ae/assets.json', data: JSON.stringify(assets, null, 1) + '\n' },
		{
			name: 'phaser-ae/README.txt',
			data: `Phaser AE (the Phaser Game Agent's engine, not Phaser 3 or 4)

This is a local integration for a game folder made with the phaser-ae CLI: the build copies the files itself.
Phaser's own route for your files is "npm run -s upload" (Phaser AE Pro), which hosts them on phaser.io under keys in
game/assets.json; this export does not use it.

1. Copy the whole export folder into the game's folder as game/${dir}
2. phaser-ae/assets.json is a list of paths for the "assets" list in game/manifest.json (not for game/assets.json):
   add them there, so the build copies the sheets next to the game. Set "pixelArt": true in its "screen".
3. Load before the first scene, in main.ts, and show the doll in a scene:
     import { loadPaperdoll, Paperdoll } from './${dir}phaser-ae/paperdoll.js'
     import heroData from './${dir}manifest.json'
     const hero = await loadPaperdoll(game, '${dir}', heroData)   // before await game.start()
     // in a scene's enter(), synchronously:
     const doll = new Paperdoll(game, 360, 640, hero)
     doll.play(${JSON.stringify(initial?.id ?? 'walk')}, ${JSON.stringify(initial?.directions?.[0] ?? m.rig.directions[0]?.id ?? 'south')})
Passing the imported manifest lets a headless replay, which fetches no files, build the same doll. loadPaperdoll
throws after the engine's retries (the error names the file); calling it again retries the whole load.
x, y is the doll's pivot (its feet) in world units; the layers line up on it. The doll is one game object, doll.actor
(id "pixeldoll" unless options.id says otherwise, with options.tags): follow it with the camera, pick it, collide with
it or inspect it. Its box is the rig cell around the pivot. It draws its layers itself, in order, so they move and
sort together; in a top-down world it sorts at its feet, and options.z nudges it.
The doll's clock is a step of the scene that created it: create it synchronously in the scene that shows it, and it
pauses and ends with that scene. A doll created after an awaited load in enter() would belong to whatever scene is
current then.
Move it with doll.x / doll.y every step, or doll.teleport(x, y) for a cut. doll.scale, doll.alpha, doll.tint
("#rrggbb") and doll.visible apply to every layer. Read doll.completed for a once-only move that has ended.
Switch outfits with doll.applyPreset(outfitId) (an id from manifest.json's presets, or a preset object); it replaces the equipped items and the color selections, so call setVariants after it to keep custom colors. Unknown outfit IDs throw without changing the doll.
Call setActionLayering(true) to enable moving attacks when the ZIP contains precut fragments (manifest.actionLayers). canLayerAction(move, direction) checks the whole action set and equipped gear. Invalid playAction calls throw without changing playback. playAction(move, direction) returns "layered" or "full", plays once and leaves the gait clock running; a full action also plays on a doll with no move yet. Read actionPlaying for completion. Calling play cancels the action. An outfit that cannot be layered switches the action to full once; it stays full until the next action.

play(anim, dir) preserves an active clip's progress, starts changed moves/directions at the beginning and replays a completed once-only clip. Pass true as the third argument to restart explicitly.
doll.setDirection(dir) turns the active move (e.g. an aimed attack) while keeping its frame, time, loop position and completion. The current direction is a no-op; an unavailable direction or no active move throws before changing state.
Invalid move/direction, equipment and outfit IDs throw before changing state. Equip an item with doll.equip(slot, itemId); null empties a non-body slot.
Recolor with doll.setVariants({ "<material-id>": "<variant-id>" }).
setVariants replaces all explicit color selections. Omitted keys or null restore material defaults; an empty-string selection uses source colors. Linked materials follow their target's selection. Only variants listed in materials[].variants can be selected; an unknown material or variant id selects nothing.
Palette swaps use exact source RGBs and stored material ramps. Each recolored sheet is added to the atlas once and kept until the game ends.
Call doll.destroy() when removing a character.
paperdoll.d.ts types the doll API and types.d.ts the manifest data.
Sheets: one grid per layer and move, a row per direction in manifest.rig.directions order and a column per cell.
`
		}
	];
}
