// GDevelop 5 native project. Sprite resources are registered, so the editor/exporter retains every equipment frame.
import type { Manifest } from '../store/manifest.ts';
import type { Img } from '../image/png.ts';
import type { OutFile } from './generic.ts';
import { layerFrame } from '../compose/compose.ts';

/** Stable character identity: renaming/base changes create a separate library; same-character reexports retain names. */
export function gdCharacterKey(m: Manifest): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(JSON.stringify([m.name, m.rig.baseHash]))) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  return hash.toString(16).padStart(16, '0');
}
export const gdObjectName = (item: string, layer: string, character = '') => 'PD_' + (character ? character + '_' : '') + Array.from(JSON.stringify([item, layer]), (c) => c.codePointAt(0)!.toString(16)).join('_');
const resourceName = (object: string, anim: number, row: number, cell: number) => `${object}_${anim}_${row}_${cell}.png`;

/** Embedded as a native JavaScript event: no network fetch, package dependency or external script registration. */
export const GDEVELOP_RUNTIME = `
function createPixelDoll(scene, m, names, x = 320, y = 240, preset = m.presets[0]) {
  const d = { x, y, z: 0, layer: '', m, scene, names, nodes: new Map(), textures: new Map(), destroyed: false,
    equipped: { ...preset?.items, body: m.rig.baseItem }, variants: { ...preset?.variants }, elapsed: 0 };
  const available = (a) => a.directions ?? m.rig.directions.map((v) => v.id);
  d.play = (anim, dir) => {
    const a = m.rig.animations.find((a) => a.id === anim);
    if (!a || !available(a).includes(dir)) throw new Error('PixelDoll: unavailable move/direction ' + anim + '/' + dir);
    d.anim = a; d.dir = dir; d.elapsed = 0; d.sync(); return d;
  };
  d.equip = (slot, id) => {
    if (slot === 'body' || !m.slots.some((s) => s.id === slot) || (id != null && !m.items.some((i) => i.id === id && i.slot === slot && !i.variantOf))) throw new Error('PixelDoll: invalid equipment for ' + slot);
    d.equipped[slot] = id; d.sync(); return d;
  };
  d.setVariants = (variants) => { d.variants = { ...variants }; d.sync(); return d; };
  d.applyPreset = (preset) => {
    if (typeof preset === 'string') preset = m.presets.find((p) => p.id === preset);
    if (!preset) throw new Error('PixelDoll: unknown outfit');
    d.equipped = { ...preset.items, body: m.rig.baseItem }; return d.setVariants(preset.variants);
  };
  const palette = (item) => {
    const map = new Map();
    const variant = (id, seen = new Set()) => {
      const mat = m.materials.find((v) => v.id === id);
      if (!mat || seen.has(id)) return undefined;
      seen.add(id); return mat.linkTo ? variant(mat.linkTo, seen) : d.variants[id] ?? mat.defaultVariant;
    };
    for (const id of item.materials) {
      const mat = m.materials.find((v) => v.id === id && (v.owner === item.id || v.owner === item.variantOf));
      const ramp = mat?.variants[variant(id)];
      if (ramp) mat.ramp.forEach((c, i) => map.set(parseInt(c.slice(1), 16), parseInt(ramp[i].slice(1), 16)));
    }
    return map;
  };
  const texture = (resource, map) => {
    const manager = scene.getGame().getImageManager();
    if (!map.size) return manager.getPIXITexture(resource);
    const key = JSON.stringify([resource, [...map]]);
    if (!d.textures.has(key)) {
      const image = manager.getImageSource(resource);
      if (!image) throw new Error('PixelDoll: image not loaded ' + resource);
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height), p = data.data;
      for (let i = 0; i < p.length; i += 4) {
        const c = p[i + 3] && map.get((p[i] << 16) | (p[i + 1] << 8) | p[i + 2]);
        if (c !== undefined && p[i + 3]) { p[i] = c >> 16; p[i + 1] = (c >> 8) & 255; p[i + 2] = c & 255; }
      }
      ctx.putImageData(data, 0, 0);
      const tex = PIXI.Texture.from(canvas); tex.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
      d.textures.set(key, tex);
    }
    return d.textures.get(key);
  };
  d.sync = () => {
    if (!d.anim || d.destroyed) return;
    const a = d.anim, total = a.frames.reduce((n, f) => n + f.ms, 0);
    let time = a.loop ? d.elapsed % total : Math.min(d.elapsed, total - 0.000001), frame = a.frames[0];
    for (const f of a.frames) { frame = f; if (time < f.ms) break; time -= f.ms; }
    d.cell = frame.cell;
    const on = m.items.filter((i) => i.id === m.rig.baseItem || d.equipped[i.slot] === i.id);
    const hidden = new Set(on.flatMap((i) => i.hides ?? m.slots.find((s) => s.id === i.slot)?.hides ?? []));
    for (const node of d.nodes.values()) node.hide();
    const visible = [];
    for (const [si, slot] of m.slots.entries()) {
      let item = on.find((i) => i.slot === slot.id);
      if (!item || hidden.has(slot.id)) continue;
      item = on.map((over) => m.items.find((v) => v.variantOf === item.id && v.under === over.id)).find(Boolean) ?? item;
      for (const l of item.layers) {
        const name = names[item.id][l.id];
        let node = d.nodes.get(name);
        if (!node) { node = scene.createObject(name); if (!node) throw new Error('PixelDoll: missing Sprite ' + name); d.nodes.set(name, node); }
        node.setLayer(d.layer); node.hide(false); node.setAnimationName(JSON.stringify([a.id, d.dir])); node.setAnimationFrame(frame.cell); node.pauseAnimation();
        // Native Sprite originPoint is the exported layer pivot, so all layers share the character position.
        node.setPosition(d.x, d.y);
        let z = l.z, best = -1;
        for (const o of slot.zOverrides ?? []) {
          if (o.layer !== l.role || (o.dir && o.dir !== d.dir) || (o.anim && o.anim !== a.id) || (o.cell != null && o.cell !== frame.cell)) continue;
          const rank = o.cell != null ? 3 : o.anim ? 2 : o.dir ? 1 : 0;
          if (rank >= best) { z = o.z; best = rank; }
        }
        node.updatePreRender(scene);
        const ai = m.rig.animations.indexOf(a), row = m.rig.directions.findIndex((v) => v.id === d.dir);
        node.getRendererObject().texture = texture(name + '_' + ai + '_' + row + '_' + frame.cell + '.png', palette(item));
        visible.push({ node, z, order: si * 2 + (l.role === 'bg' ? 0 : 1) });
      }
    }
    // Integer z ranks preserve arbitrary/negative z overrides and stable ties without renderer creation-order dependence.
    visible.sort((a, b) => a.z - b.z || a.order - b.order).forEach((v, i) => v.node.setZOrder(d.z + i));
  };
  d.update = (ms) => { if (!d.destroyed) { d.elapsed += Math.max(0, ms); d.sync(); } };
  d.destroy = () => {
    if (d.destroyed) return; d.destroyed = true;
    for (const node of d.nodes.values()) node.deleteFromScene(scene);
    for (const tex of d.textures.values()) tex.destroy(true);
    d.nodes.clear(); d.textures.clear();
  };
  const first = m.rig.animations.find((a) => available(a).length);
  if (first) d.play(first.id, available(first)[0]);
  return d;
}
`;

