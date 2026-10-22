// Godot 4 export (manifest-spec §6.2): SpriteFrames .tres per (item, layer), Paperdoll.tscn, paperdoll.gd.
// Paths are relative to godot/, so the export folder can live anywhere under res://.
import type { Manifest } from '../store/manifest.ts';
import type { OutFile } from './generic.ts';
import { layerFrame } from '../compose/compose.ts';

const q = JSON.stringify;
/** Godot resource IDs allow letters, digits and _. Escape separators injectively: walk-fast and walk_fast must differ. */
const rid = (s: string) => q(s.replace(/[^A-Za-z0-9]/g, (c) => `_${c.charCodeAt(0).toString(16)}_`));
const num = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export function spriteFramesTres(m: Manifest, itemId: string, layerId: string): string {
  const { rig } = m;
  const layer = m.items.find((i) => i.id === itemId)!.layers.find((l) => l.id === layerId)!, { w, h } = layerFrame(rig, layer);
  const ext = rig.animations.map((a) => `[ext_resource type="Texture2D" path=${q('../' + layer.sheets![a.id])} id=${rid(a.id)}]`);
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
  const first = `${rig.animations[0].id}_${rig.directions[0].id}`;
  const out = [
    '[gd_scene format=3]\n',
    '[ext_resource type="Script" path="paperdoll.gd" id="script"]',
    ...res.map((r) => `[ext_resource type="SpriteFrames" path=${q(r + '.tres')} id=${rid(r)}]`),
    '',
    `[node name=${q(m.name.replace(/[^A-Za-z0-9_]/g, '_') || 'Paperdoll')} type="Node2D"]\ntexture_filter = 1\nscript = ExtResource("script")\n`,
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
## progress on frame_changed, so layers cannot drift. Reads ../manifest.json; no per-project data in this script.
## Oversize layers (e.g. a 96x96 sword) have their own cell and pivot: equip sets each node's offset to -layer.pivot, so
## every layer's pivot lands on the node origin.

signal equipment_changed

var manifest: Dictionary
var equipped := {} # slot id -> item id ("" = empty)
var anim := ""
var dir := ""
var _here := ""
@onready var body: AnimatedSprite2D = $body_fg


func _ready() -> void:
	_here = (get_script() as Script).resource_path.get_base_dir()
	manifest = JSON.parse_string(FileAccess.get_file_as_string(_here.path_join("../manifest.json").simplify_path()))
	var items: Dictionary = manifest["presets"][0]["items"]
	for slot in items:
		equipped[slot] = items[slot] if items[slot] != null else ""
	body.frame_changed.connect(_sync)
	body.animation_changed.connect(_sync)
	_refresh()
	play_anim(manifest["rig"]["animations"][0]["id"], manifest["rig"]["directions"][0]["id"])


## Plays "<anim>_<dir>" on the body; layers follow.
func play_anim(a: String, d: String) -> void:
	anim = a
	dir = d
	body.play("%s_%s" % [a, d])
	_sync()


## Equips item_id in slot ("" = empty), then re-applies hides.
func equip(slot: String, item_id: String) -> void:
	equipped[slot] = item_id
	_refresh()


func _refresh() -> void:
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
			var frames: SpriteFrames = load(_here.path_join("%s_%s.tres" % [_shown(node.get_meta("slot")), layer["id"]]))
			if node.sprite_frames != frames:
				node.sprite_frames = frames
			var pv: Dictionary = layer.get("pivot", manifest["rig"]["pivot"])
			node.offset = -Vector2(pv["x"], pv["y"])
	_sync()
	equipment_changed.emit()


func _sync() -> void:
	if anim.is_empty():
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
  files.push({ name: 'godot/Paperdoll.tscn', data: paperdollTscn(m) }, { name: 'godot/paperdoll.gd', data: PAPERDOLL_GD });
  files.push({
    name: 'godot/README.txt',
    data: `Copy the whole export folder into your Godot 4 project, then instance godot/Paperdoll.tscn.
API: play_anim(anim, dir), equip(slot, item_id) ("" = empty slot). body_fg is the clock; other layers follow it.
Project settings: Rendering > Textures > Default Texture Filter = Nearest (the scene sets Nearest on its root anyway),
2D > Snap 2D Transforms To Pixel = on. Export presets: add "*.json" to non-resource files so manifest.json ships.
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
  console.assert(t.includes('path="../layers/body/base/main/walk.png" id="walk"') && t.includes('region = Rect2(64, 64, 64, 64)'), 'tres: relative path, west row 1 col 1');
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
  console.assert(t8.includes('id="walk_5f_south_2d_east_5f_0"') && t8.includes('SubResource("walk_5f_south_2d_east_5f_1")') && t8.includes('&"walk_south-east"') && !/id="[^"]*-/.test(t8), 'tres: resource ids letters/digits/_ only');
}
