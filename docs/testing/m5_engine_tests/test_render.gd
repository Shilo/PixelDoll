extends SceneTree
# Windowed (needs a GPU): renders the exported Paperdoll.tscn for every walk frame in south/east/west and compares each
# 64x64 cell pixel-exactly with PixelDoll's own composite baked/knight/walk.png (over the black clear colour).
# Saves the captured frames as a 3x contact sheet.
const ROOT := "res://pixeldoll/s1_knight/"
var fails := 0

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	RenderingServer.set_default_clear_color(Color.BLACK)
	var dirs := ["south", "east", "west"]
	var dolls := []
	for i in 3:
		var doll = load(ROOT + "godot/Paperdoll.tscn").instantiate()
		doll.position = Vector2(i * 64 + 32, 63) # pivot (32, 63) -> cell origin at (i*64, 0)
		root.add_child(doll)
		dolls.append(doll)
	await process_frame
	for i in 3:
		dolls[i].play_anim("walk", dirs[i])
		dolls[i].body.pause()
	var baked := Image.load_from_file(ProjectSettings.globalize_path(ROOT + "baked/knight/walk.png"))
	var sheet := Image.create(8 * 64, 3 * 64, false, Image.FORMAT_RGBA8)
	var diff_px := 0
	for f in 8:
		for i in 3:
			dolls[i].body.frame = f
		await RenderingServer.frame_post_draw
		await RenderingServer.frame_post_draw
		var shot := root.get_texture().get_image()
		shot.convert(Image.FORMAT_RGBA8)
		for i in 3:
			for y in 64:
				for x in 64:
					var b := baked.get_pixel(f * 64 + x, i * 64 + y)
					var want := Color(b.r, b.g, b.b, 1) if b.a > 0.5 else Color.BLACK
					var got := shot.get_pixel(i * 64 + x, y)
					if not got.is_equal_approx(want):
						diff_px += 1
			sheet.blit_rect(shot, Rect2i(i * 64, 0, 64, 64), Vector2i(f * 64, i * 64))
	print("render vs PixelDoll compose: %d differing px of %d" % [diff_px, 8 * 3 * 64 * 64])
	sheet.resize(sheet.get_width() * 3, sheet.get_height() * 3, Image.INTERPOLATE_NEAREST)
	sheet.save_png(ProjectSettings.globalize_path("res://render_walk.png"))
	print("RESULT: ", "PASS" if diff_px == 0 else "FAIL")
	quit(1 if diff_px else 0)
