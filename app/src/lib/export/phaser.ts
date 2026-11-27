// Phaser 3.80+ / 4 export (manifest-spec §6.4): one TexturePacker JSON-Hash atlas per sheet + PaperdollContainer.js.
import type { Manifest } from '../store/manifest.ts';
import { CURRENT_FORMAT } from '../store/manifest.ts';
import type { OutFile } from './generic.ts';
import { layerFrame } from '../compose/compose.ts';
import { runtimeSources, runtimeTypes } from '../runtime/sources.ts';
import { atlasName } from '../runtime/paths.js';

export { atlasName };

export function atlasJson(
	m: Manifest,
	itemId: string,
	layerId: string,
	anim: string,
	part?: 'lower' | 'upper'
) {
	const { rig } = m;
	const it = m.items.find((i) => i.id === itemId)!,
		l = it.layers.find((x) => x.id === layerId)!,
		{ w, h, x: px, y: py } = layerFrame(rig, l);
	const a = rig.animations.find((x) => x.id === anim)!;
	const frames: Record<string, unknown> = {};
	rig.directions.forEach((d, r) => {
		for (let c = 0; c < a.cells; c++)
			frames[`${anim}_${d.id}_${c}`] = {
				frame: { x: c * w, y: r * h, w, h },
				rotated: false,
				trimmed: false,
				spriteSourceSize: { x: 0, y: 0, w, h },
				sourceSize: { w, h },
				pivot: { x: px / w, y: py / h } // per layer: oversize layers line up with the body by pivot
			};
	});
	return {
		frames,
		meta: {
			app: m.app,
			version: m.format,
			image: `../${part ? l.actionSheets?.[part]?.[anim] : (l.sourceSheets?.[anim] ?? l.sheets![anim])}`,
			format: 'RGBA8888',
			size: { w: a.cells * w, h: rig.directions.length * h },
			scale: '1'
		},
		pixeldoll: { item: it.id, layer: l.id, slot: it.slot, role: l.role, z: l.z, anim } // -> texture.customData
	};
}

