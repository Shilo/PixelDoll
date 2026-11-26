extends SceneTree

func _initialize() -> void:
	call_deferred("_verify")

func _verify() -> void:
	var pixel := OS.get_cmdline_user_args()
	var image := Image.new()
	var source := FileAccess.get_file_as_bytes("res://assets/pixeldoll/adventurer/layers/body/base/main/walk.png")
	if pixel.size() != 3 or image.load_png_from_buffer(source) != OK:
		push_error("Godot could not read the revised walk sheet or expected pixel")
		quit(1)
		return
	if image.get_pixel(int(pixel[0]), int(pixel[1])).r8 != int(pixel[2]):
		push_error("Godot read the wrong pixel from the revised walk sheet")
		quit(1)
		return
	var scene = load("res://assets/pixeldoll/adventurer/godot/Paperdoll.tscn") as PackedScene
	if scene == null:
		push_error("Godot could not load the published scene at its project path")
		quit(1)
		return
	var doll = scene.instantiate()
	root.add_child(doll)
	if not doll.has_method("play_anim") or not doll.play_anim("walk", "south"):
		push_error("Godot could not play the published walk animation")
		quit(1)
		return
	var textures := 0
	for node in doll.get_children():
		if node is AnimatedSprite2D and node.sprite_frames != null:
			var frames: SpriteFrames = node.sprite_frames
			for animation in frames.get_animation_names():
				if frames.get_frame_count(animation) > 0 and frames.get_frame_texture(animation, 0) != null:
					textures += 1
					break
	if textures == 0:
		push_error("Godot loaded the scene without sprite textures")
		quit(1)
		return
	print("PixelDoll publish verified in Godot, animated layers with textures: ", textures)
	quit()
