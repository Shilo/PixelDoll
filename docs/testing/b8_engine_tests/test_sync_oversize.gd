extends SceneTree
# B8 headless sync test for oversize layers. Usage: godot --headless --fixed-fps 60 -s test_sync_oversize.gd -- <export dir under res://>
# Plays every anim x dir; every tick each visible layer must show the body's animation + frame, its AtlasTexture region must be
# that LAYER's cell (96x96 for the sword, 64x64 for the body) and its offset must be -layer.pivot, so all pivots meet at the
# node origin. Also checks every equipped layer's z (layer z + the slot's zOverrides, resolved like lib/compose resolveZ) and
# unequip/re-equip of each oversize item. B9: z and items come from the manifest, so any export runs (s5_sword, B9 Ranger).
var fails := 0

func check(cond: bool, msg: String) -> void:
	if not cond:
		fails += 1
		if fails < 30: printerr("FAIL: ", msg)

# lib/compose resolveZ: most specific matching zOverride (cell > anim > dir > none; later wins on ties), else layer.z
func want_z(slot: Dictionary, layer: Dictionary, a: String, d: String, cell: int) -> int:
	var z := int(layer.z)
	var best := -1
	for o in slot.get("zOverrides", []):
		if o.layer != layer.role or (o.has("dir") and o.dir != d) or (o.has("anim") and o.anim != a) or (o.has("cell") and int(o.cell) != cell): continue
		var rank := 3 if o.has("cell") else (2 if o.has("anim") else (1 if o.has("dir") else 0))
		if rank >= best:
			best = rank
			z = int(o.z)
	return z

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var dir_root: String = "res://pixeldoll/" + OS.get_cmdline_user_args()[0] + "/"
	var m: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(dir_root + "manifest.json"))
	var doll = load(dir_root + "godot/Paperdoll.tscn").instantiate()
	root.add_child(doll)
	await process_frame
	var body: AnimatedSprite2D = doll.body
	var layers: Array = doll._layers()
	print("layers: ", layers.map(func(n): return "%s z%d offset %s %s" % [n.name, n.z_index, n.offset, "visible" if n.visible else "hidden"]))
	var dirs: Array = m.rig.directions.map(func(d): return d.id)
	var ticks := 0
	var oversize := 0
	for a in m.rig.animations:
		for d in dirs:
			doll.play_anim(a.id, d)
			var seen := {}
			for t in 90:
				await process_frame
				ticks += 1
				seen[body.frame] = true
				var cell := int(a.frames[body.frame].cell)
				for n in layers:
					if not n.visible: continue
					var layer: Dictionary = doll._layer_of(n)
					var w := int(layer.cell.w)
					var h := int(layer.cell.h)
					if w != int(m.rig.cell.w): oversize += 1
					check(n.offset == -Vector2(layer.pivot.x, layer.pivot.y) and not n.centered, "%s offset %s" % [n.name, n.offset])
					check(n.animation == body.animation, "%s anim %s != %s" % [n.name, n.animation, body.animation])
					check(n.frame == body.frame, "%s frame %d != body %d (%s)" % [n.name, n.frame, body.frame, body.animation])
					var reg: Rect2 = n.sprite_frames.get_frame_texture(n.animation, n.frame).region
					var want := Rect2(cell * w, dirs.find(d) * h, w, h)
					check(reg == want, "%s region %s != %s" % [n.name, reg, want])
				for n in layers:
					if not n.visible or n.name.begins_with("body"): continue
					var slot_id: String = n.name.rsplit("_", true, 1)[0]
					var slot: Dictionary = m.slots.filter(func(s): return s.id == slot_id)[0]
					var want := want_z(slot, doll._layer_of(n), a.id, d, cell)
					check(n.z_index == want, "%s z %d != %d at %s/%s/%d" % [n.name, n.z_index, want, a.id, d, cell])
			check(seen.size() == int(a.cells), "%s_%s: body visited %d/%d frames" % [a.id, d, seen.size(), a.cells])
	for it in m.items.filter(func(i): return i.layers[0].cell.w != m.rig.cell.w):
		var nodes: Array = it.layers.map(func(l): return doll.get_node("%s_%s" % [it.slot, l.role]))
		doll.equip(it.slot, "")
		check(nodes.all(func(n): return not n.visible), "unequip %s hides every layer" % it.id)
		doll.equip(it.slot, it.id)
		var p := Vector2(it.layers[0].pivot.x, it.layers[0].pivot.y)
		check(nodes.all(func(n): return n.visible and n.frame == body.frame and n.offset == -p), "re-equip %s syncs frame + oversize offset %s" % [it.id, -p])
	print("ticks checked: ", ticks, ", oversize layer-ticks: ", oversize, ", failures: ", fails)
	print("RESULT: ", "PASS" if fails == 0 else "FAIL")
	quit(1 if fails else 0)
