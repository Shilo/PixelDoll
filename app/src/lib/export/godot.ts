// Godot 4 export (manifest-spec §6.2): SpriteFrames .tres per (item, layer), Paperdoll.tscn, paperdoll.gd.
// Paths are relative to godot/, so the export folder can live anywhere under res://.
import type { Manifest } from '../store/manifest.ts';
import type { OutFile } from './generic.ts';
import { layerFrame, resolveZ } from '../compose/compose.ts';
import { boundedFileStem } from './paths.ts';

const q = JSON.stringify;
/** Encode instead of sanitize: valid move names walk-fast and walk_fast must remain distinct. */
const rid = (s: string) => q('r_' + Array.from(s, (c) => c.codePointAt(0)!.toString(16)).join('_'));
const num = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export function spriteFramesTres(
	m: Manifest,
	itemId: string,
	layerId: string,
	part?: 'lower' | 'upper'
): string {
	const { rig } = m;
	const layer = m.items.find((i) => i.id === itemId)!.layers.find((l) => l.id === layerId)!,
		{ w, h } = layerFrame(rig, layer);
	const clips = part
		? rig.animations.filter((a) => layer.actionSheets?.[part]?.[a.id])
		: rig.animations;
	const ext = clips.map(
		(a) =>
			`[ext_resource type="Texture2D" path=${q('../' + (part ? layer.actionSheets![part]![a.id] : (layer.sourceSheets?.[a.id] ?? layer.sheets![a.id])))} id=${rid(a.id)}]`
	);
	const subs: string[] = [],
		anims: string[] = [];
	for (const a of clips) {
		const msBase = Math.min(...a.frames.map((f) => f.ms));
		rig.directions.forEach((d, r) => {
			for (let c = 0; c < a.cells; c++)
				subs.push(
					`[sub_resource type="AtlasTexture" id=${rid(`${a.id}_${d.id}_${c}`)}]\natlas = ExtResource(${rid(a.id)})\nregion = Rect2(${c * w}, ${r * h}, ${w}, ${h})\nfilter_clip = true\n`
				);
			const frames = a.frames.map(
				(f) =>
					`{\n"duration": ${num(f.ms / msBase)},\n"texture": SubResource(${rid(`${a.id}_${d.id}_${f.cell}`)})\n}`
			);
			anims.push(
				`{\n"frames": [${frames.join(', ')}],\n"loop": ${a.loop},\n"name": &${q(`${a.id}_${d.id}`)},\n"speed": ${num(1000 / msBase)}\n}`
			);
		});
	}
	return `[gd_resource type="SpriteFrames" format=3]\n\n${ext.join('\n')}\n\n${subs.join('\n')}\n[resource]\nanimations = [${anims.join(', ')}]\n`;
}