export const PAPERDOLL_JS =
	Object.values(runtimeSources).join('\n') +
	'\n' +
	`// PixelDoll runtime for Phaser 3.80+ and Phaser 4 (pixeldoll/3). No Phaser import: works with the global or a bundled Phaser.
// The body sprite is the clock; every layer copies its frame name on each animation event, so layers cannot drift.
//   const m = await loadPaperdoll(scene, 'assets/hero/');   // folder that holds manifest.json
//   const doll = new Paperdoll(scene, 200, 150, m); doll.play('walk', 'south'); doll.equip('head', null);
// Game config: pixelArt: true, roundPixels: true (Phaser 4 defaults roundPixels to false).
// For exact Canvas pixels at integer positions, use scene.cameras.main.setRoundPixels(false): Canvas otherwise expands sprites by half a pixel.

export const texKey = (m, item, layer, anim) => 'pd:' + JSON.stringify([m._base ?? m.exportId ?? m.name, item, layer, anim]);
export const animKey = (m, anim, dir) => 'pd:' + JSON.stringify([m._base ?? m.exportId ?? m.name, anim, dir]);
const fragmentKey = (anim, part) => part ? part + ':' + anim : anim;
const loads = new WeakMap();
const available = (m, a) => m.rig.directions.filter((d) => !a.directions || a.directions.includes(d.id));
// Match the size limit for recolorable sheets in the Phaser AE adapter.
const MAX_SIDE = 16384;
async function asset(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('PixelDoll: HTTP ' + response.status + ' loading ' + url);
  return response;
}
async function json(url) {
  return (await asset(url)).json();
}
async function exactPixels(url) {
  try {
    const response = await asset(url);
    return await decodePngBytes(new Uint8Array(await response.arrayBuffer()), MAX_SIDE);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error('PixelDoll: failed to read palette pixels from ' + url + ': ' + message, { cause: error });
  }
}

/** Loads manifest.json and every layer atlas, creates the body animations. Call from create() (it runs the loader). */
export async function loadPaperdoll(scene, base) {
  base = new URL(base.endsWith('/') ? base : base + '/', document.baseURI).href;
  // Textures and animations are game-global: concurrent scenes must share the same load.
  let cache = loads.get(scene.textures);
  if (!cache) loads.set(scene.textures, cache = new Map());
  if (cache.has(base)) return cache.get(base);
  const work = (async () => {
    const m = await json(base + 'manifest.json');
    m._base = base;
    m._atlases = {};
    m._sources = {};
    const entries = [];
    for (const it of m.items) for (const l of it.layers) for (const a of m.rig.animations) {
      const key = texKey(m, it.id, l.id, a.id), exact = it.materials.length > 0;
      entries.push({ key, sheet: l.sourceSheets?.[a.id] ?? l.sheets[a.id], path: atlasName(it.id, l.id, a.id), exact });
      for (const part of ['lower', 'upper']) {
        const sheet = l.actionSheets?.[part]?.[a.id];
        if (sheet) entries.push({ key: texKey(m, it.id, l.id, fragmentKey(a.id, part)), sheet, path: part + '-' + atlasName(it.id, l.id, a.id), exact });
      }
    }
    // Fetch all metadata and exact palette pixels before mutating Phaser's caches.
    // Canvas readback rounds the RGB of translucent pixels, making exact lookups miss.
    const sheets = new Map();
    await Promise.all(entries.flatMap((e) => {
      const atlas = json(base + 'phaser/' + e.path).then((data) => { m._atlases[e.key] = data; });
      if (!e.exact) return [atlas];
      if (!sheets.has(e.sheet)) sheets.set(e.sheet, exactPixels(base + e.sheet));
      return [atlas, sheets.get(e.sheet).then((pixels) => { m._sources[e.key] = pixels; })];
    }));
    const queued = entries.filter((e) => !scene.textures.exists(e.key));
    if (queued.length) await new Promise((resolve, reject) => {
      const failed = new Map(), urls = new Map(queued.map((e) => [e.key, base + e.sheet]));
      const onError = (file) => { if (urls.has(file.key)) failed.set(file.key, file.src ?? urls.get(file.key)); };
      scene.load.on('loaderror', onError);
      scene.load.once('complete', () => {
        scene.load.off('loaderror', onError);
        for (const e of queued) if (!scene.textures.exists(e.key) && !failed.has(e.key)) failed.set(e.key, urls.get(e.key));
        if (failed.size) {
          for (const e of queued) if (scene.textures.exists(e.key)) scene.textures.remove(e.key);
          reject(new Error('PixelDoll: failed to load ' + [...failed.values()].join(', ')));
        } else resolve(undefined);
      });
      for (const e of queued) scene.load.atlas(e.key, urls.get(e.key), m._atlases[e.key]);
      if (!scene.load.isLoading()) scene.load.start();
    });
    const body = m.items.find((i) => i.id === m.rig.baseItem).layers.find((l) => l.role === 'fg');
    for (const a of m.rig.animations) for (const d of available(m, a)) {
      const key = animKey(m, a.id, d.id);
      if (!scene.anims.exists(key)) {
        // Supported Phaser releases use a nonzero frame duration instead of the base interval.
        scene.anims.create({ key, repeat: a.loop ? -1 : 0, duration: timelineDuration(a.frames),
          frames: a.frames.map((f) => ({ key: texKey(m, m.rig.baseItem, body.id, a.id), frame: a.id + '_' + d.id + '_' + f.cell, duration: f.ms })),
        });
      }
    }
    return m;
  })();
  cache.set(base, work);
  try { return await work; } catch (error) { cache.delete(base); throw error; }
}

export class Paperdoll {
  constructor(scene, x, y, manifest, preset = manifest.presets[0] ?? { items: {}, variants: {} }) {
    const resolved = resolvePreset(manifest, preset);
    this.scene = scene;
    this.m = manifest;
    this.equipped = resolved.items;
    this.variants = resolved.variants;
    this.container = scene.add.container(x, y);
    this.actionNodes = [];
    this.action = null;
    this.layerActions = false;
    this.tickAction = (_time, delta) => {
      if (!this.action) return;
      this.action.elapsed += Math.max(0, delta);
      if (this.action.elapsed >= timelineDuration(this.action.move.frames)) this.cancelAction();
      this.sync();
    };
    this.nodes = []; // one sprite per (slot, role) any item uses
    for (const s of manifest.slots) {
      const roles = new Set(manifest.items.filter((i) => i.slot === s.id).flatMap((i) => i.layers.map((l) => l.role)));
      for (const role of [...roles].sort((a, b) => (a === 'bg' ? -1 : 0) - (b === 'bg' ? -1 : 0))) { // bg before fg (compose tie-break)
        const sprite = scene.add.sprite(0, 0, '__DEFAULT').setName(\`\${s.id}_\${role}\`).setVisible(false);
        this.nodes.push({ slot: s, role, sprite });
        this.container.add(sprite);
      }
    }
    const bodyNode = this.nodes.find((n) => n.slot.id === 'body' && n.role === 'fg');
    if (!bodyNode) throw new Error('PixelDoll: missing foreground body layer');
    this.body = bodyNode.sprite;
    for (const ev of ['animationstart', 'animationupdate', 'animationrepeat', 'animationrestart']) this.body.on(ev, () => this.sync());
  }

  play(anim, dir, restart = false) {
    const move = this.m.rig.animations.find((a) => a.id === anim);
    if (!move || !available(this.m, move).some((d) => d.id === dir)) throw new Error('PixelDoll: unavailable move/direction ' + anim + '/' + dir);
    this.cancelAction();
    this.anim = anim; this.dir = dir;
    this.body.play(animKey(this.m, anim, dir), !restart);
    this.sync();
  }

  /** Turns the active move without restarting it: playlist entry, time, loop count and completion are kept. */
  setDirection(dir) {
    const move = this.m.rig.animations.find((a) => a.id === this.anim), anims = this.body.anims;
    if (!move || !anims.currentFrame) throw new Error('PixelDoll: no active move');
    if (!available(this.m, move).some((d) => d.id === dir)) throw new Error('PixelDoll: unavailable move/direction ' + this.anim + '/' + dir);
    if (dir === this.dir) return;
    // Directions of one move share frame count, durations and repeat settings, so swapping the clip in place
    // keeps the clock's accumulator, repeat counter and playing state without emitting start or complete.
    const next = this.scene.anims.get(animKey(this.m, this.anim, dir));
    this.dir = dir;
    anims.currentAnim = next;
    anims.setCurrentFrame(next.frames[anims.currentFrame.index - 1]);
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
    if (!this.action) this.scene.events.on('update', this.tickAction);
    this.action = { move, dir, elapsed: 0, layered };
    this.sync();
    return layered ? 'layered' : 'full';
  }
  cancelAction() {
    if (this.action) this.scene.events.off('update', this.tickAction);
    this.action = null;
  }
  walkCell() {
    const name = this.body.anims.currentFrame?.textureFrame;
    return name && this.anim ? { clip: this.anim, direction: this.dir, cell: +name.slice(name.lastIndexOf('_') + 1) } : null;
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
    const key = original + ':palette:' + JSON.stringify([...table]);
    if (!this.scene.textures.exists(key)) {
      const source = this.m._sources[original];
      const canvas = document.createElement('canvas');
      canvas.width = source.w; canvas.height = source.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('PixelDoll: Canvas 2D is unavailable');
      const image = ctx.createImageData(source.w, source.h);
      image.data.set(applyPalette(source, table).data);
      ctx.putImageData(image, 0, 0);
      const texture = this.scene.textures.addCanvas(key, canvas);
      this.scene.textures.addAtlasJSONHash(key, texture, this.m._atlases[original]);
    }
    return key;
  }

  /** The item drawn in a slot: "<item>~<other>" (baked: hair tucked under a worn helmet, slots[].clips) when it exists. */
  shown(slot) {
    return shownItems(this.m, equipped(this.m, this.equipped)).find((item) => item.slot === slot)?.id;
  }

  layerOf(n) {
    const it = this.m.items.find((i) => i.id === this.shown(n.slot.id));
    return it && { item: it, layer: it.layers.find((l) => l.role === n.role) };
  }

  /** Most specific zOverride (cell > anim > dir > none, later wins on ties), else the layer's z. */
  z(slot, layer, cell) {
    return resolveZ(slot, layer, this.anim, this.dir, cell);
  }

  sync() {
    for (const sprite of this.actionNodes) sprite.setVisible(false);
    if (this.action) {
      const { move, dir, elapsed, layered } = this.action;
      const pose = { clip: move.id, direction: dir, cell: sampleTimeline(move.frames, elapsed, false) };
      const draws = exportedActionDraws(this.m, this.equipped, pose, this.walkCell(), layered);
      for (const n of this.nodes) n.sprite.setVisible(false);
      draws.forEach((draw, order) => {
        let sprite = this.actionNodes[order];
        if (!sprite) {
          sprite = this.scene.add.sprite(0, 0, '__DEFAULT');
          this.actionNodes.push(sprite);
          this.container.add(sprite);
        }
        sprite.pdOrder = order;
        sprite.setTexture(this.texture(draw.item, draw.layer, draw.clip, draw.part), draw.clip + '_' + draw.direction + '_' + draw.cell);
        const { w, h, x, y } = layerFrame(this.m.rig, draw.layer);
        sprite.setOrigin(x / w, y / h).setPosition(draw.point.x, draw.point.y).setVisible(true);
      });
      this.container.sort('pdOrder', (a, b) => a.pdOrder - b.pdOrder);
      return;
    }
    const frame = this.body.anims.currentFrame;
    if (!frame) return;
    const name = frame.textureFrame, cell = +name.slice(name.lastIndexOf('_') + 1);
    const draws = drawList(this.m, this.equipped, this.anim, this.dir, cell);
    for (const n of this.nodes) {
      const order = draws.findIndex((draw) => draw.slot.id === n.slot.id && draw.layer.role === n.role);
      const hit = draws[order];
      n.sprite.pdOrder = order < 0 ? draws.length : order;
      n.sprite.setVisible(!!hit);
      if (!hit?.layer) continue;
      n.sprite.depth = hit.z;
      n.sprite.setTexture(this.texture(hit.item, hit.layer), name);
    }
    this.container.sort('pdOrder', (a, b) => a.pdOrder - b.pdOrder);
  }

  destroy() { this.cancelAction(); this.container.destroy(); }
}
`;