export function gdevelopFiles(m: Manifest, sheets: Map<string, Img>): OutFile[] {
  const files: OutFile[] = [], resources: Record<string, unknown>[] = [], objects: Record<string, unknown>[] = [];
  const names: Record<string, Record<string, string>> = {};
  const character = gdCharacterKey(m);
  for (const [ii, it] of m.items.entries()) {
    names[it.id] = {};
    for (const [li, l] of it.layers.entries()) {
      const name = gdObjectName(it.id, l.id, character), f = layerFrame(m.rig, l);
      names[it.id][l.id] = name;
      const animations: Record<string, unknown>[] = [];
      for (const [ai, a] of m.rig.animations.entries()) {
        const source = sheets.get(l.sourceSheets?.[a.id] ?? l.sheets![a.id]);
        if (!source) throw new Error(`GDevelop: missing source sheet ${it.id}/${l.id}/${a.id}`);
        for (const [row, dir] of m.rig.directions.entries()) {
          const sprites = [];
          for (let cell = 0; cell < a.cells; cell++) {
            const resource = resourceName(name, ai, row, cell), data = new Uint8ClampedArray(f.w * f.h * 4);
            for (let y = 0; y < f.h; y++) {
              const start = ((row * f.h + y) * source.w + cell * f.w) * 4;
              data.set(source.data.subarray(start, start + f.w * 4), y * f.w * 4);
            }
            // Short filenames also keep unpacking safe for Windows' path limits; resource names remain identity-specific.
            const imageFile = `${character}_${ii}_${li}_${ai}_${row}_${cell}.png`;
            files.push({ name: `gdevelop/images/${imageFile}`, data: { w: f.w, h: f.h, data } });
            resources.push({ kind: 'image', name: resource, file: `images/${imageFile}`, smoothed: false, userAdded: true, alwaysLoaded: true, metadata: '' });
            sprites.push({ image: resource, hasCustomCollisionMask: false, points: [], originPoint: { name: 'origine', x: f.x, y: f.y }, centerPoint: { automatic: true, name: 'centre', x: 0, y: 0 }, customCollisionMask: [] });
          }
          animations.push({ name: JSON.stringify([a.id, dir.id]), useMultipleDirections: false, directions: [{ looping: false, timeBetweenFrames: 1, sprites }] });
        }
      }
      objects.push({ name, type: 'Sprite', updateIfNotVisible: true, adaptCollisionMaskAutomatically: false, variables: [], effects: [], behaviors: [], animations });
    }
  }
  const namespace = 'PixelDoll_PD_' + character;
  const eventCode = `// PixelDoll: keep this event before events that use the controller.\nconst key = ${JSON.stringify(namespace)};\nif (!runtimeScene[key]) {\n${GDEVELOP_RUNTIME}\n  const m = ${JSON.stringify(m)};\n  const names = ${JSON.stringify(names)};\n  const state = { dolls: [], create: (x, y, preset) => { const d = createPixelDoll(runtimeScene, m, names, x, y, preset); state.dolls.push(d); return d; } };\n  runtimeScene[key] = state;\n  gdjs._pixelDollCleanupKeys ??= new Set();\n  if (!gdjs._pixelDollCleanupKeys.has(key)) {\n    gdjs._pixelDollCleanupKeys.add(key);\n    gdjs.registerRuntimeSceneUnloadedCallback((scene) => { for (const doll of scene[key]?.dolls ?? []) doll.destroy(); });\n  }\n  state.create();\n}\nruntimeScene[key].dolls = runtimeScene[key].dolls.filter((doll) => !doll.destroyed);\nfor (const doll of runtimeScene[key].dolls) doll.update(runtimeScene.getTimeManager().getElapsedTime());`;
  const project = {
    firstLayout: 'Paperdoll', gdVersion: { build: 285, major: 5, minor: 6, revision: 0 },
    properties: { name: m.name, author: '', description: 'Editable PixelDoll character. See README.txt for integration and controller API.', version: '1.0.0', packageName: 'com.pixeldoll.character', windowWidth: 640, windowHeight: 480, maxFPS: 60, minFPS: 1, scaleMode: 'nearest', pixelsRounding: true, antialiasingMode: 'none', orientation: 'landscape', sizeOnStartupMode: 'adaptWidth', adaptGameResolutionAtRuntime: false, folderProject: false, verticalSync: true, latestCompilationDirectory: '', platformSpecificAssets: {}, watermark: { showWatermark: true, placement: 'bottom-left' }, authorIds: [], authorUsernames: [], categories: [], playableDevices: [], extensionProperties: [], currentPlatform: 'GDevelop JS platform', platforms: [{ name: 'GDevelop JS platform' }], loadingScreen: { showGDevelopSplash: false, showProgressBar: true } },
    resources: { resources, resourceFolders: [] }, objects: [], objectsGroups: [], variables: [], externalEvents: [], externalLayouts: [], eventsFunctionsExtensions: [], uiSettings: {},
    layouts: [{ name: 'Paperdoll', title: m.name, r: 32, v: 32, b: 36, standardSortMethod: true, stopSoundsOnStartup: true, disableInputWhenNotFocused: false, objects, instances: [], variables: [], behaviorsSharedData: [], layers: [{ name: '', visibility: true, effects: [], cameras: [{ defaultSize: true, defaultViewport: true, width: 0, height: 0, viewportLeft: 0, viewportTop: 0, viewportRight: 1, viewportBottom: 1 }] }], events: [{ type: 'BuiltinCommonInstructions::JsCode', inlineCode: eventCode.split('\n'), parameterObjects: '', useStrict: true, eventsSheetExpanded: false }] }],
  };
  files.push({ name: 'gdevelop/game.json', data: JSON.stringify(project, null, 2) + '\n' });
  files.push({ name: 'gdevelop/Paperdoll.js', data: eventCode + '\n' });
  files.push({ name: 'gdevelop/README.txt', data: `GDevelop 5.6.285+ native project\n\nOpen game.json in GDevelop, then Preview. Every item layer is a native Sprite object with registered individual PNG frames and a shared pivot origin. One JavaScript event drives exact frame timing and equipment; Paperdoll.js is a readable copy already embedded in the event (do not run it twice).\n\nExisting project: copy all Sprite objects from this scene, copy the PixelDoll JavaScript event into your destination scene, and copy images/ alongside its project file (preserve registered resource paths). GDevelop's object copy imports resources; check Resources for missing files before preview/export. Place the event before events using the controller. Keep all objects/resources, including unequipped items.\n\nIn a later JavaScript event:\n  const library = runtimeScene[${JSON.stringify(namespace)}];\n  const doll = library.dolls[0];\n  doll.x = 320; doll.y = 240; // position is the shared pivot\n  doll.play(moveId, directionId); // restarts; call on a change, not every frame\n  doll.equip(slotId, itemId); // null unequips; body is protected\n  doll.applyPreset(outfitId); // stored preset id or preset object\n  doll.setVariants({ materialId: "storedVariantId" });\n  const second = library.create(400, 240); // independently equipped/recolored\n  doll.layer = ""; doll.z = 0; // scene layer and first consecutive layer z rank\n  doll.destroy();\n\nThe embedded event updates every doll once per scene frame; do not call update again. Reserve enough consecutive z values for each doll's visible layers. Source palette pixels remain immutable; recolored PIXI textures belong to each doll and are released by destroy(). Native JavaScript events use GDevelop's PIXI renderer; 2D Canvas/WebGL texture rendering, exact RGB palette ramps, linked defaults, outfit colors, hides, baked tuck variants, per-cell z overrides and variable/repeated-frame timelines are preserved. Non-looping clips stop on their last frame.\n\nSprite collision masks cover individual layers; use a separate gameplay collision object for the character body. Native Sprite/resource/library identities include a stable 16-hex character key derived from its name and frozen base hash. Different characters with the same item IDs can coexist; importing the same name/base export again replaces that library. Create multiple doll instances with library.create(). Image filenames are short for Windows extraction. Generated Sprite names encode item/layer IDs to prevent user-name collisions. No extension installation or network request is needed.\n` });
  return files;
}