/** One AnimatedSprite2D per (slot, role) that any item uses; sprite_frames from the default preset. */
export function paperdollTscn(m: Manifest): string {
	const { rig } = m,
		preset = m.presets[0];
	const initial = rig.animations.find(
		(a) => (a.directions ?? rig.directions.map((d) => d.id)).length
	);
	const initialDir = initial
		? (initial.directions ?? rig.directions.map((d) => d.id))[0]
		: rig.directions[0].id;
	const nodes = new Map<
		string,
		{ slot: string; role: string; z: number; res?: string; pivot: { x: number; y: number } }
	>();
	for (const s of m.slots)
		for (const it of m.items.filter((i) => i.slot === s.id))
			for (const l of it.layers) {
				const key = `${s.id}_${l.role}`;
				const on = (preset?.items[s.id] ?? (s.id === 'body' ? rig.baseItem : null)) === it.id;
				const n = nodes.get(key) ?? { slot: s.id, role: l.role, z: l.z, pivot: rig.pivot };
				if (on)
					Object.assign(n, {
						z: initial ? resolveZ(s, l, initial.id, initialDir, initial.frames[0].cell) : l.z,
						res: `${it.id}_${l.id}`,
						pivot: layerFrame(rig, l)
					}); // oversize layers: own pivot
				nodes.set(key, n);
			}
	const res = [...new Set([...nodes.values()].flatMap((n) => (n.res ? [n.res] : [])))];
	if (nodes.size > 8193) throw new Error('Godot: supports at most 8193 paperdoll layer nodes.');
	const first = initial ? `${initial.id}_${initialDir}` : '';
	const out = [
		'[gd_scene format=3]\n',
		'[ext_resource type="Script" path="paperdoll.gd" id="script"]',
		'[ext_resource type="Resource" path="library.tres" id="library"]',
		...res.map(
			(r) =>
				`[ext_resource type="SpriteFrames" path=${q(boundedFileStem(r) + '.tres')} id=${rid(r)}]`
		),
		'',
		`[node name=${q(m.exportId ?? (m.name.replace(/[^A-Za-z0-9_]/g, '_') || 'Paperdoll'))} type="Node2D"]\ntexture_filter = 1\nscript = ExtResource("script")\nlibrary = ExtResource("library")\n`
	];
	// B14: equal z_index draws in tree order, so the tree follows compose's tie-break (slot order, bg before fg): hair bg and a
	// held bg both at z 5 (south) drew the hair over the blade in Godot, the blade over the hair in PixelDoll (4 px, Ranger)
	const ix = (n: { slot: string; role: string }) =>
		m.slots.findIndex((s) => s.id === n.slot) * 2 + (n.role === 'bg' ? 0 : 1);
	// Manifest depths describe ordering; CanvasItem only accepts -4096..4096. Keep the source values in library.tres.
	const ranks = new Map(
		[...nodes]
			.sort((a, b) => a[1].z - b[1].z || ix(a[1]) - ix(b[1]))
			.map(([name], i) => [name, i + Math.min(0, 4097 - nodes.size)])
	);
	for (const [name, n] of [...nodes].sort((a, b) => ix(a[1]) - ix(b[1])))
		out.push(
			[
				`[node name=${q(name)} type="AnimatedSprite2D" parent="."]`,
				...(n.res ? [] : ['visible = false']),
				`z_index = ${ranks.get(name)}`,
				...(n.res
					? [`sprite_frames = ExtResource(${rid(n.res)})`, `animation = &${q(first)}`]
					: []),
				'centered = false',
				`offset = Vector2(${-n.pivot.x}, ${-n.pivot.y})`,
				`metadata/slot = ${q(n.slot)}`,
				`metadata/role = ${q(n.role)}`,
				''
			].join('\n')
		);
	return out.join('\n');
}

