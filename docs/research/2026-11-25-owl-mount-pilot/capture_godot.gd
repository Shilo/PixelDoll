extends SceneTree

const CAPTURE_SIZE := Vector2i(760, 660)
const SCALE := 3
const BACKGROUND := Color("#292630")
const SAMPLE := Vector2i(64, 53)

func _initialize() -> void:
    run.call_deferred()

func run() -> void:
    root.size = CAPTURE_SIZE
    root.content_scale_size = CAPTURE_SIZE
    root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
    root.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
    RenderingServer.set_default_clear_color(BACKGROUND)

    var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://track.json"))
    var east: Dictionary = data.track[3]
    panel(Vector2(0, 0), "East / Rider A", "a", "east", east.image, pair(east.seat))
    var boot_host := panel(Vector2(380, 0), "East / Rider A with boot", "a", "east", east.image, pair(east.seat))
    var boot_rider := boot_host.get_node("Rider")
    assert(boot_rider.equip("feet", "boot"))
    panel(Vector2(0, 288), "East / Rider B", "b", "east", east.image, pair(east.seat))
    var south := panel(Vector2(380, 288), "South / Rider B", "b", "south", "south-mount-back.png", Vector2(63, 52))
    var front := Sprite2D.new()
    front.texture = load("res://south-mount-front.png")
    front.centered = false
    front.z_index = 100
    south.add_child(front)

    var sample_screen := Vector2i(south.position) + SAMPLE * SCALE + Vector2i.ONE
    await RenderingServer.frame_post_draw
    var mounted := root.get_texture().get_image()
    assert(mounted.get_size() == CAPTURE_SIZE)
    assert(mounted.get_pixelv(sample_screen).is_equal_approx(front.texture.get_image().get_pixelv(SAMPLE)))
    front.hide()
    await RenderingServer.frame_post_draw
    var without_front := root.get_texture().get_image()
    assert(not without_front.get_pixelv(sample_screen).is_equal_approx(mounted.get_pixelv(sample_screen)))
    var output := ProjectSettings.globalize_path("res://godot-export-mount.png")
    assert(mounted.save_png(output) == OK)
    print("GODOT_MOUNT_CAPTURE_PASS ", output)
    quit()

func panel(at: Vector2, caption: String, letter: String, facing: String, mount_image: String, seat: Vector2) -> Node2D:
    var label := Label.new()
    label.text = caption
    label.position = at + Vector2(24, 14)
    label.add_theme_font_size_override("font_size", 20)
    root.add_child(label)

    var actor := Node2D.new()
    actor.position = at + Vector2(-2, -67 if at.y == 0 else 12)
    actor.scale = Vector2.ONE * SCALE
    root.add_child(actor)

    var mount := Sprite2D.new()
    mount.texture = load("res://" + mount_image)
    mount.centered = false
    actor.add_child(mount)

    var scene := load("res://rider-" + letter + "/godot/Paperdoll.tscn") as PackedScene
    var rider := scene.instantiate() as Node2D
    rider.name = "Rider"
    actor.add_child(rider)
    assert(rider.play_anim("riding", facing))
    var rig: Dictionary = rider.manifest.rig
    var pivot := Vector2(rig.pivot.x, rig.pivot.y)
    var contact := pair(rig.anchors.hip.riding[facing][0]) + Vector2(0.5, 0.5)
    rider.position = (seat - (contact - pivot)).round()
    return actor

func pair(value: Array) -> Vector2:
    return Vector2(value[0], value[1])
