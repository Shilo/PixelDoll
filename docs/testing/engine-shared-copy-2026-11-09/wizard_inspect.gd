extends SceneTree
# Headless: inspects Aseprite Wizard SpriteFrames imports of PixelDoll .aseprite exports against PixelDoll's compositor.
var m: Dictionary
var fails := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		fails += 1
		printerr("FAIL: " + message)

func want(preset: String, anim: String, cell: int) -> Image:
	var img := Image.load_from_file(ProjectSettings.globalize_path("res://expected/%s/%s_%d.png" % [preset, anim, cell]))
	img.convert(Image.FORMAT_RGBA8)
	return img

func frame_image(sf: SpriteFrames, name: String, i: int) -> Image:
	var img := sf.get_frame_texture(name, i).get_image()
	img.convert(Image.FORMAT_RGBA8)
	return img

func diff(a: Image, b: Image) -> int:
	if a.get_size() != b.get_size():
		return a.get_width() * a.get_height()
	var n := 0
	for y in a.get_height():
		for x in a.get_width():
			var p := a.get_pixel(x, y)
			var q := b.get_pixel(x, y)
			if p.a != q.a or (p.a > 0 and not p.is_equal_approx(q)):
				n += 1
	return n

func timing(sf: SpriteFrames, name: String) -> String:
	var parts := []
	for i in sf.get_frame_count(name):
		parts.append("%.1f" % (1000.0 * sf.get_frame_duration(name, i) / sf.get_animation_speed(name)))
	return ",".join(parts)

func merged(label: String, path: String, preset: String) -> void:
	var sf: SpriteFrames = load(path)
	print("%s animations %s" % [label, sf.get_animation_names()])
	var total := 0
	for a in m.rig.animations:
		var name: String = a.id + "_south"
		check(sf.has_animation(name), "%s has %s" % [label, name])
		if not sf.has_animation(name):
			continue
		var ms := []
		for f in a.frames:
			ms.append("%.1f" % float(f.ms))
		var t := timing(sf, name)
		print("%s %s loop=%s fps=%s frames=%d ms=[%s] want=[%s]" % [label, name, sf.get_animation_loop(name), sf.get_animation_speed(name), sf.get_frame_count(name), t, ",".join(ms)])
		var d := 0
		for i in a.frames.size():
			d += diff(frame_image(sf, name, i), want(preset, a.id, int(a.frames[i].cell)))
		print("%s %s vs %s: %d differing px" % [label, name, preset, d])
		total += d
	print("%s TOTAL %d" % [label, total])

func run() -> void:
	m = JSON.parse_string(FileAccess.get_file_as_string("res://manifest.json"))
	var sc: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://scenario.json"))
	merged("shared(all layers, first outfit=current)", "res://char/shared.aseprite", "current")
	merged("b_all(all layers, first outfit=copy_b_default)", "res://char/b_all.aseprite", "copy_b_default")
	merged("b_visible(only visible, unrounded fps)", "res://char/b_visible.aseprite", "copy_b_default")
	# Split by layer: one SpriteFrames per item layer; stack body + copy B and compare with copy_b_default.
	var body: SpriteFrames = load("res://char/split_body.base.ase_layer")
	var head: SpriteFrames = load("res://char/split_head.%s.ase_layer" % sc.copies.B)
	var total := 0
	for a in m.rig.animations:
		var name: String = a.id + "_south"
		for i in a.frames.size():
			var img := frame_image(body, name, i)
			var h := frame_image(head, name, i)
			check(img.get_size() == h.get_size(), "split layers share one canvas")
			img.blend_rect(h, Rect2i(Vector2i.ZERO, h.get_size()), Vector2i.ZERO)
			total += diff(img, want("copy_b_default", a.id, int(a.frames[i].cell)))
		print("split %s loop=%s ms=[%s]" % [name, head.get_animation_loop(name), timing(head, name)])
	print("split body+copyB vs copy_b_default: %d differing px" % total)
	print("WIZARD_INSPECT_DONE fails=%d" % fails)
	quit(0)

func _initialize() -> void:
	run.call_deferred()