export const PAPERDOLL_GD = `extends Node2D
## PixelDoll paperdoll (pixeldoll/3). body_fg is the clock: every other layer copies its animation, frame and
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
var _hidden := {}
var _action: Dictionary = {}
var _action_elapsed := 0.0
var _action_duration := 0.0
var _action_layered := false
var _layer_actions := false
var _action_dir := ""
var _action_nodes: Array[Sprite2D] = []
@onready var body: AnimatedSprite2D = $body_fg


func _ready() -> void:
	set_process(false)
	manifest = library.get_meta("manifest")
	body.frame_changed.connect(_sync)
	body.animation_changed.connect(_sync)
	if manifest["presets"].is_empty():
		equipped["body"] = manifest["rig"]["baseItem"]
		_refresh()
	else:
		set_preset(manifest["presets"][0]["id"])
	for move in manifest["rig"]["animations"]:
		var directions: Array = move.get("directions", manifest["rig"]["directions"].map(func(d): return d["id"]))
		if not directions.is_empty():
			play_anim(move["id"], directions[0])
			break


## Plays "<anim>_<dir>" on the body; layers follow.
func play_anim(a: String, d: String, restart: bool = false) -> bool:
	var move := _find(manifest["rig"]["animations"], a)
	if move.is_empty() or (move.has("directions") and not move["directions"].has(d)):
		push_warning("PixelDoll: unavailable move/direction %s/%s" % [a, d])
		return false
	if not body.sprite_frames.has_animation("%s_%s" % [a, d]):
		push_warning("PixelDoll: unavailable move/direction %s/%s" % [a, d])
		return false
	_cancel_action()
	anim = a
	dir = d
	if restart:
		body.stop()
	body.play("%s_%s" % [a, d])
	_sync()
	return true


func set_action_layering(enabled: bool) -> void:
	_layer_actions = enabled
	_sync()


func is_action_playing() -> bool:
	return not _action.is_empty()


func can_layer_action(a: String, d: String) -> bool:
	var move := _find(manifest["rig"]["animations"], a)
	if move.is_empty() or dir != d or (move.has("directions") and not move["directions"].has(d)):
		return false
	var pair := _action_pair(a, d)
	if pair.is_empty():
		return false
	for slot in equipped:
		if not _hidden.has(slot) and pair["blocked"].has(_shown(slot)):
			return false
	return true


func play_action(a: String, d: String) -> String:
	var move := _find(manifest["rig"]["animations"], a)
	if move.is_empty() or not body.sprite_frames.has_animation("%s_%s" % [a, d]) or (move.has("directions") and not move["directions"].has(d)):
		push_warning("PixelDoll: unavailable move/direction %s/%s" % [a, d])
		return ""
	_action_layered = _layer_actions and can_layer_action(a, d)
	_action = move
	_action_dir = d
	_action_elapsed = 0.0
	_action_duration = 0.0
	for frame in move["frames"]:
		_action_duration += float(frame["ms"])
	set_process(true)
	_sync()
	return "layered" if _action_layered else "full"


func _cancel_action() -> void:
	_action = {}
	set_process(false)


func _process(delta: float) -> void:
	_action_elapsed += delta * 1000.0
	if _action_elapsed >= _action_duration:
		_cancel_action()
	_sync()


func _action_pair(a: String, d: String) -> Dictionary:
	for pair in manifest.get("actionLayers", {}).get("pairs", []):
		if pair["walk"] == anim and pair["action"] == a and pair["direction"] == d:
			return pair
	return {}


func _pair_offset(a: String, d: String, action_cell: int) -> Dictionary:
	if anim.is_empty() or dir != d:
		return {}
	var frames: Array = _find(manifest["rig"]["animations"], anim)["frames"]
	var cell := int(frames[mini(body.frame, frames.size() - 1)]["cell"])
	var layers: Dictionary = manifest.get("actionLayers", {})
	var pair := _action_pair(a, d)
	if not pair.is_empty():
		var record: Variant = pair["cells"][cell * int(pair["upperCells"]) + action_cell]
		if record == null:
			return {}
		var lo := _action_hip(layers, anim, "lower", d, cell)
		var hi := _action_hip(layers, a, "upper", d, action_cell)
		if lo.is_empty() or hi.is_empty():
			return {}
		return { "x": int(lo[0]) - int(hi[0]) + int(record["x"]), "y": int(lo[1]) - int(hi[1]) + int(record["y"]) }
	return {}


func _action_hip(layers: Dictionary, a: String, part: String, d: String, cell: int) -> Array:
	for plane in layers.get("planes", []):
		if plane["clip"] == a and plane["part"] == part:
			var row := _find(plane["anchors"], d, "direction")
			if not row.is_empty() and row["cells"][cell] != null:
				return row["cells"][cell]
	return []


func _render_action() -> void:
	var frames: Array = _action["frames"]
	var elapsed := _action_elapsed
	var index := 0
	while index + 1 < frames.size() and elapsed >= float(frames[index]["ms"]):
		elapsed -= float(frames[index]["ms"])
		index += 1
	var a: String = _action["id"]
	var offset := _pair_offset(a, _action_dir, int(frames[index]["cell"])) if _action_layered else {}
	var draws: Array = []
	if offset.is_empty():
		_action_stack(draws, a, _action_dir, index, "", Vector2.ZERO)
	else:
		_action_stack(draws, anim, dir, body.frame, "lower", Vector2.ZERO)
		_action_stack(draws, a, _action_dir, index, "upper", Vector2(offset["x"], offset["y"]))
	draws.sort_custom(func(x, y): return x["z"] < y["z"] if x["z"] != y["z"] else x["order"] < y["order"])
	var start := maxi(-4096, mini(0, 4097 - draws.size()))
	for i in draws.size():
		if i >= _action_nodes.size():
			var sprite := Sprite2D.new()
			sprite.centered = false
			add_child(sprite)
			_action_nodes.append(sprite)
		var draw: Dictionary = draws[i]
		var node := _action_nodes[i]
		node.texture = draw["texture"]
		node.offset = draw["pivot"]
		node.position = draw["position"]
		node.z_index = mini(4096, start + i)
		node.show()


func _action_stack(draws: Array, a: String, d: String, index: int, part: String, pos: Vector2) -> void:
	var move := _find(manifest["rig"]["animations"], a)
	var cell := int(move["frames"][index]["cell"])
	var nodes := _layers()
	for order in nodes.size():
		var node: Node = nodes[order]
		var slot: String = node.get_meta("slot")
		if _hidden.has(slot):
			continue
		var layer := _layer_of(node)
		if layer.is_empty() or (not part.is_empty() and not layer.get("actionSheets", {}).get(part, {}).has(a)):
			continue
		var frames := _colored_frames(_find(manifest["items"], _shown(slot)), layer, part)
		var pv: Dictionary = layer.get("pivot", manifest["rig"]["pivot"])
		var slot_order: int = manifest["slots"].find(_find(manifest["slots"], slot))
		draws.append({
			"texture": frames.get_frame_texture("%s_%s" % [a, d], index),
			"pivot": -Vector2(pv["x"], pv["y"]),
			"position": pos, "z": _z(slot, layer, cell, a, d), "order": slot_order * 4 + int(layer["role"] != "bg") * 2 + int(part == "upper")
		})


## Equips item_id in slot ("" = empty), then re-applies hides.
func equip(slot: String, item_id: String) -> bool:
	if slot == "body" or _find(manifest["slots"], slot).is_empty():
		push_warning("PixelDoll: invalid equipment for %s" % slot)
		return false
	var item := _find(manifest["items"], item_id)
	if not item_id.is_empty() and (item.is_empty() or item["slot"] != slot or item.has("variantOf")):
		push_warning("PixelDoll: invalid equipment for %s" % slot)
		return false
	equipped[slot] = item_id
	_refresh()
	return true


## Outfit palettes are exact source-ramp swaps; names must exist in the exported materials' variants.
func set_preset(preset_id: String) -> bool:
	var preset := _find(manifest["presets"], preset_id)
	if preset.is_empty():
		push_warning("PixelDoll: unknown outfit %s" % preset_id)
		return false
	var items: Dictionary = preset.get("items", {})
	for slot in manifest["slots"]:
		equipped[slot["id"]] = items.get(slot["id"], "") if items.get(slot["id"]) != null else ""
	equipped["body"] = manifest["rig"]["baseItem"]
	variants = preset.get("variants", {}).duplicate()
	_frame_cache.clear()
	_texture_cache.clear()
	_refresh()
	return true


func set_variant(material_id: String, variant_name: Variant = null) -> bool:
	if _find(manifest["materials"], material_id).is_empty():
		push_warning("PixelDoll: unknown material %s" % material_id)
		return false
	if variant_name != null and not variant_name is String:
		push_warning("PixelDoll: color selection must be a string or null")
		return false
	if variant_name == null:
		variants.erase(material_id)
	else:
		variants[material_id] = variant_name
	_frame_cache.clear()
	_texture_cache.clear()
	_refresh()
	return true


func _hand_side(slot_id: String) -> String:
	var slot := _find(manifest["slots"], slot_id)
	if slot.get("class", "") != "held":
		return ""
	if slot.get("anchor", "") == "hand_l":
		return "left"
	if slot.get("anchor", "") == "hand_r":
		return "right"
	return "left" if slot_id == "off_hand" else "right" if slot_id == "main_hand" else ""


func _hides_of(it: Dictionary) -> Array:
	var slot_id: String = it["slot"]
	var targets: Array = it.get("hides", _find(manifest["slots"], slot_id).get("hides", [])).duplicate()
	if _hand_side(slot_id).is_empty():
		return targets
	for target in targets.duplicate():
		if target != "main_hand" and target != "off_hand":
			continue
		var side := "left" if target == "off_hand" else "right"
		for slot in manifest["slots"]:
			if _hand_side(slot["id"]) == side and not targets.has(slot["id"]):
				targets.append(slot["id"])
	return targets


func _refresh() -> void:
	_refreshing = true
	var clock_frame := body.frame
	var clock_progress := body.frame_progress
	var clock_playing := body.is_playing()
	var clock_speed := body.get_playing_speed() / body.speed_scale if body.speed_scale != 0.0 else 1.0
	var hidden := {}
	var hides := {}
	for slot in equipped:
		var it := _find(manifest["items"], equipped[slot])
		if not it.is_empty():
			hides[slot] = _hides_of(it)
	var order: Array = manifest["slots"].map(func(s): return s["id"])
	for slot in hides:
		# Of two worn items that hide each other's slot (two two-handed items), the later slot stays visible.
		var yields := false
		for other in hides:
			if other != slot and hides[slot].has(other) and hides[other].has(slot) and order.find(other) > order.find(slot):
				yields = true
		if not yields:
			for h in hides[slot]:
				hidden[h] = true
	_hidden = hidden
	if _action_layered and is_action_playing():
		_action_layered = can_layer_action(_action["id"], _action_dir)
	for node in _layers():
		var layer := _layer_of(node)
		node.visible = not layer.is_empty() and not hidden.has(node.get_meta("slot"))
		if not layer.is_empty():
			var frames := _colored_frames(_find(manifest["items"], _shown(node.get_meta("slot"))), layer)
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
	for node in _action_nodes:
		node.hide()
	if is_action_playing():
		for node in _layers():
			node.hide()
		_render_action()
		return
	var frames: Array = _find(manifest["rig"]["animations"], anim)["frames"]
	var cell := int(frames[mini(body.frame, frames.size() - 1)]["cell"])
	var visible := []
	for node in _layers():
		var layer := _layer_of(node)
		node.visible = not layer.is_empty() and not _hidden.has(node.get_meta("slot"))
		if layer.is_empty():
			continue
		if node.visible:
			visible.append({"node": node, "z": _z(node.get_meta("slot"), layer, cell, anim, dir), "order": visible.size()})
		if node != body and node.visible:
			if node.animation != body.animation:
				node.animation = body.animation
			node.set_frame_and_progress(body.frame, body.frame_progress)
	# Tree order already follows manifest slots, bg before fg; preserve it when raw depths tie.
	visible.sort_custom(func(a, b): return a["z"] < b["z"] if a["z"] != b["z"] else a["order"] < b["order"])
	var start := mini(0, 4097 - visible.size())
	for i in visible.size():
		visible[i]["node"].z_index = start + i


func _variant_of(id: String, seen: Dictionary) -> String:
	var material := _find(manifest["materials"], id)
	if material.is_empty() or seen.has(id):
		return ""
	seen[id] = true
	if material.has("linkTo") and not material["linkTo"].is_empty():
		return _variant_of(material["linkTo"], seen)
	return variants.get(id, material.get("defaultVariant", ""))


func _colored_frames(item: Dictionary, layer: Dictionary, part := "") -> SpriteFrames:
	var key: String = "%s_%s" % [item["id"], layer["id"]]
	if not part.is_empty():
		key = part + ":" + key
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
func _z(slot: String, layer: Dictionary, cell: int, a: String, d: String) -> int:
	var z := int(layer["z"])
	var best := -1
	for o in _find(manifest["slots"], slot).get("zOverrides", []):
		if o["layer"] != layer["role"] or (o.has("dir") and o["dir"] != d) or (o.has("anim") and o["anim"] != a) or (o.has("cell") and int(o["cell"]) != cell):
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
	var shown := id
	var count := 0
	for variant in manifest["items"]:
		var required: Array = variant.get("underAll", [variant["under"]] if variant.has("under") else [])
		if variant.get("variantOf", "") == id and required.size() > count and required.all(func(cover): return equipped.values().has(cover)):
			shown = variant["id"]
			count = required.size()
	return shown


func _find(list: Array, id: String, key := "id") -> Dictionary:
	for x in list:
		if x[key] == id:
			return x
	return {}
`;

