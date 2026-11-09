extends SceneTree
# Windowed (GPU) render + runtime checks of a PixelDoll shared-copy export.
# godot --path <project> --rendering-driver d3d12 --resolution 192x96 --script verify.gd
# Two dolls side by side; every playlist frame of every move is compared with PixelDoll's own composite (expected/).
# Transparent pixels must show CLEAR, a color absent from the oracle, so opaque black and transparent stay distinct.
const CLEAR := Color(1, 0, 1)
var fails := 0
var diff_px := 0
var total_px := 0
var bw := 0
var bh := 0
var m: Dictionary
var scenario: Dictionary

func check(ok: bool, message: String) -> void:
	if not ok:
		fails += 1
		printerr("FAIL: " + message)

func _initialize() -> void:
	run.call_deferred()

func doll_at(i: int) -> Node:
	var doll = load("res://godot/Paperdoll.tscn").instantiate()
	doll.position = Vector2(i * bw + int(m.export.bakedPivot.x), int(m.export.bakedPivot.y))
	root.add_child(doll)
	return doll

# Renders every frame of every move for the two dolls (already dressed) and compares with expected/<preset>/.
func compare(dolls: Array, presets: Array, label: String) -> void:
	for a in m.rig.animations:
		for doll in dolls:
			doll.play_anim(a.id, "south")
			doll.body.pause()
		var before := diff_px
		for f in a.frames.size():
			var cell := int(a.frames[f].cell)
			for doll in dolls:
				doll.body.frame = f
			await RenderingServer.frame_post_draw
			await RenderingServer.frame_post_draw
			var shot := root.get_texture().get_image()
			shot.convert(Image.FORMAT_RGBA8)
			for i in dolls.size():
				var want_img := Image.load_from_file(ProjectSettings.globalize_path("res://expected/%s/%s_%d.png" % [presets[i], a.id, cell]))
				want_img.convert(Image.FORMAT_RGBA8)
				for y in bh:
					for x in bw:
						var b := want_img.get_pixel(x, y)
						var want := Color(b.r, b.g, b.b, 1) if b.a > 0.5 else CLEAR
						total_px += 1
						if not shot.get_pixel(i * bw + x, y).is_equal_approx(want):
							diff_px += 1
		var d := diff_px - before
		print("%s %s: %d differing px" % [label, a.id, d])
		check(d == 0, "%s %s render differs from the PixelDoll compositor" % [label, a.id])

func run() -> void:
	RenderingServer.set_default_clear_color(CLEAR)
	m = JSON.parse_string(FileAccess.get_file_as_string("res://manifest.json"))
	scenario = JSON.parse_string(FileAccess.get_file_as_string("res://scenario.json"))
	bw = int(m.export.bakedCell.w)
	bh = int(m.export.bakedCell.h)
	var A: String = scenario.copies.A
	var B: String = scenario.copies.B
	var matA: String = scenario.copies.matA
	var matB: String = scenario.copies.matB
	var d0 = doll_at(0)
	var d1 = doll_at(1)
	await process_frame
	# Later move: Cast plays once (global export setting), idle/walk loop.
	check(not d0.body.sprite_frames.get_animation_loop("cast_south"), "cast must play once")
	check(d0.body.sprite_frames.get_animation_loop("idle_south"), "idle must loop")
	# Two copies of the same design, same source RGBs, different colorways, rendered at once.
	d0.set_preset("current")
	d1.set_preset("copy_b")
	await compare([d0, d1], ["current", "copy_b"], "copyA-azure|copyB-crimson")
	d0.set_preset("copy_b_default")
	d1.set_preset("copy_a_raw")
	await compare([d0, d1], ["copy_b_default", "copy_a_raw"], "copyB-default|copyA-source")
	# Recoloring one copy must not affect the other copy (identical source RGBs, owner-local materials).
	d0.set_preset("copy_b")
	d0.set_variant(matA, "azure")
	d1.set_preset("copy_a_raw")
	d1.set_variant(matB, "crimson")
	await compare([d0, d1], ["copy_b", "copy_a_raw"], "cross-copy-recolor")
	# Swapping copies in one doll keeps each copy's own selection.
	d0.set_preset("current")
	d0.equip("head", B)
	d0.equip("off_hand", "")
	d0.set_variant(matA, "azure")
	d1.set_preset("copy_b_default")
	await compare([d0, d1], ["copy_b_default", "copy_b_default"], "equip-swap")
	check(d0.equipped.head == B, "copy B equips in the head slot")
	# Sparse coverage: copy B has no Cast cells, so its node is empty there (not filled from other moves).
	d1.play_anim("cast", "south")
	for f in d1.body.sprite_frames.get_frame_count("cast_south"):
		d1.body.frame = f
		var node: AnimatedSprite2D = d1.get_node("head_fg")
		var tex := node.sprite_frames.get_frame_texture(node.animation, node.frame)
		var img := tex.get_image()
		check(img.is_invisible(), "copy B cast frame %d must stay transparent" % f)
	# Play-once Cast holds its last frame; layers stay synchronized over real ticks.
	d0.set_preset("current")
	d0.play_anim("cast", "south")
	for i in 120:
		await process_frame
		for n in d0.get_children():
			if n is AnimatedSprite2D and n.visible and n != d0.body:
				check(n.frame == d0.body.frame and n.animation == d0.body.animation, "layer sync")
	check(not d0.body.is_playing() and d0.body.frame == d0.body.sprite_frames.get_frame_count("cast_south") - 1, "cast holds its last frame")
	d0.play_anim("walk", "south")
	for i in 120:
		await process_frame
		for n in d0.get_children():
			if n is AnimatedSprite2D and n.visible and n != d0.body:
				check(n.frame == d0.body.frame, "walk layer sync")
	check(d0.body.is_playing(), "walk loops")
	print("render vs PixelDoll compose: %d differing px of %d" % [diff_px, total_px])
	print("GODOT_SHARED_PASS" if fails == 0 else "GODOT_SHARED_FAIL: %d" % fails)
	quit(0 if fails == 0 else 1)