export function phaserFiles(m: Manifest): OutFile[] {
	const files: OutFile[] = [];
	for (const it of m.items)
		for (const l of it.layers)
			for (const a of m.rig.animations) {
				const path = atlasName(it.id, l.id, a.id);
				files.push({
					name: `phaser/${path}`,
					data: JSON.stringify(atlasJson(m, it.id, l.id, a.id), null, 1) + '\n'
				});
				for (const part of ['lower', 'upper'] as const)
					if (l.actionSheets?.[part]?.[a.id])
						files.push({
							name: `phaser/${part}-${path}`,
							data: JSON.stringify(atlasJson(m, it.id, l.id, a.id, part), null, 1) + '\n'
						});
			}
	files.push({ name: 'phaser/PaperdollContainer.js', data: PAPERDOLL_JS });
	files.push({ name: 'phaser/types.d.ts', data: runtimeTypes });
	const dir = `assets/${m.exportId ?? m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`;
	const initial = m.rig.animations.find((a) => (a.directions ?? m.rig.directions).length > 0);
	files.push({
		name: 'phaser/README.txt',
		data: `1. Copy the whole export folder into your game's assets, e.g. ${dir}
2. Game config: pixelArt: true, roundPixels: true (Phaser 4 defaults roundPixels to false).
   For exact Canvas pixels, position characters at integer coordinates and call scene.cameras.main.setRoundPixels(false).
   Phaser Canvas roundPixels expands each sprite by half a pixel; WebGL does not need this adjustment.
3. In a scene (Phaser 3.80+ or 4):
     import { loadPaperdoll, Paperdoll } from './${dir}phaser/PaperdollContainer.js'
     async create() {
       const m = await loadPaperdoll(this, '${dir}')   // the folder with manifest.json
       const doll = new Paperdoll(this, 200, 150, m)
       doll.play(${JSON.stringify(initial?.id ?? 'walk')}, ${JSON.stringify(initial?.directions?.[0] ?? m.rig.directions[0]?.id ?? 'south')})
     }
Switch outfits with doll.applyPreset(outfitId) (an id from manifest.json's presets, or a preset object); it replaces the equipped items and the color selections, so call setVariants after it to keep custom colors. Unknown outfit IDs throw without changing the doll.
Phaser does not await an async create(): nothing may use the doll until loadPaperdoll resolves, so guard update() on it or create the doll in a scene that starts after loading. The loader path is relative to document.baseURI.
Call setActionLayering(true) to enable moving attacks when the ZIP contains precut fragments (manifest.actionLayers). canLayerAction(move, direction) checks the whole action set and equipped gear. Invalid playAction calls throw without changing playback. playAction(move, direction) returns "layered" or "full", plays once and leaves the gait clock running. Read actionPlaying for completion. Calling play cancels the action. An outfit that cannot be layered switches the action to full once; it stays full until the next action.

play(anim, dir) preserves an active clip's progress, starts changed moves/directions at the beginning and replays a completed once-only clip. Pass true as the third argument to restart explicitly.
doll.setDirection(dir) turns the active move (e.g. an aimed attack) while keeping its frame, time, loop position and completion; it emits no start or complete events. The current direction is a no-op; an unavailable direction or no active move throws before changing state.
Invalid move/direction, equipment and outfit IDs throw before changing state. Equip an item with doll.equip(slot, itemId); null empties a non-body slot.
Recolor with doll.setVariants({ "<material-id>": "<variant-id>" }).
setVariants replaces all explicit color selections. Omitted keys or null restore material defaults; an empty-string selection uses source colors. Linked materials follow their target's selection. Only variants listed in materials[].variants can be selected; an unknown material or variant id selects nothing.
The loader decodes recolorable sheets from PNG bytes for exact source RGB matches, including translucent pixels. In Canvas and WebGL, the resulting palette textures preserve alpha and go through Phaser's normal texture upload.
paletteMap returns only active source-RGB to target-RGB swaps; unselected colors are omitted.
This module also exports the engine-neutral paper-doll API used inside PixelDoll itself, including composeCell, drawList, paletteMap and sampleTimeline.
The adjacent types.d.ts supplies portable data types for checked JavaScript consumers; no TypeScript compilation is required.
Call doll.destroy() when removing a character. Palette textures are cached until Phaser game teardown.
PaperdollContainer.js is an ES module and fetches manifest.json: serve the game over http (a dev server), not file://.
Atlases: phaser/<length>-<item>_<length>-<layer>_<length>-<move>.json (TexturePacker hash), frames named <move>_<direction>_<frame>.
`
	});
	return files;
}

