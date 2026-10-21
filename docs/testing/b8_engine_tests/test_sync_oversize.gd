extends SceneTree
# B8 headless sync test for oversize layers. Usage: godot --headless --fixed-fps 60 -s test_sync_oversize.gd -- <export dir under res://>
# Plays every anim x dir; every tick each visible layer must show the body's animation + frame, its AtlasTexture region must be
# that LAYER's cell (96x96 for the sword, 64x64 for the body) and its offset must be -layer.pivot, so all pivots meet at the
# node origin. Also checks the fixture's z overrides (bg z1 on north; fg z45 on walk/south/4) and unequip/re-equip.
var fails := 0

func check(cond: bool, msg: String) -> void:
	if not cond:
		fails += 1
		if fails < 30: printerr("FAIL: ", msg)

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
				var fg: AnimatedSprite2D = doll.get_node("main_hand_fg")
				var bg: AnimatedSprite2D = doll.get_node("main_hand_bg")
				check(fg.z_index == (45 if (a.id == "walk" and d == "south" and cell == 4) else 150), "main_hand_fg z %d at %s/%s/%d" % [fg.z_index, a.id, d, cell])
				check(bg.z_index == (1 if d == "north" else 6), "main_hand_bg z %d at %s/%s" % [bg.z_index, a.id, d])
			check(seen.size() == int(a.cells), "%s_%s: body visited %d/%d frames" % [a.id, d, seen.size(), a.cells])
	doll.equip("main_hand", "")
	check(not doll.get_node("main_hand_fg").visible and not doll.get_node("main_hand_bg").visible, "unequip sword hides fg+bg")
	doll.equip("main_hand", "sword_fsw")
	var fg2: AnimatedSprite2D = doll.get_node("main_hand_fg")
	check(fg2.visible and fg2.frame == body.frame and fg2.offset == Vector2(-48, -80), "re-equip syncs frame + oversize offset")
	print("ticks checked: ", ticks, ", oversize layer-ticks: ", oversize, ", failures: ", fails)
	print("RESULT: ", "PASS" if fails == 0 else "FAIL")
	quit(1 if fails else 0)
