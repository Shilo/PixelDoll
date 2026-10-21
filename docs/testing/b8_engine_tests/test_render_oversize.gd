extends SceneTree
# B8 windowed render test (needs a GPU). Usage: godot --resolution <dirs*bakedW>x<bakedH> -s test_render_oversize.gd -- <export dir>
# For every preset and every animation: one doll per direction, each placed so its pivot sits at the baked pivot of its
# baked cell (manifest export.bakedCell / bakedPivot = union of all layers, 96x96 here); freezes each playlist frame and
# compares every pixel with PixelDoll's own composite baked/<preset>/<anim>.png (over the black clear colour).
var diff_px := 0
var total_px := 0

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	RenderingServer.set_default_clear_color(Color.BLACK)
	var ex: String = OS.get_cmdline_user_args()[0]
	var dir_root: String = "res://pixeldoll/" + ex + "/"
	var m: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(dir_root + "manifest.json"))
	var bw := int(m.export.bakedCell.w)
	var bh := int(m.export.bakedCell.h)
	var dirs: Array = m.rig.directions.map(func(d): return d.id)
	var dolls := []
	for i in dirs.size():
		var doll = load(dir_root + "godot/Paperdoll.tscn").instantiate()
		doll.position = Vector2(i * bw + int(m.export.bakedPivot.x), int(m.export.bakedPivot.y))
		root.add_child(doll)
		dolls.append(doll)
	await process_frame
	for preset in m.presets:
		for doll in dolls:
			# B9: a preset that omits a slot means "nothing there" (the Studio's default preset is {body} only)
			for slot in m.slots.map(func(x): return x.id):
				if slot != "body": doll.equip(slot, preset.items[slot] if preset.items.get(slot) != null else "")
		for a in m.rig.animations:
			for i in dirs.size():
				dolls[i].play_anim(a.id, dirs[i])
				dolls[i].body.pause()
			var baked := Image.load_from_file(ProjectSettings.globalize_path(dir_root + "baked/%s/%s.png" % [preset.id, a.id]))
			var sheet := Image.create(a.frames.size() * bw, dirs.size() * bh, false, Image.FORMAT_RGBA8)
			var before := diff_px
			for f in a.frames.size():
				var cell := int(a.frames[f].cell)
				for doll in dolls:
					doll.body.frame = f
				await RenderingServer.frame_post_draw
				await RenderingServer.frame_post_draw
				var shot := root.get_texture().get_image()
				shot.convert(Image.FORMAT_RGBA8)
				for i in dirs.size():
					for y in bh:
						for x in bw:
							var b := baked.get_pixel(cell * bw + x, i * bh + y)
							var want := Color(b.r, b.g, b.b, 1) if b.a > 0.5 else Color.BLACK
							total_px += 1
							if not shot.get_pixel(i * bw + x, y).is_equal_approx(want):
								diff_px += 1
					sheet.blit_rect(shot, Rect2i(i * bw, 0, bw, bh), Vector2i(f * bw, i * bh))
			print("%s/%s: %d differing px" % [preset.id, a.id, diff_px - before])
			sheet.resize(sheet.get_width() * 2, sheet.get_height() * 2, Image.INTERPOLATE_NEAREST)
			sheet.save_png(ProjectSettings.globalize_path("res://render_%s_%s_%s.png" % [ex, preset.id, a.id]))
	print("render vs PixelDoll compose: %d differing px of %d" % [diff_px, total_px])
	print("RESULT: ", "PASS" if diff_px == 0 else "FAIL")
	quit(1 if diff_px else 0)
