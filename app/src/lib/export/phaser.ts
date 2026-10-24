// Phaser 3.80+ / 4 export (manifest-spec §6.4): one TexturePacker JSON-Hash atlas per sheet + PaperdollContainer.js.
import type { Manifest } from '../store/manifest.ts';
import type { OutFile } from './generic.ts';
import { layerFrame } from '../compose/compose.ts';

export const atlasName = (...parts: string[]) => parts.map((part) => `${part.length}-${part}`).join('_') + '.json';

export function atlasJson(m: Manifest, itemId: string, layerId: string, anim: string) {
  const { rig } = m;
  const it = m.items.find((i) => i.id === itemId)!, l = it.layers.find((x) => x.id === layerId)!, { w, h, x: px, y: py } = layerFrame(rig, l);
  const a = rig.animations.find((x) => x.id === anim)!;
  const frames: Record<string, unknown> = {};
  rig.directions.forEach((d, r) => {
    for (let c = 0; c < a.cells; c++)
      frames[`${anim}_${d.id}_${c}`] = {
        frame: { x: c * w, y: r * h, w, h }, rotated: false, trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w, h }, sourceSize: { w, h },
        pivot: { x: px / w, y: py / h }, // per layer: oversize layers line up with the body by pivot
      };
  });
  return {
    frames,
    meta: { app: m.app, version: m.format, image: `../${l.sheets![anim]}`, format: 'RGBA8888', size: { w: a.cells * w, h: rig.directions.length * h }, scale: '1' },
    pixeldoll: { item: it.id, layer: l.id, slot: it.slot, role: l.role, z: l.z, anim }, // -> texture.customData
  };
}

