extends "res://verify.gd" # godot_shared.gd, copied into the project as verify.gd
# Negative control: copy B is shown in its default colors while the oracle expects crimson; recolor bleed of the
# other copy's material (matA) must not make it crimson either. Must report differing pixels.
func run() -> void:
	RenderingServer.set_default_clear_color(Color.BLACK)
	m = JSON.parse_string(FileAccess.get_file_as_string("res://manifest.json"))
	scenario = JSON.parse_string(FileAccess.get_file_as_string("res://scenario.json"))
	bw = int(m.export.bakedCell.w)
	bh = int(m.export.bakedCell.h)
	var d0 = doll_at(0)
	var d1 = doll_at(1)
	await process_frame
	d0.set_preset("current")
	d1.set_preset("copy_b_default")
	d1.set_variant(scenario.copies.matA, "azure")
	await compare([d0, d1], ["current", "copy_b"], "control")
	print("CONTROL_DIFF %d" % diff_px)
	quit(0 if diff_px > 0 else 1)
