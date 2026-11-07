extends Node2D

# Native Godot render/readback experiment. It does not test asset import compression or generated exports.
var results: Dictionary = {}

func source_image() -> Image:
	var image := Image.create(8, 8, false, Image.FORMAT_RGBA8)
	image.fill(Color(0, 0, 0, 0))
	var colors := [Color8(255, 0, 0, 255), Color8(255, 0, 0, 128), Color8(0, 255, 0, 64), Color8(0, 255, 255, 255), Color8(0, 0, 0, 255), Color8(64, 64, 64, 255), Color8(128, 128, 128, 255), Color8(192, 192, 192, 255)]
	for x in range(8):
		image.set_pixel(x, 1, colors[x])
	for y in range(3, 7):
		image.set_pixel(2, y, Color8(220, 40, 120, 255))
		image.set_pixel(5, y, Color8(30, 170, 240, 255))
	image.set_pixel(3, 6, Color8(220, 40, 120, 255))
	image.set_pixel(4, 6, Color8(30, 170, 240, 255))
	return image

func make_view(image: Image, filtering: CanvasItem.TextureFilter, phase: float) -> SubViewport:
	var viewport := SubViewport.new()
	viewport.size = Vector2i(12, 12)
	viewport.disable_3d = true
	viewport.transparent_bg = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(viewport)
	var sprite := Sprite2D.new()
	sprite.texture = ImageTexture.create_from_image(image)
	sprite.centered = false
	sprite.texture_filter = filtering
	sprite.position = Vector2(2 + phase, 2 + phase)
	viewport.add_child(sprite)
	return viewport

func measure(image: Image, source: Image) -> Dictionary:
	var opaque_mismatch := 0
	var alpha_mismatch := 0
	var straight_rgb_mismatch := 0
	var premultiplied_rgb_mismatch := 0
	var transparent_leak := 0
	var max_rgb_error := 0
	var samples: Array = []
	for y in range(12):
		for x in range(12):
			var expected := source.get_pixel(x - 2, y - 2) if x >= 2 and x < 10 and y >= 2 and y < 10 else Color(0, 0, 0, 0)
			var actual := image.get_pixel(x, y)
			if expected.a8 != actual.a8:
				alpha_mismatch += 1
			if expected.a8 == 0 and actual.a8 != 0:
				transparent_leak += 1
			var straight_bad := false
			var premultiplied_bad := false
			for channel in range(3):
				var observed := int(round(actual[channel] * 255.0))
				var straight := int(round(expected[channel] * 255.0))
				var premultiplied := int(round(expected[channel] * expected.a * 255.0))
				if expected.a8 > 0:
					straight_bad = straight_bad or observed != straight
					premultiplied_bad = premultiplied_bad or observed != premultiplied
					max_rgb_error = maxi(max_rgb_error, absi(observed - premultiplied))
			if straight_bad:
				straight_rgb_mismatch += 1
			if premultiplied_bad:
				premultiplied_rgb_mismatch += 1
			if expected.a8 == 255 and straight_bad:
				opaque_mismatch += 1
	for x in range(8):
		var pixel := image.get_pixel(x + 2, 3)
		samples.append([pixel.r8, pixel.g8, pixel.b8, pixel.a8])
	return {"opaque_rgb_mismatch": opaque_mismatch, "alpha_mismatch": alpha_mismatch,
		"straight_rgb_mismatch": straight_rgb_mismatch, "premultiplied_rgb_mismatch": premultiplied_rgb_mismatch,
		"transparent_leak_pixels": transparent_leak, "max_premultiplied_rgb_error": max_rgb_error,
		"readback_color_samples": samples}

func _ready() -> void:
	var source := source_image()
	var nearest := make_view(source, CanvasItem.TEXTURE_FILTER_NEAREST, 0)
	var nearest_shifted := make_view(source, CanvasItem.TEXTURE_FILTER_NEAREST, 0.5)
	var linear := make_view(source, CanvasItem.TEXTURE_FILTER_LINEAR, 0)
	var shifted := make_view(source, CanvasItem.TEXTURE_FILTER_LINEAR, 0.5)
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	results = {"godot_version": Engine.get_version_info(), "renderer": RenderingServer.get_current_rendering_method(),
		"nearest_integer": measure(nearest.get_texture().get_image(), source),
		"nearest_half_pixel": measure(nearest_shifted.get_texture().get_image(), source),
		"linear_integer": measure(linear.get_texture().get_image(), source),
		"linear_half_pixel": measure(shifted.get_texture().get_image(), source),
		"limits": "ImageTexture and Sprite2D/SubViewport readback only; no imported texture, mipmap/compression, atlas, generated export, browser or other engine was tested."}