export function godotFiles(m: Manifest): OutFile[] {
	const files: OutFile[] = [];
	const layers: string[] = [];
	for (const it of m.items)
		for (const layer of it.layers) {
			const id = `${it.id}_${layer.id}`;
			layers.push(id);
			files.push({
				name: `godot/${boundedFileStem(id)}.tres`,
				data: spriteFramesTres(m, it.id, layer.id)
			});
			for (const part of ['lower', 'upper'] as const) {
				if (!layer.actionSheets?.[part]) continue;
				const key = `${part}:${id}`;
				layers.push(key);
				files.push({
					name: `godot/${boundedFileStem(key.replace(':', '@'))}.tres`,
					data: spriteFramesTres(m, it.id, layer.id, part)
				});
			}
		}
	// Native resource metadata retains all dependencies in selected-scene builds.
	files.push({
		name: 'godot/library.tres',
		data: `[gd_resource type="Resource" format=3]\n\n${layers.map((key, i) => `[ext_resource type="SpriteFrames" path=${q(boundedFileStem(key.replace(':', '@')) + '.tres')} id="f${i}"]`).join('\n')}\n\n[resource]\nmetadata/manifest = ${JSON.stringify(m)}\nmetadata/frames = {${layers.map((key, i) => `${q(key)}: ExtResource("f${i}")`).join(', ')}}\n`
	});
	files.push(
		{ name: 'godot/Paperdoll.tscn', data: paperdollTscn(m) },
		{ name: 'godot/paperdoll.gd', data: PAPERDOLL_GD }
	);
	files.push({
		name: 'godot/README.txt',
		data: `Copy the whole export folder into your Godot 4 project, then instance godot/Paperdoll.tscn.
API: play_anim(anim, dir, restart = false), equip(slot, item_id) ("" = empty slot), set_preset(preset_id), set_variant(material_id, variant_name).
Call set_action_layering(true) to enable moving attacks when the ZIP contains precut fragments. can_layer_action(move, direction) checks the whole action set and equipped gear. Invalid play_action calls warn and return an empty string without changing playback. play_action(move, direction) returns "layered" or "full", plays once and leaves the gait clock running. Call is_action_playing() to check completion. Calling play_anim cancels the action.

play_anim preserves active progress, starts changed moves/directions at the beginning and replays completed once-only clips. Pass true to restart explicitly.
These methods return true on success; invalid move/direction, equipment, outfit or material IDs return false and emit an engine warning before changing state.
set_variant changes one explicit selection; null removes it and restores the material default, while "" uses source colors. Linked materials follow their target's selection.
The frozen base body stays equipped. body_fg is the clock; other layers follow it. Palette swaps use exact source RGBs,
owner-local materials, linked selections and defaults; variant names must exist in exported materials[].variants.
library.tres retains the manifest and all equipment resources, including for selected-scene game exports.
Manifest depths become compact native z_index ranks, preserving slot order/bg-before-fg ties and per-cell overrides.
Use the root's z_index to position the character among scene objects. At most 8193 slot/role nodes are supported.
Project settings: Rendering > Textures > Default Texture Filter = Nearest (the scene sets Nearest on its root anyway),
2D > Snap 2D Transforms To Pixel = on. Keep the exported folder structure intact.
`
	});
	return files;
}

