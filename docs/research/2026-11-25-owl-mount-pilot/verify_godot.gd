extends SceneTree

func _initialize() -> void:
    run.call_deferred()

func run() -> void:
    var host := Node2D.new()
    var mount := Sprite2D.new()
    var doll_a := (load("res://rider-a/godot/Paperdoll.tscn") as PackedScene).instantiate() as Node2D
    var doll_b := (load("res://rider-b/godot/Paperdoll.tscn") as PackedScene).instantiate() as Node2D
    root.add_child(host)
    host.position = Vector2(90, 120)
    host.add_child(mount)
    host.add_child(doll_a)
    host.add_child(doll_b)
    doll_b.visible = false
    mount.centered = false
    var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://track.json"))
    var ground := pair(data.mountGround)
    mount.position = -ground
    for doll in [doll_a, doll_b]:
        assert(doll.play_anim("riding", "east"))
        assert(doll.body.sprite_frames.get_frame_count("riding_east") == 1)
    var boot: AnimatedSprite2D
    for child in doll_a.get_children():
        if child.get_meta("slot", "") == "feet":
            boot = child
            break
    assert(boot != null and not boot.visible)
    for index in range(data.track.size()):
        var frame: Dictionary = data.track[index]
        var seat := pair(frame.seat) - ground
        mount.texture = load("res://" + frame.image)
        assert(mount.texture != null and mount.texture.get_size() == Vector2(128, 128))
        align_doll(doll_a, seat)
        align_doll(doll_b, seat)
        assert(host.position == Vector2(90, 120))
        assert(doll_a.equip("feet", "boot"))
        assert(boot.visible and boot.animation == &"riding_east")
        assert(doll_a.equip("feet", ""))
        assert(not boot.visible)
        doll_a.visible = index % 2 == 0
        doll_b.visible = not doll_a.visible
        assert(doll_a.visible != doll_b.visible)
    print("GODOT_EXTERNAL_MOUNT_PASS 8 phases, two exported riders, boot toggle")
    quit()

func align_doll(doll: Node2D, seat: Vector2) -> void:
    var rig: Dictionary = doll.manifest.rig
    var pivot := Vector2(rig.pivot.x, rig.pivot.y)
    var contact := pair(rig.anchors.hip.riding.east[0]) + Vector2(0.5, 0.5)
    doll.position = (seat - (contact - pivot)).round()
    assert((doll.position + contact - pivot).distance_to(seat) <= 0.71)

func pair(value: Array) -> Vector2:
    return Vector2(value[0], value[1])
