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
// Every layer is a sprite of its own; one clock per doll picks the same cell for all of them, so layers cannot drift.
//   const m = await loadPaperdoll(game, 'pixeldoll/hero/');   // the folder that holds manifest.json
//   const doll = new Paperdoll(game, 200, 150, m); doll.play('walk', 'south'); doll.equip('head', null);
// x, y is the doll's pivot (its feet) in world units. Manifest screen: "pixelArt": true keeps the pixels crisp.

export const texKey = (m, item, layer, anim) => 'pd:' + JSON.stringify([m._base, item, layer, anim]);
const fragmentKey = (anim, part) => part ? part + ':' + anim : anim;
const loads = new WeakMap(); // game.assets -> folder -> loading manifest
const grids = new WeakMap(); // game.assets -> texture keys this module registered
const available = (m, a) => m.rig.directions.filter((d) => !a.directions || a.directions.includes(d.id));
// In a top-down world, each layer of a doll sorts this much after the one before it, all at the doll's feet.
const ORDER_STEP = 1 / 1024;

function registered(game) {
  let keys = grids.get(game.assets);
  if (!keys) grids.set(game.assets, keys = new Set());
  return keys;
}

function loaded(job, what) {
  if (job.ok) return;
  const failed = (job.failed ?? []).map((f) => f.url ?? f.key ?? String(f));
  throw new Error('PixelDoll: failed to load ' + (failed.length ? failed.join(', ') : what));
}

/** Pixels the palette swap reads; null where there is nothing to draw on (a headless run reserves blank frames). */
function decode(bytes) {
  if (!bytes || !bytes.byteLength || typeof createImageBitmap !== 'function') return Promise.resolve(null);
  return createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}

/**
 * Loads manifest.json and every layer sheet under \`base\` (relative to the game's base URL), and registers each sheet
 * as a grid in the atlas. Await it before game.start() so the loading screen covers it, or in a scene's enter().
 */
export async function loadPaperdoll(game, base) {
  base = base.endsWith('/') ? base : base + '/';
  let cache = loads.get(game.assets);
  if (!cache) loads.set(game.assets, cache = new Map());
  if (cache.has(base)) return cache.get(base);
  const work = (async () => {
    const key = 'pd:manifest:' + base;
    const manifestJob = game.assets.load([{ kind: 'json', key, url: base + 'manifest.json' }]);
    await manifestJob;
    loaded(manifestJob, base + 'manifest.json');
    const m = structuredClone(game.assets.get(key));
    if (!m?.rig) throw new Error('PixelDoll: ' + base + 'manifest.json has no rig (a headless run loads no files)');
    m._base = base;
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
    const bytesKey = (sheet) => 'pd:bytes:' + base + sheet;
    const job = game.assets.load(sheets.filter((s) => !game.assets.has(bytesKey(s))).map((s) => ({ kind: 'binary', key: bytesKey(s), url: base + s })));
    await job;
    loaded(job, base);
    const pixels = new Map(await game.assets.track('pixeldoll:' + base, () =>
      Promise.all(sheets.map(async (s) => [s, await decode(game.assets.get(bytesKey(s)))]))));
    const keys = registered(game);
    for (const e of entries) {
      const image = pixels.get(e.sheet);
      if (image && (image.width !== e.w * e.cols || image.height !== e.h * e.rows))
        throw new Error('PixelDoll: ' + e.sheet + ' is ' + image.width + 'x' + image.height + ', expected ' + e.w * e.cols + 'x' + e.h * e.rows);
      m._sources[e.key] = { image, w: e.w, h: e.h, cols: e.cols, rows: e.rows };
      if (!keys.has(e.key)) { game.assets.addGrid(e.key, image, e.w, e.h, e.cols, e.rows); keys.add(e.key); }
    }
    return m;
  })();
  cache.set(base, work);
  try { return await work; } catch (error) { cache.delete(base); throw error; }
}

