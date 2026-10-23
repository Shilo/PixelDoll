// Godot 4 export (manifest-spec §6.2): SpriteFrames .tres per (item, layer), Paperdoll.tscn, paperdoll.gd.
// Paths are relative to godot/, so the export folder can live anywhere under res://.
import type { Manifest } from '../store/manifest.ts';
import type { OutFile } from './generic.ts';
import { layerFrame } from '../compose/compose.ts';

const q = JSON.stringify;
/** Encode instead of sanitize: valid move names walk-fast and walk_fast must remain distinct. */
const rid = (s: string) => q('r_' + Array.from(s, (c) => c.codePointAt(0)!.toString(16)).join('_'));
const num = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export function spriteFramesTres(m: Manifest, itemId: string, layerId: string): string {
  const { rig } = m;
  const layer = m.items.find((i) => i.id === itemId)!.layers.find((l) => l.id === layerId)!, { w, h } = layerFrame(rig, layer);
  const ext = rig.animations.map((a) => `[ext_resource type="Texture2D" path=${q('../' + (layer.sourceSheets?.[a.id] ?? layer.sheets![a.id]))} id=${rid(a.id)}]`);
  const subs: string[] = [], anims: string[] = [];
  for (const a of rig.animations) {
    const msBase = Math.min(...a.frames.map((f) => f.ms));
    rig.directions.forEach((d, r) => {
      for (let c = 0; c < a.cells; c++)
        subs.push(`[sub_resource type="AtlasTexture" id=${rid(`${a.id}_${d.id}_${c}`)}]\natlas = ExtResource(${rid(a.id)})\nregion = Rect2(${c * w}, ${r * h}, ${w}, ${h})\nfilter_clip = true\n`);
      const frames = a.frames.map((f) => `{\n"duration": ${num(f.ms / msBase)},\n"texture": SubResource(${rid(`${a.id}_${d.id}_${f.cell}`)})\n}`);
      anims.push(`{\n"frames": [${frames.join(', ')}],\n"loop": ${a.loop},\n"name": &${q(`${a.id}_${d.id}`)},\n"speed": ${num(1000 / msBase)}\n}`);
    });
  }
  return `[gd_resource type="SpriteFrames" format=3]\n\n${ext.join('\n')}\n\n${subs.join('\n')}\n[resource]\nanimations = [${anims.join(', ')}]\n`;
}

/** One AnimatedSprite2D per (slot, role) that any item uses; sprite_frames from the default preset. */
export function paperdollTscn(m: Manifest): string {
  const { rig } = m, preset = m.presets[0];
  const nodes = new Map<string, { slot: string; role: string; z: number; res?: string; pivot: { x: number; y: number } }>();
  for (const s of m.slots)
    for (const it of m.items.filter((i) => i.slot === s.id))
      for (const l of it.layers) {
        const key = `${s.id}_${l.role}`;
        const on = (preset?.items[s.id] ?? (s.id === 'body' ? rig.baseItem : null)) === it.id;
        const n = nodes.get(key) ?? { slot: s.id, role: l.role, z: l.z, pivot: rig.pivot };
        if (on) Object.assign(n, { z: l.z, res: `${it.id}_${l.id}`, pivot: layerFrame(rig, l) }); // oversize layers: own pivot
        nodes.set(key, n);
      }
  const res = [...new Set([...nodes.values()].flatMap((n) => (n.res ? [n.res] : [])))];
  const initial = rig.animations.find((a) => (a.directions ?? rig.directions.map((d) => d.id)).length);
  const first = initial ? `${initial.id}_${(initial.directions ?? rig.directions.map((d) => d.id))[0]}` : '';
  const out = [
    '[gd_scene format=3]\n',
    '[ext_resource type="Script" path="paperdoll.gd" id="script"]',
    '[ext_resource type="Resource" path="library.tres" id="library"]',
    ...res.map((r) => `[ext_resource type="SpriteFrames" path=${q(r + '.tres')} id=${rid(r)}]`),
    '',
    `[node name=${q(m.name.replace(/[^A-Za-z0-9_]/g, '_') || 'Paperdoll')} type="Node2D"]\ntexture_filter = 1\nscript = ExtResource("script")\nlibrary = ExtResource("library")\n`,
  ];
  // B14: equal z_index draws in tree order, so the tree follows compose's tie-break (slot order, bg before fg): hair bg and a
  // held bg both at z 5 (south) drew the hair over the blade in Godot, the blade over the hair in PixelDoll (4 px, Ranger)
  const ix = (n: { slot: string; role: string }) => m.slots.findIndex((s) => s.id === n.slot) * 2 + (n.role === 'bg' ? 0 : 1);
  for (const [name, n] of [...nodes].sort((a, b) => ix(a[1]) - ix(b[1])))
    out.push([
      `[node name=${q(name)} type="AnimatedSprite2D" parent="."]`,
      ...(n.res ? [] : ['visible = false']),
      `z_index = ${n.z}`,
      ...(n.res ? [`sprite_frames = ExtResource(${rid(n.res)})`, `animation = &${q(first)}`] : []),
      'centered = false',
      `offset = Vector2(${-n.pivot.x}, ${-n.pivot.y})`,
      `metadata/slot = ${q(n.slot)}`,
      `metadata/role = ${q(n.role)}`,
      '',
    ].join('\n'));
  return out.join('\n');
}