export function selfTest() {
	const m = {
		name: 'hero',
		rig: {
			cell: { w: 64, h: 64 },
			pivot: { x: 32, y: 60 },
			baseItem: 'base',
			directions: [{ id: 'south' }, { id: 'west', mirrorOf: 'east' }],
			animations: [
				{
					id: 'walk',
					cells: 2,
					loop: true,
					frames: [
						{ cell: 0, ms: 100 },
						{ cell: 1, ms: 200 },
						{ cell: 0, ms: 100 }
					]
				}
			]
		},
		slots: [
			{ id: 'body', z: 10 },
			{ id: 'back', z: 90, bgZ: 4 }
		],
		items: [
			{
				id: 'base',
				slot: 'body',
				layers: [
					{ id: 'main', role: 'fg', z: 10, sheets: { walk: 'layers/body/base/main/walk.png' } }
				]
			},
			{
				id: 'cape',
				slot: 'back',
				layers: [
					{ id: 'fg', role: 'fg', z: 90, sheets: { walk: 'a.png' } },
					{ id: 'bg', role: 'bg', z: 4, sheets: { walk: 'b.png' } }
				]
			}
		],
		presets: [{ id: 'd', items: { body: 'base', back: null } }]
	} as unknown as Manifest;
	const t = spriteFramesTres(m, 'base', 'main');
	console.assert(
		t.includes(`path="../layers/body/base/main/walk.png" id=${rid('walk')}`) &&
			t.includes('region = Rect2(64, 64, 64, 64)'),
		'tres: relative path, west row 1 col 1'
	);
	console.assert(
		t.includes('"speed": 10.0') &&
			t.includes('"duration": 2.0') &&
			(t.match(/"duration"/g) ?? []).length === 6,
		'tres: msBase speed, relative durations, playlist frames x dirs'
	);
	const s = paperdollTscn(m);
	console.assert(
		s.includes('[node name="body_fg" type="AnimatedSprite2D" parent="."]') &&
			s.includes('offset = Vector2(-32, -60)'),
		'tscn: body node + pivot offset'
	);
	console.assert(
		s.indexOf('"body_fg"') < s.indexOf('"back_bg"') &&
			s.indexOf('"back_bg"') < s.indexOf('"back_fg"') &&
			s.includes('visible = false\nz_index = 0'),
		'tscn: tree in compose tie-break order (slot, bg before fg), unequipped slot hidden and bounded rank'
	);
	// oversize layer: own region size and node offset
	Object.assign(m.items[1].layers[0], { cell: { w: 96, h: 96 }, pivot: { x: 48, y: 76 } });
	m.presets[0].items.back = 'cape';
	console.assert(
		spriteFramesTres(m, 'cape', 'fg').includes('region = Rect2(96, 96, 96, 96)'),
		'tres: oversize region'
	);
	console.assert(
		paperdollTscn(m).includes('offset = Vector2(-48, -76)') &&
			PAPERDOLL_GD.includes('node.offset = -Vector2(pv["x"], pv["y"])'),
		'tscn/gd: oversize offset'
	);
	// B15: 8 directions -> ids without '-', animation names keep the direction id
	m.rig.directions = [{ id: 'south-east' }];
	const t8 = spriteFramesTres(m, 'base', 'main');
	console.assert(
		t8.includes(`id=${rid('walk_south-east_0')}`) &&
			t8.includes(`SubResource(${rid('walk_south-east_1')})`) &&
			t8.includes('&"walk_south-east"') &&
			!/id="[^"]*-/.test(t8),
		'tres: resource ids letters/digits/_ only'
	);
}