export const PAPERDOLL_JS = `// PixelDoll runtime for Phaser 3.80+ and Phaser 4 (pixeldoll/1). No Phaser import: works with the global or a bundled Phaser.
// The body sprite is the clock; every layer copies its frame name on each animation event, so layers cannot drift.
//   const m = await loadPaperdoll(scene, 'assets/hero/');   // folder that holds manifest.json
//   const doll = new Paperdoll(scene, 200, 150, m); doll.play('walk', 'south'); doll.equip('head', null);
// Game config: pixelArt: true, roundPixels: true (Phaser 4 defaults roundPixels to false).

export const texKey = (m, item, layer, anim) => 'pd:' + JSON.stringify([m._base ?? m.name, item, layer, anim]);
export const animKey = (m, anim, dir) => 'pd:' + JSON.stringify([m._base ?? m.name, anim, dir]);
const loads = new WeakMap();
const atlasName = (...parts) => parts.map((part) => part.length + '-' + part).join('_') + '.json';
const available = (m, a) => m.rig.directions.filter((d) => !a.directions || a.directions.includes(d.id));
async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('PixelDoll: HTTP ' + response.status + ' loading ' + url);
  return response.json();
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
    const entries = [];
    for (const it of m.items) for (const l of it.layers) for (const a of m.rig.animations) {
      const key = texKey(m, it.id, l.id, a.id);
      entries.push({ key, sheet: l.sourceSheets?.[a.id] ?? l.sheets[a.id], path: atlasName(it.id, l.id, a.id) });
    }
    // Fetch all metadata before mutating Phaser's caches.
    await Promise.all(entries.map(async (e) => { m._atlases[e.key] = await json(base + 'phaser/' + e.path); }));
    const queued = entries.filter((e) => !scene.textures.exists(e.key));
    if (queued.length) await new Promise((resolve, reject) => {
      const failed = [], keys = new Set(queued.map((e) => e.key));
      const onError = (file) => { if (keys.has(file.key)) failed.push(file.src ?? file.key); };
      scene.load.on('loaderror', onError);
      scene.load.once('complete', () => {
        scene.load.off('loaderror', onError);
        for (const e of queued) if (!scene.textures.exists(e.key) && !failed.includes(e.key)) failed.push(e.key);
        if (failed.length) {
          for (const e of queued) if (scene.textures.exists(e.key)) scene.textures.remove(e.key);
          reject(new Error('PixelDoll: failed to load ' + failed.join(', ')));
        } else resolve();
      });
      for (const e of queued) scene.load.atlas(e.key, base + e.sheet, m._atlases[e.key]);
      if (!scene.load.isLoading()) scene.load.start();
    });
    const body = m.items.find((i) => i.id === m.rig.baseItem).layers.find((l) => l.role === 'fg');
    for (const a of m.rig.animations) for (const d of available(m, a)) {
      const key = animKey(m, a.id, d.id);
      if (!scene.anims.exists(key)) {
        // Phaser adds frame.duration to its base interval: subtract it for exact timing.
        const interval = Math.min(...a.frames.map((f) => f.ms));
        scene.anims.create({ key, repeat: a.loop ? -1 : 0, frameRate: 1000 / interval,
          frames: a.frames.map((f) => ({ key: texKey(m, m.rig.baseItem, body.id, a.id), frame: a.id + '_' + d.id + '_' + f.cell, duration: f.ms - interval })),
        });
      }
    }
    return m;
  })();
  cache.set(base, work);
  try { return await work; } catch (error) { cache.delete(base); throw error; }
}

/** Exact source-RGB swaps, local to an item's materials (including tucked variants). */
export function paletteMap(m, item, variants) {
  const table = new Map();
  const variant = (id, seen = new Set()) => {
    const mat = m.materials.find((x) => x.id === id);
    if (!mat || seen.has(id)) return undefined;
    seen.add(id);
    return mat.linkTo ? variant(mat.linkTo, seen) : variants[id] ?? mat.defaultVariant;
  };
  for (const id of item.materials) {
    const mat = m.materials.find((x) => x.id === id && (x.owner === item.id || x.owner === item.variantOf));
    if (!mat) continue;
    const ramp = mat.variants[variant(id)];
    if (ramp) mat.ramp.forEach((color, i) => table.set(parseInt(color.slice(1), 16), parseInt(ramp[i].slice(1), 16)));
  }
  return table;
}

export class Paperdoll {
  constructor(scene, x, y, manifest, preset = manifest.presets[0]) {
    this.scene = scene;
    this.m = manifest;
    this.equipped = { ...preset?.items, body: manifest.rig.baseItem };
    this.variants = { ...preset?.variants };
    this.container = scene.add.container(x, y);
    this.nodes = []; // one sprite per (slot, role) any item uses
    for (const s of manifest.slots) {
      const roles = new Set(manifest.items.filter((i) => i.slot === s.id).flatMap((i) => i.layers.map((l) => l.role)));
      for (const role of [...roles].sort((a, b) => (a === 'bg' ? -1 : 0) - (b === 'bg' ? -1 : 0))) { // bg before fg (compose tie-break)
        const sprite = scene.add.sprite(0, 0, '__DEFAULT').setName(\`\${s.id}_\${role}\`).setVisible(false);
        sprite.pdOrder = this.nodes.length; // B14: equal depth keeps compose's order (slot, bg before fg), never the last frame's
        this.nodes.push({ slot: s, role, sprite });
        this.container.add(sprite);
      }
    }
    this.body = this.nodes.find((n) => n.slot.id === 'body' && n.role === 'fg').sprite;
    for (const ev of ['animationstart', 'animationupdate', 'animationrepeat', 'animationrestart']) this.body.on(ev, () => this.sync());
  }

  play(anim, dir) {
    const move = this.m.rig.animations.find((a) => a.id === anim);
    if (!move || !available(this.m, move).some((d) => d.id === dir)) throw new Error('PixelDoll: unavailable move/direction ' + anim + '/' + dir);
    this.anim = anim; this.dir = dir;
    this.body.play(animKey(this.m, anim, dir));
    this.sync();
  }

  equip(slot, itemId) {
    if (slot === 'body' || !this.m.slots.some((s) => s.id === slot) || (itemId != null && !this.m.items.some((i) => i.id === itemId && i.slot === slot && !i.variantOf))) throw new Error('PixelDoll: invalid equipment for ' + slot);
    this.equipped[slot] = itemId; this.sync();
  }

  applyPreset(preset) {
    this.equipped = { ...preset.items, body: this.m.rig.baseItem };
    this.setVariants(preset.variants);
  }

  setVariants(variants) { this.variants = { ...variants }; this.sync(); }

  texture(item, layer) {
    const original = texKey(this.m, item.id, layer.id, this.anim);
    const table = paletteMap(this.m, item, this.variants);
    if (!table.size) return original;
    const key = original + ':palette:' + JSON.stringify([...table]);
    if (!this.scene.textures.exists(key)) {
      const source = this.scene.textures.get(original).getSourceImage();
      const canvas = document.createElement('canvas');
      canvas.width = source.width; canvas.height = source.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(source, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height), pixels = image.data;
      for (let i = 0; i < pixels.length; i += 4) {
        if (!pixels[i + 3]) continue;
        const color = table.get((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
        if (color != null) { pixels[i] = color >> 16; pixels[i + 1] = (color >> 8) & 255; pixels[i + 2] = color & 255; }
      }
      ctx.putImageData(image, 0, 0);
      const texture = this.scene.textures.addCanvas(key, canvas);
      this.scene.textures.addAtlasJSONHash(key, texture, this.m._atlases[original]);
    }
    return key;
  }

  /** The item drawn in a slot: "<item>~<other>" (baked: hair tucked under a worn helmet, slots[].clips) when it exists. */
  shown(slot) {
    const id = this.equipped[slot];
    if (id) for (const o of Object.values(this.equipped)) if (this.m.items.some((i) => i.id === \`\${id}~\${o}\`)) return \`\${id}~\${o}\`;
    return id;
  }

  layerOf(n) {
    const it = this.m.items.find((i) => i.id === this.shown(n.slot.id));
    return it && { item: it, layer: it.layers.find((l) => l.role === n.role) };
  }

  /** Most specific zOverride (cell > anim > dir > none, later wins on ties), else the layer's z. */
  z(slot, layer, cell) {
    let z = layer.z, best = -1;
    for (const o of slot.zOverrides ?? []) {
      if (o.layer !== layer.role || (o.dir && o.dir !== this.dir) || (o.anim && o.anim !== this.anim) || (o.cell != null && o.cell !== cell)) continue;
      const rank = o.cell != null ? 3 : o.anim ? 2 : o.dir ? 1 : 0;
      if (rank >= best) { best = rank; z = o.z; }
    }
    return z;
  }

  sync() {
    const frame = this.body.anims.currentFrame;
    if (!frame) return;
    const name = frame.textureFrame, cell = +name.slice(name.lastIndexOf('_') + 1);
    const hidden = new Set();
    for (const [slot, id] of Object.entries(this.equipped)) {
      const it = this.m.items.find((i) => i.id === id);
      for (const h of it?.hides ?? this.m.slots.find((s) => s.id === slot)?.hides ?? []) if (it) hidden.add(h);
    }
    for (const n of this.nodes) {
      const hit = this.layerOf(n);
      n.sprite.setVisible(!!hit?.layer && !hidden.has(n.slot.id));
      if (!hit?.layer) continue;
      n.sprite.depth = this.z(n.slot, hit.layer, cell);
      n.sprite.setTexture(this.texture(hit.item, hit.layer), name);
    }
    this.container.sort('depth', (a, b) => a.depth - b.depth || a.pdOrder - b.pdOrder);
  }

  destroy() { this.container.destroy(); }
}
`;