export const PAPERDOLL_GD = `extends Node2D
## PixelDoll paperdoll (pixeldoll/1). body_fg is the clock: every other layer copies its animation, frame and
## progress on frame_changed, so layers cannot drift. library.tres retains every equipment dependency in game builds.
## Oversize layers (e.g. a 96x96 sword) have their own cell and pivot: equip sets each node's offset to -layer.pivot, so
## every layer's pivot lands on the node origin.

signal equipment_changed

@export var library: Resource
var manifest: Dictionary
var equipped := {} # slot id -> item id ("" = empty)
var variants := {}
var anim := ""
var dir := ""
var _refreshing := false
var _frame_cache := {}
var _texture_cache := {}
@onready var body: AnimatedSprite2D = $body_fg


func _ready() -> void:
	manifest = library.get_meta("manifest")
	body.frame_changed.connect(_sync)
	body.animation_changed.connect(_sync)
	set_preset(manifest["presets"][0]["id"] if not manifest["presets"].is_empty() else "")
	for move in manifest["rig"]["animations"]:
		var directions: Array = move.get("directions", manifest["rig"]["directions"].map(func(d): return d["id"]))
		if not directions.is_empty():
			play_anim(move["id"], directions[0])
			break


## Plays "<anim>_<dir>" on the body; layers follow.
func play_anim(a: String, d: String) -> void:
	var move := _find(manifest["rig"]["animations"], a)
	if move.is_empty() or (move.has("directions") and not move["directions"].has(d)):
		return
	if not body.sprite_frames.has_animation("%s_%s" % [a, d]):
		return
	anim = a
	dir = d
	body.play("%s_%s" % [a, d])
	_sync()


## Equips item_id in slot ("" = empty), then re-applies hides.
func equip(slot: String, item_id: String) -> void:
	if slot == "body" or _find(manifest["slots"], slot).is_empty():
		return
	var item := _find(manifest["items"], item_id)
	if not item_id.is_empty() and (item.is_empty() or item["slot"] != slot or item.has("variantOf")):
		return
	equipped[slot] = item_id
	_refresh()


## Outfit palettes are exact source-ramp swaps; names must exist in the exported materials' variants.
func set_preset(preset_id: String) -> void:
	var preset := _find(manifest["presets"], preset_id)
	if preset.is_empty() and not preset_id.is_empty():
		return
	var items: Dictionary = preset.get("items", {})
	for slot in manifest["slots"]:
		equipped[slot["id"]] = items.get(slot["id"], "") if items.get(slot["id"]) != null else ""
	equipped["body"] = manifest["rig"]["baseItem"]
	variants = preset.get("variants", {}).duplicate()
	_frame_cache.clear()
	_texture_cache.clear()
	_refresh()


func set_variant(material_id: String, variant_name: String) -> void:
	if _find(manifest["materials"], material_id).is_empty():
		return
	variants[material_id] = variant_name
	_frame_cache.clear()
	_texture_cache.clear()
	_refresh()


func _refresh() -> void:
	_refreshing = true
	var clock_frame := body.frame
	var clock_progress := body.frame_progress
	var clock_playing := body.is_playing()
	var clock_speed := body.get_playing_speed() / body.speed_scale if body.speed_scale != 0.0 else 1.0
	var hidden := {}
	for slot in equipped:
		var it := _find(manifest["items"], equipped[slot])
		if not it.is_empty():
			for h in it.get("hides", _find(manifest["slots"], slot).get("hides", [])):
				hidden[h] = true
	for node in _layers():
		var layer := _layer_of(node)
		node.visible = not layer.is_empty() and not hidden.has(node.get_meta("slot"))
		if not layer.is_empty():
			var frames := _coloured_frames(_find(manifest["items"], _shown(node.get_meta("slot"))), layer)
			if node.sprite_frames != frames:
				node.sprite_frames = frames
			var pv: Dictionary = layer.get("pivot", manifest["rig"]["pivot"])
			node.offset = -Vector2(pv["x"], pv["y"])
	if not anim.is_empty():
		if clock_playing:
			body.play("%s_%s" % [anim, dir], clock_speed)
		else:
			body.animation = "%s_%s" % [anim, dir]
		body.set_frame_and_progress(clock_frame, clock_progress)
	_refreshing = false
	_sync()
	equipment_changed.emit()


func _sync() -> void:
	if anim.is_empty() or _refreshing:
		return
	var frames: Array = _find(manifest["rig"]["animations"], anim)["frames"]
	var cell := int(frames[mini(body.frame, frames.size() - 1)]["cell"])
	for node in _layers():
		var layer := _layer_of(node)
		if layer.is_empty():
			continue
		node.z_index = _z(node.get_meta("slot"), layer, cell)
		if node != body and node.visible:
			if node.animation != body.animation:
				node.animation = body.animation
			node.set_frame_and_progress(body.frame, body.frame_progress)


func _variant_of(id: String, seen: Dictionary) -> String:
	var material := _find(manifest["materials"], id)
	if material.is_empty() or seen.has(id):
		return ""
	seen[id] = true
	if material.has("linkTo") and not material["linkTo"].is_empty():
		return _variant_of(material["linkTo"], seen)
	return variants.get(id, material.get("defaultVariant", ""))


func _coloured_frames(item: Dictionary, layer: Dictionary) -> SpriteFrames:
	var key: String = "%s_%s" % [item["id"], layer["id"]]
	if _frame_cache.has(key):
		return _frame_cache[key]
	var source: SpriteFrames = library.get_meta("frames")[key]
	var swaps := {}
	for material_id in item.get("materials", []):
		var material := _find(manifest["materials"], material_id)
		if material.is_empty() or material["owner"] != item.get("variantOf", item["id"]):
			continue
		var target: Array = material["variants"].get(_variant_of(material_id, {}), [])
		for i in mini(target.size(), material["ramp"].size()):
			var rgb := int(str(material["ramp"][i]).trim_prefix("#").hex_to_int())
			swaps[rgb] = int(str(target[i]).trim_prefix("#").hex_to_int())
	if swaps.is_empty():
		_frame_cache[key] = source
		return source
	# SpriteFrames.duplicate() shares nested frame dictionaries; build a fresh resource to keep sources immutable.
	var result := SpriteFrames.new()
	result.remove_animation("default")
	for animation in source.get_animation_names():
		result.add_animation(animation)
		result.set_animation_loop(animation, source.get_animation_loop(animation))
		result.set_animation_speed(animation, source.get_animation_speed(animation))
		for frame in source.get_frame_count(animation):
			var atlas := source.get_frame_texture(animation, frame) as AtlasTexture
			var texture_key: String = "%s:%s" % [item["id"], atlas.atlas.resource_path]
			if not _texture_cache.has(texture_key):
				var image := atlas.atlas.get_image().duplicate() as Image
				image.convert(Image.FORMAT_RGBA8)
				var bytes := image.get_data()
				for offset in range(0, bytes.size(), 4):
					var rgb: int = (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2]
					if bytes[offset + 3] > 0 and swaps.has(rgb):
						var replacement: int = swaps[rgb]
						bytes[offset] = (replacement >> 16) & 255
						bytes[offset + 1] = (replacement >> 8) & 255
						bytes[offset + 2] = replacement & 255
				image.set_data(image.get_width(), image.get_height(), false, Image.FORMAT_RGBA8, bytes)
				_texture_cache[texture_key] = ImageTexture.create_from_image(image)
			var rendered := atlas.duplicate() as AtlasTexture
			rendered.atlas = _texture_cache[texture_key]
			result.add_frame(animation, rendered, source.get_frame_duration(animation, frame))
	_frame_cache[key] = result
	return result


## Most specific zOverride (cell > anim > dir > none, later wins on ties), else the layer's z.
func _z(slot: String, layer: Dictionary, cell: int) -> int:
	var z := int(layer["z"])
	var best := -1
	for o in _find(manifest["slots"], slot).get("zOverrides", []):
		if o["layer"] != layer["role"] or (o.has("dir") and o["dir"] != dir) or (o.has("anim") and o["anim"] != anim) or (o.has("cell") and int(o["cell"]) != cell):
			continue
		var rank := 3 if o.has("cell") else 2 if o.has("anim") else 1 if o.has("dir") else 0
		if rank >= best:
			best = rank
			z = int(o["z"])
	return z


func _layers() -> Array:
	return get_children().filter(func(n): return n is AnimatedSprite2D and n.has_meta("slot"))


func _layer_of(node: Node) -> Dictionary:
	var it := _find(manifest["items"], _shown(node.get_meta("slot")))
	return _find(it.get("layers", []), node.get_meta("role"), "role")


## The item drawn in slot: "<item>~<other>" (baked: hair tucked under a worn helmet, slots[].clips) when it exists.
func _shown(slot: String) -> String:
	var id: String = equipped.get(slot, "")
	if not id.is_empty():
		for s in equipped:
			var v := "%s~%s" % [id, equipped[s]]
			if not _find(manifest["items"], v).is_empty():
				return v
	return id


func _find(list: Array, id: String, key := "id") -> Dictionary:
	for x in list:
		if x[key] == id:
			return x
	return {}
`;

