// Phaser 3.80+ / 4 export (manifest-spec §6.4): one TexturePacker JSON-Hash atlas per sheet + PaperdollContainer.js.
import type { Manifest } from '../store/manifest.ts';
import type { OutFile } from './generic.ts';
import { layerFrame } from '../compose/compose.ts';

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

export const texKey = (m, item, layer, anim) => \`pd:\${m.name}:\${item}:\${layer}:\${anim}\`;
export const animKey = (m, anim, dir) => \`pd:\${m.name}:\${anim}_\${dir}\`;

/** Loads manifest.json and every layer atlas, creates the body animations. Call from create() (it runs the loader). */
export async function loadPaperdoll(scene, base) {
  const m = await (await fetch(base + 'manifest.json')).json();
  for (const it of m.items) for (const l of it.layers) for (const a of m.rig.animations)
    scene.load.atlas(texKey(m, it.id, l.id, a.id), base + l.sheets[a.id], \`\${base}phaser/\${it.id}_\${l.id}_\${a.id}.json\`);
  await new Promise((done) => { scene.load.once('complete', done); scene.load.start(); });
  const body = m.items.find((i) => i.id === m.rig.baseItem).layers[0];
  for (const a of m.rig.animations) for (const d of m.rig.directions) {
    const key = animKey(m, a.id, d.id);
    if (!scene.anims.exists(key)) scene.anims.create({
      key, repeat: a.loop ? -1 : 0,
      frames: a.frames.map((f) => ({ key: texKey(m, m.rig.baseItem, body.id, a.id), frame: \`\${a.id}_\${d.id}_\${f.cell}\`, duration: f.ms })),
    });
  }
  return m;
}

export class Paperdoll {
  constructor(scene, x, y, manifest, preset = manifest.presets[0]) {
    this.m = manifest;
    this.equipped = { ...preset.items, body: manifest.rig.baseItem };
    this.container = scene.add.container(x, y);
    this.nodes = []; // one sprite per (slot, role) any item uses
    for (const s of manifest.slots) {
      const roles = new Set(manifest.items.filter((i) => i.slot === s.id).flatMap((i) => i.layers.map((l) => l.role)));
      for (const role of roles) {
        const sprite = scene.add.sprite(0, 0, '__DEFAULT').setName(\`\${s.id}_\${role}\`);
        this.nodes.push({ slot: s, role, sprite });
        this.container.add(sprite);
      }
    }
    this.body = this.nodes.find((n) => n.slot.id === 'body' && n.role === 'fg').sprite;
    for (const ev of ['animationstart', 'animationupdate', 'animationrepeat', 'animationrestart']) this.body.on(ev, () => this.sync());
  }

  play(anim, dir) {
    this.anim = anim; this.dir = dir;
    this.body.play(animKey(this.m, anim, dir));
    this.sync();
  }

  equip(slot, itemId) { this.equipped[slot] = itemId; this.sync(); }

  layerOf(n) {
    const it = this.m.items.find((i) => i.id === this.equipped[n.slot.id]);
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
      if (n.sprite !== this.body) n.sprite.setTexture(texKey(this.m, hit.item.id, hit.layer.id, this.anim), name);
    }
    this.container.sort('depth');
  }
}
`;

export function phaserFiles(m: Manifest): OutFile[] {
  const files: OutFile[] = [];
  for (const it of m.items)
    for (const l of it.layers)
      for (const a of m.rig.animations) files.push({ name: `phaser/${it.id}_${l.id}_${a.id}.json`, data: JSON.stringify(atlasJson(m, it.id, l.id, a.id), null, 1) + '\n' });
  files.push({ name: 'phaser/PaperdollContainer.js', data: PAPERDOLL_JS });
  const dir = `assets/${m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`;
  files.push({
    name: 'phaser/README.txt',
    data: `1. Copy the whole export folder into your game's assets, e.g. ${dir}
2. Game config: pixelArt: true, roundPixels: true (Phaser 4 defaults roundPixels to false).
3. In a scene (Phaser 3.80+ or 4):
     import { loadPaperdoll, Paperdoll } from './${dir}phaser/PaperdollContainer.js'
     async create() {
       const m = await loadPaperdoll(this, '${dir}')   // the folder with manifest.json
       const doll = new Paperdoll(this, 200, 150, m)
       doll.play('${m.rig.animations[0]?.id ?? 'walk'}', '${m.rig.directions[0]?.id ?? 'south'}'); doll.equip('head', null)
     }
PaperdollContainer.js is an ES module and fetches manifest.json: serve the game over http (a dev server), not file://.
Atlases: phaser/<item>_<layer>_<move>.json (TexturePacker hash), frames named <move>_<direction>_<frame>.
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