export class Paperdoll {
  /**
   * @param options { id?: string, layer?: string, z?: number, scale?: number, tags?: string[] }: id names the sprites
   * (id-1, id-2 …), layer is a layer the composed world declares, z nudges the whole doll's depth.
   */
  constructor(game, x, y, manifest, preset = manifest.presets[0] ?? { items: {}, variants: {} }, options = {}) {
    const resolved = resolvePreset(manifest, preset);
    this.game = game;
    this.m = manifest;
    this.equipped = resolved.items;
    this.variants = resolved.variants;
    this.state = { x, y, scale: options.scale ?? 1, z: options.z ?? 0, visible: true };
    // A world's first layer is its backdrop's, so a doll goes on the world's "world" layer when it has one.
    const layer = options.layer ?? (game.world?.layers?.includes('world') ? 'world' : undefined);
    this.spawn = () => game.spawn({ id: options.id ?? 'pixeldoll', visible: false, tags: options.tags ?? [], ...(layer ? { layer } : {}) });
    this.anim = null; this.dir = null; this.elapsed = 0;
    this.action = null;
    this.layerActions = false;
    this.placed = [];
    const body = manifest.items.find((i) => i.id === manifest.rig.baseItem);
    if (!body?.layers.some((l) => l.role === 'fg')) throw new Error('PixelDoll: missing foreground body layer');
    // The k-th sprite always shows the k-th layer of the draw list, so the doll's sprites are spawned in draw order and a
    // side-on world (z, then spawn order) keeps the whole doll together. A moving attack can draw a lower and an upper
    // copy of every (slot, role), hence twice as many.
    const roles = new Set(manifest.items.flatMap((i) => i.layers.map((l) => i.slot + '/' + l.role)));
    this.pool = Array.from({ length: roles.size * 2 }, () => this.spawn());
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
  get visible() { return this.state.visible; }
  set visible(v) { this.state.visible = !!v; this.layout(); }
  /** Moves the doll without the engine's in-between frame (a respawn or a cut). */
  teleport(x, y) { this.state.x = x; this.state.y = y; this.layout(true); }

  move() { return this.anim && this.m.rig.animations.find((a) => a.id === this.anim); }
  get completed() {
    const move = this.move();
    return !!move && !move.loop && this.elapsed >= timelineDuration(move.frames);
  }
  cell() {
    const move = this.move();
    return move ? sampleTimeline(move.frames, this.elapsed, move.loop) : null;
  }

  tick(dt) {
    // Rounded to a microsecond: sixty 1/60 s steps sum to 999.9999… ms, which would show each frame a step late.
    const after = (t) => Math.round((t + Math.max(0, dt) * 1000) * 1000) / 1000;
    if (this.anim) this.elapsed = after(this.elapsed);
    if (this.action) {
      this.action.elapsed = after(this.action.elapsed);
      if (this.action.elapsed >= timelineDuration(this.action.move.frames)) this.cancelAction();
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

  /** Points every sprite at its layer's cell and records where it goes; layout() places them. */
  sync() {
    const cell = this.cell();
    if (cell === null) return;
    const placed = [];
    const show = (sprite, item, layer, clip, part, direction, at, point) => {
      const key = this.texture(item, layer, clip, part), frame = this.frameIndex(direction, at, this.m.rig.animations.find((a) => a.id === clip).cells);
      const changed = sprite.pdKey !== key;
      sprite.setTexture(key, frame);
      sprite.pdKey = key;
      placed.push({ sprite, layer, point, changed });
    };
    if (this.action) {
      const { move, dir, elapsed, layered } = this.action;
      const pose = { clip: move.id, direction: dir, cell: sampleTimeline(move.frames, elapsed, false) };
      exportedActionDraws(this.m, this.equipped, pose, this.walkCell(), layered).forEach((draw, order) =>
        show(this.pool[order], draw.item, draw.layer, draw.clip, draw.part, draw.direction, draw.cell, draw.point));
    } else
      drawList(this.m, this.equipped, this.anim, this.dir, cell).forEach((draw, order) =>
        show(this.pool[order], draw.item, draw.layer, this.anim, null, this.dir, cell, { x: 0, y: 0 }));
    this.placed = placed;
    this.layout();
  }

  layout(cut = false) {
    const { x, y, scale, z, visible } = this.state;
    // A top-down world sorts by the bottom edge (y + height/2 + z): z moves every layer's sort point to the doll's feet,
    // a step apart in draw order. Other worlds draw by z, then spawn order, which the pool already follows.
    const feet = this.game.world?.kind === 'topdown';
    this.placed.forEach((p, order) => {
      const { sprite, layer, point, changed } = p;
      const f = layerFrame(this.m.rig, layer);
      sprite.x = x + (point.x + f.w / 2 - f.x) * scale;
      sprite.y = y + (point.y + f.h / 2 - f.y) * scale;
      sprite.width = f.w;
      sprite.height = f.h;
      sprite.scale = scale;
      sprite.z = z + (feet ? order * ORDER_STEP - (point.y + f.h - f.y) * scale : 0);
      sprite.visible = visible;
      if (cut || changed) sprite.snap();
      p.changed = false;
    });
    for (const sprite of this.pool.slice(this.placed.length)) sprite.visible = false;
  }

  destroy() {
    this.cancelAction();
    this.stepper.cancel();
    for (const sprite of this.pool) sprite.destroy();
  }
}
`;

export const PAPERDOLL_AE_DTS = `// Types for paperdoll.js, the PixelDoll runtime for Phaser AE. Data types are in types.d.ts.
import type { Manifest, Preset } from './types.js';

/** The \`game\` from './engine.js'. */
type Game = unknown;

export interface PaperdollOptions {
  /** Names the doll's sprites (id-1, id-2 …). Default 'pixeldoll'. */
  id?: string;
  /** A layer the composed world declares. Default: "world" when the world has it, else its first layer. */
  layer?: string;
  /** Moves the whole doll's depth; its layers keep their order. Default 0. */
  z?: number;
  /** Uniform scale. Default 1. */
  scale?: number;
  /** Tags on every sprite of the doll, for queries. */
  tags?: string[];
}

export type LoadedManifest = Manifest & { readonly _base: string };

/** Loads manifest.json and every sheet under \`base\` (relative to the game's base URL). */
export function loadPaperdoll(game: Game, base: string): Promise<LoadedManifest>;

export class Paperdoll {
  constructor(game: Game, x: number, y: number, manifest: LoadedManifest, preset?: Preset | string, options?: PaperdollOptions);
  /** The pivot (the feet), in world units. */
  x: number;
  y: number;
  scale: number;
  z: number;
  visible: boolean;
  readonly anim: string | null;
  readonly dir: string | null;
  readonly equipped: Record<string, string | null>;
  readonly variants: Record<string, string | null>;
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

1. Copy the whole export folder into the game's folder as game/${dir}
2. Add the paths in phaser-ae/assets.json to the "assets" list in game/manifest.json, so the build copies the
   sheets into the game (this needs no upload and no Pro account). Set "pixelArt": true in its "screen".
3. Load before the first scene, in main.ts, and show the doll in a scene:
     import { loadPaperdoll, Paperdoll } from './${dir}phaser-ae/paperdoll.js'
     const hero = await loadPaperdoll(game, '${dir}')     // before await game.start()
     // in a scene's enter():
     const doll = new Paperdoll(game, 360, 640, hero)
     doll.play(${JSON.stringify(initial?.id ?? 'walk')}, ${JSON.stringify(initial?.directions?.[0] ?? m.rig.directions[0]?.id ?? 'south')})
x, y is the doll's pivot (its feet) in world units; the layers line up on it. Each layer is a sprite of its own
(id "pixeldoll" unless options.id says otherwise), so inspect lists them. The doll's clock runs in a scene step:
create it in the scene that shows it, and it stops with that scene. In a top-down world the layers sort at the
doll's feet; options.z nudges the whole doll.
Move it with doll.x / doll.y every step, or doll.teleport(x, y) for a cut. doll.scale scales it.
Switch outfits with doll.applyPreset(outfitId) (an id from manifest.json's presets, or a preset object); it replaces the equipped items and the color selections, so call setVariants after it to keep custom colors. Unknown outfit IDs throw without changing the doll.
Call setActionLayering(true) to enable moving attacks when the ZIP contains precut fragments (manifest.actionLayers). canLayerAction(move, direction) checks the whole action set and equipped gear. Invalid playAction calls throw without changing playback. playAction(move, direction) returns "layered" or "full", plays once and leaves the gait clock running. Read actionPlaying for completion. Calling play cancels the action. An outfit that cannot be layered switches the action to full once; it stays full until the next action.

play(anim, dir) preserves an active clip's progress, starts changed moves/directions at the beginning and replays a completed once-only clip. Pass true as the third argument to restart explicitly.
doll.setDirection(dir) turns the active move (e.g. an aimed attack) while keeping its frame, time, loop position and completion. The current direction is a no-op; an unavailable direction or no active move throws before changing state.
Invalid move/direction, equipment and outfit IDs throw before changing state. Equip an item with doll.equip(slot, itemId); null empties a non-body slot.
Recolor with doll.setVariants({ "<material-id>": "<variant-id>" }).
setVariants replaces all explicit color selections. Omitted keys or null restore material defaults; an empty-string selection uses source colors. Linked materials follow their target's selection. Only variants listed in materials[].variants can be selected; an unknown material or variant id selects nothing.
Palette swaps use exact source RGBs and stored material ramps. Each recolored sheet is added to the atlas once and kept until the game ends.
Call doll.destroy() when removing a character.
paperdoll.js also exports the engine-neutral paper-doll API used inside PixelDoll itself (composeCell, drawList,
paletteMap, sampleTimeline); paperdoll.d.ts types the doll API and types.d.ts the manifest data.
Sheets: one grid per layer and move, a row per direction in manifest.rig.directions order and a column per cell.
`
		}
	];
}