export function godotFiles(m: Manifest): OutFile[] {
  const files: OutFile[] = m.items.flatMap((it) => it.layers.map((l) => ({ name: `godot/${it.id}_${l.id}.tres`, data: spriteFramesTres(m, it.id, l.id) })));
  // A scene dependency retains every alternate item even when a game's export preset includes selected scenes only.
  // Store the manifest as native resource metadata too: runtime never depends on unimported JSON/FileAccess paths.
  const layers = m.items.flatMap((it) => it.layers.map((l) => `${it.id}_${l.id}`));
  files.push({ name: 'godot/library.tres', data: `[gd_resource type="Resource" format=3]\n\n${layers.map((key, i) => `[ext_resource type="SpriteFrames" path=${q(key + '.tres')} id="f${i}"]`).join('\n')}\n\n[resource]\nmetadata/manifest = ${JSON.stringify(m)}\nmetadata/frames = {${layers.map((key, i) => `${q(key)}: ExtResource("f${i}")`).join(', ')}}\n` });
  files.push({ name: 'godot/Paperdoll.tscn', data: paperdollTscn(m) }, { name: 'godot/paperdoll.gd', data: PAPERDOLL_GD });
  files.push({
    name: 'godot/README.txt',
    data: `Copy the whole export folder into your Godot 4 project, then instance godot/Paperdoll.tscn.
API: play_anim(anim, dir), equip(slot, item_id) ("" = empty slot), set_preset(preset_id), set_variant(material_id, variant_name).
The frozen base body stays equipped. body_fg is the clock; other layers follow it. Palette swaps use exact source RGBs,
owner-local materials, linked selections and defaults; variant names must exist in exported materials[].variants.
library.tres retains the manifest and all equipment resources, including for selected-scene game exports.
Project settings: Rendering > Textures > Default Texture Filter = Nearest (the scene sets Nearest on its root anyway),
2D > Snap 2D Transforms To Pixel = on. Keep the exported folder structure intact.
`,
  });
  return files;
}