export function selfTest() {
	const m = {
		app: 'PixelDoll',
		format: CURRENT_FORMAT,
		rig: {
			cell: { w: 64, h: 64 },
			pivot: { x: 32, y: 60 },
			directions: [{ id: 'south' }, { id: 'east' }],
			animations: [{ id: 'walk', cells: 8 }]
		},
		items: [
			{
				id: 'base',
				slot: 'body',
				layers: [
					{ id: 'main', role: 'fg', z: 10, sheets: { walk: 'layers/body/base/main/walk.png' } }
				]
			}
		]
	} as unknown as Manifest;
	const j = atlasJson(m, 'base', 'main', 'walk');
	const f = j.frames['walk_east_3'] as {
		frame: { x: number; y: number };
		pivot: { x: number; y: number };
	};
	console.assert(
		Object.keys(j.frames).length === 16 && f.frame.x === 192 && f.frame.y === 64,
		'atlas: 16 frames, east row'
	);
	console.assert(
		f.pivot.x === 0.5 && f.pivot.y === 60 / 64 && j.meta.size.w === 512 && j.pixeldoll.z === 10,
		'atlas: normalized pivot, size, customData'
	);
	Object.assign(m.items[0].layers[0], { cell: { w: 96, h: 96 }, pivot: { x: 48, y: 76 } });
	const o = atlasJson(m, 'base', 'main', 'walk'),
		g = o.frames['walk_east_3'] as typeof f & { frame: { w: number } };
	console.assert(
		g.frame.x === 288 &&
			g.frame.y === 96 &&
			g.frame.w === 96 &&
			g.pivot.y === 76 / 96 &&
			o.meta.size.h === 192,
		'atlas: oversize layer rect + pivot'
	);
}
