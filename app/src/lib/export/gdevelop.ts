// GDevelop 5 native project. Sprite resources are registered, so the editor/exporter retains every equipment frame.
import type { Manifest } from '../store/manifest.ts';
import type { Img } from '../image/png.ts';
import type { OutFile } from './generic.ts';
import { layerFrame } from '../compose/compose.ts';
import { runtimeSources } from '../runtime/sources.ts';

/** Stable character identity for a GDevelop library. */
export function gdCharacterKey(m: Manifest): string {
	let hash = 0xcbf29ce484222325n;
	for (const byte of new TextEncoder().encode(
		m.exportId ?? JSON.stringify([m.name, m.rig.baseHash])
	))
		hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
	return hash.toString(16).padStart(16, '0');
}
export const gdObjectName = (item: string, layer: string, character = '') =>
	'PD_' +
	(character ? character + '_' : '') +
	Array.from(JSON.stringify([item, layer]), (c) => c.codePointAt(0)!.toString(16)).join('_');
const resourceName = (object: string, anim: number, row: number, cell: number) =>
	`${object}_${anim}_${row}_${cell}.png`;

/** Embedded as a native JavaScript event: no network fetch, package dependency or external script registration. */
export const GDEVELOP_RUNTIME = `
function createPixelDoll(scene, m, names, x = 320, y = 240, preset = m.presets[0] ?? { items: {}, variants: {} }) {
${Object.values(runtimeSources)
	.join('\n')
	.replace(/^export /gm, '')}
  const resolved = resolvePreset(m, preset);
  const d = { x, y, z: 0, layer: '', m, scene, names, nodes: new Map(), textures: new Map(), destroyed: false,
    equipped: resolved.items, variants: resolved.variants, elapsed: 0, action: null, layerActions: false };
  const available = (a) => a.directions ?? m.rig.directions.map((v) => v.id);
  d.play = (anim, dir, restart = false) => {
    const a = m.rig.animations.find((a) => a.id === anim);
    if (!a || !available(a).includes(dir)) throw new Error('PixelDoll: unavailable move/direction ' + anim + '/' + dir);
    d.action = null;
    if (restart || d.anim !== a || d.dir !== dir || (!a.loop && d.elapsed >= timelineDuration(a.frames))) d.elapsed = 0;
    d.anim = a; d.dir = dir; d.sync(); return d;
  };
  // Keeps elapsed time, so the playlist entry, loop position and once-only completion carry over.
  d.setDirection = (dir) => {
    if (!d.anim) throw new Error('PixelDoll: no active move');
    if (!available(d.anim).includes(dir)) throw new Error('PixelDoll: unavailable move/direction ' + d.anim.id + '/' + dir);
    if (dir === d.dir) return d;
    d.dir = dir; d.sync(); return d;
  };
  Object.defineProperty(d, 'actionPlaying', { get: () => d.action !== null });
  d.setActionLayering = (enabled) => { d.layerActions = !!enabled; };
  d.canLayerAction = (anim, dir) => {
    const move = m.rig.animations.find((a) => a.id === anim);
    return !!(move && available(move).includes(dir) && d.anim && d.dir === dir &&
      canExportLayerAction(m, d.equipped, d.anim.id, dir, anim));
  };
  d.playAction = (anim, dir) => {
    const move = m.rig.animations.find((a) => a.id === anim);
    if (!move || !available(move).includes(dir)) throw new Error('PixelDoll: unavailable move/direction ' + anim + '/' + dir);
    const layered = d.layerActions && d.canLayerAction(anim, dir);
    d.action = { move, dir, elapsed: 0, layered, lower: layered ? { clip: d.anim.id, direction: d.dir, cell: d.cell } : null };
    d.sync();
    return layered ? 'layered' : 'full';
  };
  const checkActionOutfit = () => {
    const action = d.action;
    if (action?.layered && action.lower)
      action.layered = canExportLayerAction(m, d.equipped, action.lower.clip, action.dir, action.move.id);
  };
  d.equip = (slot, id) => {
    if (slot === 'body' || !validEquipment(m, slot, id)) throw new Error('PixelDoll: invalid equipment for ' + slot);
    d.equipped[slot] = id; checkActionOutfit(); d.sync(); return d;
  };
  d.setVariants = (variants) => { d.variants = { ...variants }; d.sync(); return d; };
  d.applyPreset = (preset) => {
    const resolved = resolvePreset(m, preset);
    d.equipped = resolved.items; checkActionOutfit(); return d.setVariants(resolved.variants);
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
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      data.data.set(applyPalette({ w: canvas.width, h: canvas.height, data: data.data }, map).data);
      ctx.putImageData(data, 0, 0);
      const tex = PIXI.Texture.from(canvas); tex.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
      d.textures.set(key, tex);
    }
    return d.textures.get(key);
  };
  d.sync = () => {
    if (!d.anim || d.destroyed) return;
    const a = d.anim;
    d.cell = sampleTimeline(a.frames, d.elapsed, a.loop);
    for (const node of d.nodes.values()) node.hide();
    const visible = [];
    const pose = { clip: a.id, direction: d.dir, cell: d.cell };
    const action = d.action;
    if (action?.layered) action.lower = holdActionWalk(action.lower, pose, action.dir);
    const draws = action ? exportedActionDraws(m, d.equipped,
      { clip: action.move.id, direction: action.dir, cell: sampleTimeline(action.move.frames, action.elapsed, false) },
      action.lower, action.layered)
      : drawList(m, d.equipped, a.id, d.dir, d.cell).map((draw) => ({ ...draw, ...pose, part: null, point: { x: 0, y: 0 } }));
    for (const draw of draws) {
      const { item, layer: l, clip, direction, cell, part, point } = draw;
      const name = names[item.id][l.id], key = (part || '') + name;
      let node = d.nodes.get(key);
      if (!node) { node = scene.createObject(name); if (!node) throw new Error('PixelDoll: missing Sprite ' + name); d.nodes.set(key, node); }
      node.setLayer(d.layer); node.hide(false); node.setAnimationName(JSON.stringify(part ? [clip, direction, part] : [clip, direction])); node.setAnimationFrame(cell); node.pauseAnimation();
      node.setPosition(d.x + point.x, d.y + point.y);
      node.updatePreRender(scene);
      const ai = m.rig.animations.findIndex((v) => v.id === clip), row = m.rig.directions.findIndex((v) => v.id === direction);
      node.getRendererObject().texture = texture((part ? part + '_' : '') + name + '_' + ai + '_' + row + '_' + cell + '.png', paletteMap(m, item, d.variants));
      visible.push(node);
    }
    // Integer z ranks preserve arbitrary/negative z overrides and stable ties without renderer creation-order dependence.
    visible.forEach((node, i) => node.setZOrder(d.z + i));
  };
  d.update = (ms) => { if (!d.destroyed) { const delta = Math.max(0, ms);
    d.elapsed += delta;
    if (d.action && (d.action.elapsed += delta) >= timelineDuration(d.action.move.frames)) d.action = null;
    d.sync(); } };
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
	const files: OutFile[] = [],
		resources: Record<string, unknown>[] = [],
		objects: Record<string, unknown>[] = [];
	const names: Record<string, Record<string, string>> = {};
	const character = gdCharacterKey(m);
	const written = new Map<string, { image: Img; file: string }[]>();
	const sharedFile = (image: Img, file: string) => {
		let hash = 0x811c9dc5;
		for (const word of new Uint32Array(
			image.data.buffer,
			image.data.byteOffset,
			image.data.length / 4
		))
			hash = Math.imul(hash ^ word, 0x01000193);
		const key = `${image.w}x${image.h}:${hash >>> 0}`,
			same = written.get(key) ?? [];
		const found = same.find(({ image: other }) =>
			other.data.every((value, index) => value === image.data[index])
		);
		if (found) return found.file;
		same.push({ image, file });
		written.set(key, same);
		files.push({ name: `gdevelop/images/${file}`, data: image });
		return file;
	};
	for (const [ii, it] of m.items.entries()) {
		names[it.id] = {};
		for (const [li, l] of it.layers.entries()) {
			const name = gdObjectName(it.id, l.id, character),
				f = layerFrame(m.rig, l);
			names[it.id][l.id] = name;
			const animations: Record<string, unknown>[] = [];
			for (const [ai, a] of m.rig.animations.entries()) {
				const source = sheets.get(l.sourceSheets?.[a.id] ?? l.sheets![a.id]);
				if (!source) throw new Error(`GDevelop: missing source sheet ${it.id}/${l.id}/${a.id}`);
				for (const [row, dir] of m.rig.directions.entries()) {
					const sprites: ReturnType<typeof frame>[] = [];
					const fragments = { lower: [] as typeof sprites, upper: [] as typeof sprites };
					const frame = (image: string) => ({
						image,
						hasCustomCollisionMask: false,
						points: [],
						originPoint: { name: 'origine', x: f.x, y: f.y },
						centerPoint: { automatic: true, name: 'centre', x: 0, y: 0 },
						customCollisionMask: []
					});
					const copyCell = (sheet: Img, cell: number) => {
						const data = new Uint8ClampedArray(f.w * f.h * 4);
						for (let y = 0; y < f.h; y++) {
							const start = ((row * f.h + y) * sheet.w + cell * f.w) * 4;
							data.set(sheet.data.subarray(start, start + f.w * 4), y * f.w * 4);
						}
						return { w: f.w, h: f.h, data };
					};
					for (let cell = 0; cell < a.cells; cell++) {
						const resource = resourceName(name, ai, row, cell);
						// Identical frames (above all the blank ones of items not drawn for a move) share one file, so a character
						// with many items stays within the ZIP entry limit; resources stay one per frame for the runtime's lookups.
						const imageFile = sharedFile(
							copyCell(source, cell),
							// Short filenames also keep unpacking safe for Windows' path limits; resource names remain identity-specific.
							`${character}_${ii}_${li}_${ai}_${row}_${cell}.png`
						);
						resources.push({
							kind: 'image',
							name: resource,
							file: `images/${imageFile}`,
							smoothed: false,
							userAdded: true,
							alwaysLoaded: true,
							metadata: ''
						});
						for (const part of ['lower', 'upper'] as const) {
							const path = l.actionSheets?.[part]?.[a.id];
							if (!path) continue;
							const fragment = sheets.get(path);
							if (!fragment) throw new Error(`GDevelop: missing fragment ${path}`);
							const file = sharedFile(
								copyCell(fragment, cell),
								`${part}_${character}_${ii}_${li}_${ai}_${row}_${cell}.png`
							);
							resources.push({
								kind: 'image',
								name: `${part}_${resource}`,
								file: `images/${file}`,
								smoothed: false,
								userAdded: true,
								alwaysLoaded: true,
								metadata: ''
							});
							fragments[part].push(frame(`${part}_${resource}`));
						}
						sprites.push(frame(resource));
					}
					const animation = (key: string[], frames: typeof sprites) => ({
						name: JSON.stringify(key),
						useMultipleDirections: false,
						directions: [{ looping: false, timeBetweenFrames: 1, sprites: frames }]
					});
					animations.push(animation([a.id, dir.id], sprites));
					for (const part of ['lower', 'upper'] as const)
						if (fragments[part].length)
							animations.push(animation([a.id, dir.id, part], fragments[part]));
				}
			}
			objects.push({
				name,
				type: 'Sprite',
				updateIfNotVisible: true,
				adaptCollisionMaskAutomatically: false,
				variables: [],
				effects: [],
				behaviors: [],
				animations
			});
		}
	}
	const namespace = 'PixelDoll_PD_' + character;
	const eventCode = `// PixelDoll: keep this event before events that use the controller.\nconst key = ${JSON.stringify(namespace)};\nif (!runtimeScene[key]) {\n${GDEVELOP_RUNTIME}\n  const m = ${JSON.stringify(m)};\n  const names = ${JSON.stringify(names)};\n  const state = { dolls: [], create: (x, y, preset) => { const d = createPixelDoll(runtimeScene, m, names, x, y, preset); state.dolls.push(d); return d; } };\n  runtimeScene[key] = state;\n  gdjs._pixelDollCleanupKeys ??= new Set();\n  if (!gdjs._pixelDollCleanupKeys.has(key)) {\n    gdjs._pixelDollCleanupKeys.add(key);\n    gdjs.registerRuntimeSceneUnloadedCallback((scene) => { for (const doll of scene[key]?.dolls ?? []) doll.destroy(); });\n  }\n  state.create();\n}\nruntimeScene[key].dolls = runtimeScene[key].dolls.filter((doll) => !doll.destroyed);\nfor (const doll of runtimeScene[key].dolls) doll.update(runtimeScene.getTimeManager().getElapsedTime());`;
	const project = {
		firstLayout: 'Paperdoll',
		gdVersion: { build: 285, major: 5, minor: 6, revision: 0 },
		properties: {
			name: m.name,
			author: '',
			description:
				'Editable PixelDoll character. See README.txt for integration and controller API.',
			version: '1.0.0',
			packageName: 'com.pixeldoll.character',
			windowWidth: 640,
			windowHeight: 480,
			maxFPS: 60,
			minFPS: 1,
			scaleMode: 'nearest',
			pixelsRounding: true,
			antialiasingMode: 'none',
			orientation: 'landscape',
			sizeOnStartupMode: 'adaptWidth',
			adaptGameResolutionAtRuntime: false,
			folderProject: false,
			verticalSync: true,
			latestCompilationDirectory: '',
			platformSpecificAssets: {},
			watermark: { showWatermark: true, placement: 'bottom-left' },
			authorIds: [],
			authorUsernames: [],
			categories: [],
			playableDevices: [],
			extensionProperties: [],
			currentPlatform: 'GDevelop JS platform',
			platforms: [{ name: 'GDevelop JS platform' }],
			loadingScreen: { showGDevelopSplash: false, showProgressBar: true }
		},
		resources: { resources, resourceFolders: [] },
		objects: [],
		objectsGroups: [],
		variables: [],
		externalEvents: [],
		externalLayouts: [],
		eventsFunctionsExtensions: [],
		uiSettings: {},
		layouts: [
			{
				name: 'Paperdoll',
				title: m.name,
				r: 32,
				v: 32,
				b: 36,
				standardSortMethod: true,
				stopSoundsOnStartup: true,
				disableInputWhenNotFocused: false,
				objects,
				instances: [],
				variables: [],
				behaviorsSharedData: [],
				layers: [
					{
						name: '',
						visibility: true,
						effects: [],
						cameras: [
							{
								defaultSize: true,
								defaultViewport: true,
								width: 0,
								height: 0,
								viewportLeft: 0,
								viewportTop: 0,
								viewportRight: 1,
								viewportBottom: 1
							}
						]
					}
				],
				events: [
					{
						type: 'BuiltinCommonInstructions::JsCode',
						inlineCode: eventCode.split('\n'),
						parameterObjects: '',
						useStrict: true,
						eventsSheetExpanded: false
					}
				]
			}
		]
	};
	files.push({ name: 'gdevelop/game.json', data: JSON.stringify(project, null, 2) + '\n' });
	files.push({ name: 'gdevelop/Paperdoll.js', data: eventCode + '\n' });
	files.push({
		name: 'gdevelop/README.txt',
		data: `GDevelop 5.6.285+ native project\n\nOpen game.json in GDevelop, then Preview. Every item layer is a native Sprite object with registered individual PNG frames and a shared pivot origin. One JavaScript event drives exact frame timing and equipment; Paperdoll.js is a readable copy already embedded in the event (do not run it twice).\n\nExisting project: copy all Sprite objects from this scene, copy the PixelDoll JavaScript event into your destination scene, and copy images/ alongside its project file (preserve registered resource paths). GDevelop's object copy imports resources; check Resources for missing files before preview/export. Place the event before events using the controller. Keep all objects/resources, including unequipped items.\n\nIn a later JavaScript event:\n  const library = runtimeScene[${JSON.stringify(namespace)}];\n  const doll = library.dolls[0];\n  doll.x = 320; doll.y = 240; // position is the shared pivot\n  doll.play(moveId, directionId); // preserves active progress; true as third argument restarts\n  doll.setDirection(directionId); // turns the active move, keeping its progress\n  doll.equip(slotId, itemId); // null unequips; body is protected\n  doll.applyPreset(outfitId); // stored preset id or preset object\n  doll.setVariants({ "<material-id>": "<variant-id>" });\n  const second = library.create(400, 240); // independently equipped/recolored\n  doll.layer = ""; doll.z = 0; // scene layer and first consecutive layer z rank\n  doll.destroy();\n\nplay preserves active progress, starts changed moves/directions at the beginning and replays completed once-only clips. setDirection turns the active move (e.g. an aimed attack) and keeps its frame, time, loop position and completion; the current direction is a no-op. Invalid move/direction, equipment and outfit IDs, or setDirection without an active move, throw before changing state; null unequips non-body slots. setVariants replaces explicit selections: omitted keys or null restore material defaults, while an empty-string selection uses source colors. Linked materials follow the target selection.\n\nCall setActionLayering(true) to enable moving attacks when the ZIP contains precut fragments. canLayerAction(move, direction) checks the whole action set and equipped gear. Invalid playAction calls throw without changing playback. playAction(move, direction) returns "layered" or "full", plays once and leaves the gait clock running. Read actionPlaying for completion. Calling play cancels the action. An outfit that cannot be layered switches the action to full once; it stays full until the next action. A layered action holds the last gait cell in the action's direction when the gait faces away. Turning back resumes drawing the current gait cell. Both clocks keep running.\n\nThe embedded event updates every doll once per scene frame; do not call update again. Reserve enough consecutive z values for each doll's visible layers. Source palette pixels remain immutable; recolored PIXI textures belong to each doll and are released by destroy(). Native JavaScript events use GDevelop's PIXI renderer; 2D Canvas/WebGL texture rendering, exact RGB palette ramps, linked defaults, outfit colors, hides, baked tuck variants, per-cell z overrides and variable/repeated-frame timelines are preserved. Non-looping clips stop on their last frame.\n\nSprite collision masks cover individual layers; use a separate gameplay collision object for the character body. Native Sprite/resource/library identities include a stable 16-hex character key derived from its name and frozen base hash. Different characters with the same item IDs can coexist; importing the same name/base export again replaces that library. Create multiple doll instances with library.create(). Image filenames are short for Windows extraction. Generated Sprite names encode item/layer IDs to prevent user-name collisions. No extension installation or network request is needed.\n`
	});
	return files;
}