export function selfTest() {
  const m = {
    name: 'hero', rig: { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, baseItem: 'base', directions: [{ id: 'south' }, { id: 'west', mirrorOf: 'east' }], animations: [{ id: 'walk', cells: 2, loop: true, frames: [{ cell: 0, ms: 100 }, { cell: 1, ms: 200 }, { cell: 0, ms: 100 }] }] },
    slots: [{ id: 'body', z: 10 }, { id: 'back', z: 90, bgZ: 4 }],
    items: [
      { id: 'base', slot: 'body', layers: [{ id: 'main', role: 'fg', z: 10, sheets: { walk: 'layers/body/base/main/walk.png' } }] },
      { id: 'cape', slot: 'back', layers: [{ id: 'fg', role: 'fg', z: 90, sheets: { walk: 'a.png' } }, { id: 'bg', role: 'bg', z: 4, sheets: { walk: 'b.png' } }] },
    ],
    presets: [{ id: 'd', items: { body: 'base', back: null } }],
  } as unknown as Manifest;
  const t = spriteFramesTres(m, 'base', 'main');
  console.assert(t.includes(`path="../layers/body/base/main/walk.png" id=${rid('walk')}`) && t.includes('region = Rect2(64, 64, 64, 64)'), 'tres: relative path, west row 1 col 1');
  console.assert(t.includes('"speed": 10.0') && t.includes('"duration": 2.0') && (t.match(/"duration"/g) ?? []).length === 6, 'tres: msBase speed, relative durations, playlist frames x dirs');
  const s = paperdollTscn(m);
  console.assert(s.includes('[node name="body_fg" type="AnimatedSprite2D" parent="."]') && s.includes('offset = Vector2(-32, -60)'), 'tscn: body node + pivot offset');
  console.assert(s.indexOf('"body_fg"') < s.indexOf('"back_bg"') && s.indexOf('"back_bg"') < s.indexOf('"back_fg"') &&s.includes('visible = false\nz_index = 4'), 'tscn: tree in compose tie-break order (slot, bg before fg), unequipped slot hidden');
  // oversize layer: own region size and node offset
  Object.assign(m.items[1].layers[0], { cell: { w: 96, h: 96 }, pivot: { x: 48, y: 76 } });
  m.presets[0].items.back = 'cape';
  console.assert(spriteFramesTres(m, 'cape', 'fg').includes('region = Rect2(96, 96, 96, 96)'), 'tres: oversize region');
  console.assert(paperdollTscn(m).includes('offset = Vector2(-48, -76)') && PAPERDOLL_GD.includes('node.offset = -Vector2(pv["x"], pv["y"])'), 'tscn/gd: oversize offset');
  // B15: 8 directions -> ids without '-', animation names keep the direction id
  m.rig.directions = [{ id: 'south-east' }];
  const t8 = spriteFramesTres(m, 'base', 'main');
  console.assert(t8.includes(`id=${rid('walk_south-east_0')}`) && t8.includes(`SubResource(${rid('walk_south-east_1')})`) && t8.includes('&"walk_south-east"') && !/id="[^"]*-/.test(t8), 'tres: resource ids letters/digits/_ only');
}
