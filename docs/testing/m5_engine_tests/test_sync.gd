extends SceneTree
# Headless: instance the exported Paperdoll.tscn, play every anim/dir, assert all layers share the body's animation,
# frame every tick (layers are not playing, so progress is irrelevant), regions match the manifest grid, pivot offset, per-cell z override, equip/hides.
const SCENE := "res://pixeldoll/s1_knight/godot/Paperdoll.tscn"
var fails := 0

func check(cond: bool, msg: String) -> void:
	if not cond:
		fails += 1
		if fails < 30: printerr("FAIL: ", msg)

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var m: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://pixeldoll/s1_knight/manifest.json"))
	var doll = load(SCENE).instantiate()
	root.add_child(doll)
	await process_frame
	var body: AnimatedSprite2D = doll.body
	var layers: Array = doll._layers()
	print("layers: ", layers.map(func(n): return "%s z%d %s" % [n.name, n.z_index, "visible" if n.visible else "hidden"]))
	var dirs: Array = m.rig.directions.map(func(d): return d.id)
	var ticks := 0
	for a in m.rig.animations:
		for d in dirs:
			doll.play_anim(a.id, d)
			var seen := {}
			for t in 90:
				await process_frame
				ticks += 1
				seen[body.frame] = true
				var cell := int(a.frames[body.frame].cell)
				var want := Rect2(cell * 64, dirs.find(d) * 64, 64, 64)
				for n in layers:
					check(n.offset == Vector2(-32, -63) and not n.centered, "%s pivot offset" % n.name)
					if not n.visible: continue
					check(n.animation == body.animation, "%s anim %s != %s" % [n.name, n.animation, body.animation])
					check(n.frame == body.frame, "%s frame %d != body %d (%s)" % [n.name, n.frame, body.frame, body.animation])
					var reg: Rect2 = n.sprite_frames.get_frame_texture(n.animation, n.frame).region
					check(reg == want, "%s region %s != %s" % [n.name, reg, want])
				var hand: AnimatedSprite2D = doll.get_node("main_hand_fg")
				var zwant := 45 if (a.id == "walk" and d == "south" and cell == 4) else 150
				check(hand.z_index == zwant, "main_hand_fg z %d != %d at %s/%s/%d" % [hand.z_index, zwant, a.id, d, cell])
			check(seen.size() == int(a.cells), "%s_%s: body visited %d/%d frames" % [a.id, d, seen.size(), a.cells])
	doll.equip("head", "")
	check(not doll.get_node("head_fg").visible, "unequip head hides head_fg")
	doll.equip("head", "helmet_iron")
	check(doll.get_node("head_fg").visible and doll.get_node("head_fg").frame == body.frame, "re-equip head syncs")
	doll.equip("main_hand", "")
	check(not doll.get_node("main_hand_fg").visible and not doll.get_node("main_hand_bg").visible, "unequip sword hides fg+bg")
	print("ticks checked: ", ticks, ", failures: ", fails)
	print("RESULT: ", "PASS" if fails == 0 else "FAIL")
	quit(1 if fails else 0)