export function phaserFiles(m: Manifest): OutFile[] {
  const files: OutFile[] = [];
  for (const it of m.items)
    for (const l of it.layers)
      for (const a of m.rig.animations) files.push({ name: `phaser/${atlasName(it.id, l.id, a.id)}`, data: JSON.stringify(atlasJson(m, it.id, l.id, a.id), null, 1) + '\n' });
  files.push({ name: 'phaser/PaperdollContainer.js', data: PAPERDOLL_JS });
  const dir = `assets/${m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`;
  const initial = m.rig.animations.find((a) => (a.directions ?? m.rig.directions).length > 0);
  files.push({
    name: 'phaser/README.txt',
    data: `1. Copy the whole export folder into your game's assets, e.g. ${dir}
2. Game config: pixelArt: true, roundPixels: true (Phaser 4 defaults roundPixels to false).
3. In a scene (Phaser 3.80+ or 4):
     import { loadPaperdoll, Paperdoll } from './${dir}phaser/PaperdollContainer.js'
     async create() {
       const m = await loadPaperdoll(this, '${dir}')   // the folder with manifest.json
       const doll = new Paperdoll(this, 200, 150, m)
       doll.play(${JSON.stringify(initial?.id ?? 'walk')}, ${JSON.stringify(initial?.directions?.[0] ?? m.rig.directions[0]?.id ?? 'south')})
     }
Switch outfits with doll.applyPreset(m.presets[1]); recolour with doll.setVariants({ material_id: "stored_variant" }).
Palette swaps use exact source RGBs and stored material ramps in Canvas or WebGL.
Call doll.destroy() when removing a character. Palette textures are cached until Phaser game teardown.
PaperdollContainer.js is an ES module and fetches manifest.json: serve the game over http (a dev server), not file://.
Atlases: phaser/<length>-<item>_<length>-<layer>_<length>-<move>.json (TexturePacker hash), frames named <move>_<direction>_<frame>.
`,
  });
  return files;
}

export function selfTest() {
  const m = {
    app: 'PixelDoll', format: 'pixeldoll/1',
    rig: { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, directions: [{ id: 'south' }, { id: 'east' }], animations: [{ id: 'walk', cells: 8 }] },
    items: [{ id: 'base', slot: 'body', layers: [{ id: 'main', role: 'fg', z: 10, sheets: { walk: 'layers/body/base/main/walk.png' } }] }],
  } as unknown as Manifest;
  const j = atlasJson(m, 'base', 'main', 'walk');
  const f = j.frames['walk_east_3'] as { frame: { x: number; y: number }; pivot: { x: number; y: number } };
  console.assert(Object.keys(j.frames).length === 16 && f.frame.x === 192 && f.frame.y === 64, 'atlas: 16 frames, east row');
  console.assert(f.pivot.x === 0.5 && f.pivot.y === 60 / 64 && j.meta.size.w === 512 && j.pixeldoll.z === 10, 'atlas: normalized pivot, size, customData');
  Object.assign(m.items[0].layers[0], { cell: { w: 96, h: 96 }, pivot: { x: 48, y: 76 } });
  const o = atlasJson(m, 'base', 'main', 'walk'), g = o.frames['walk_east_3'] as typeof f & { frame: { w: number } };
  console.assert(g.frame.x === 288 && g.frame.y === 96 && g.frame.w === 96 && g.pivot.y === 76 / 96 && o.meta.size.h === 192, 'atlas: oversize layer rect + pivot');
}
