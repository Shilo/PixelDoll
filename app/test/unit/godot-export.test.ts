import { expect, test } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { exportFiles } from '../../src/lib/export/export.ts';
import { godotFiles, spriteFramesTres } from '../../src/lib/export/godot.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import type { Item, Project } from '../../src/lib/store/manifest.ts';

async function fixture(): Promise<Project> {
  const im = makeImg(64, 64);
  im.data.set([100, 100, 100, 255], (21 * 64 + 32) * 4);
  const hash = await cellHash(im);
  const item = (id: string, slot: string): Item => ({ id, name: id, slot, status: 'accepted', mirror: 'flip', materials: [id], prompt: '', baseHash: hash, provenance: [], layers: [{ id: 'main', role: 'fg', z: slot === 'body' ? 10 : 110, cells: { 'walk-fast': { south: [hash, hash] }, walk_fast: { south: [hash, hash] } } }] });
  return { images: new Map([[hash, im]]), manifest: {
    format: 'pixeldoll/2', name: 'Godot regression', app: 'test',
    rig: { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 56 }, baseItem: 'base', baseHash: hash, directions: [{ id: 'south' }], animations: ['walk-fast', 'walk_fast'].map((id) => ({ id, cells: 2, loop: true, frames: [{ cell: 1, ms: 125 }, { cell: 0, ms: 50 }, { cell: 1, ms: 75 }] })) },
    slots: [{ id: 'body', class: 'base', z: 10 }, { id: 'hair', class: 'rigid', z: 110 }],
    materials: ['base', 'a', 'b'].map((id) => ({ id, owner: id, label: id, ramp: ['#646464'], variants: { blue: ['#0000ff'], red: ['#ff0000'] }, ...(id === 'a' ? { defaultVariant: 'blue' } : {}) })),
    items: [item('base', 'body'), item('a', 'hair'), item('b', 'hair')],
    presets: [{ id: 'default', name: 'Default', items: { body: null, hair: 'a' }, variants: {} }, { id: 'red', name: 'Red', items: { hair: 'a' }, variants: { a: 'red' } }],
  } };
}

test('Godot retains every alternate item as a scene dependency and uses raw sources for palette swaps', async () => {
  const result = await exportFiles(await fixture(), { engines: ['godot'], baked: true });
  expect(result.errors).toEqual([]);
  const files = new Map(result.entries.map((file) => [file.name, new TextDecoder().decode(file.data)]));
  expect(files.get('godot/Paperdoll.tscn')).toContain('library = ExtResource("library")');
  const library = files.get('godot/library.tres')!;
  for (const name of ['base', 'a', 'b']) expect(library).toContain(`path="${name}_main.tres"`);
  expect(library).toContain('metadata/manifest = {');
  expect(files.get('godot/a_main.tres')).toContain('../sources/layers/hair/a/main/walk-fast.png');
  expect(files.get('godot/README.txt')).toContain('selected-scene');
});

test('Godot move resource IDs remain unique for hyphens and underscores and preserve playlist timing', async () => {
  const m = (await fixture()).manifest;
  for (const item of m.items) for (const layer of item.layers) layer.sheets = Object.fromEntries(m.rig.animations.map((a) => [a.id, `${a.id}.png`]));
  const text = spriteFramesTres(m, 'base', 'main');
  const ids = [...text.matchAll(/\[(?:ext|sub)_resource[^\n]* id="([^"]+)"\]/g)].map((match) => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
  expect(text).toContain('&"walk-fast_south"');
  expect(text).toContain('&"walk_fast_south"');
  expect(text).toContain('"duration": 2.5');
  expect(text).toContain('"duration": 1.5');
  expect(text).toContain('"speed": 20.0');
  expect(godotFiles(m).find((f) => f.name === 'godot/library.tres')).toBeDefined();
});

// Opt-in native smoke/regression: GODOT_BIN=<Godot console executable> npm test -- godot-export
test.skipIf(!process.env.GODOT_BIN)('Godot natively imports and runs palettes, presets, ownership, links and equipment guards', async () => {
  const directory = resolve('test-results/godot-export');
  const project = await fixture();
  project.manifest.rig.directions.unshift({ id: 'east' });
  project.manifest.rig.animations.unshift({ id: 'empty', cells: 1, loop: false, frames: [{ cell: 0, ms: 100 }] });
  const output = await exportFiles(project, { engines: ['godot'], baked: true });
  expect(output.errors).toEqual([]);
  for (const entry of output.entries) { const path = join(directory, entry.name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, entry.data); }
  writeFileSync(join(directory, 'project.godot'), 'config_version=5\n[application]\nconfig/name="Godot export regression"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
  writeFileSync(join(directory, 'verify.gd'), NATIVE_TEST);
  const options = { encoding: 'utf8' as const, timeout: 60_000, env: { ...process.env, APPDATA: directory, LOCALAPPDATA: directory, TEMP: directory, TMP: directory } };
  const imported = spawnSync(process.env.GODOT_BIN!, ['--headless', '--path', directory, '--editor', '--import', '--quit'], options);
  expect(imported.status, imported.stdout + imported.stderr).toBe(0);
  expect(imported.stdout + imported.stderr).not.toMatch(/SCRIPT ERROR|Parse Error|Failed loading resource/);
  const run = spawnSync(process.env.GODOT_BIN!, ['--headless', '--path', directory, '--fixed-fps', '60', '--script', 'verify.gd'], options);
  writeFileSync(join(directory, 'native.log'), run.stdout + run.stderr);
  expect(run.status, run.stdout + run.stderr).toBe(0);
  expect(run.stdout + run.stderr).not.toMatch(/SCRIPT ERROR|ERROR:/);
  expect(run.stdout).toContain('GODOT_EXPORT_PASS');
  expect(readFileSync(join(directory, 'native.log'), 'utf8')).toContain('GODOT_EXPORT_PASS');
  writeFileSync(join(directory, 'export_presets.cfg'), '[preset.0]\nname="Regression"\nplatform="Windows Desktop"\nrunnable=true\nexport_filter="scenes"\nexport_files=PackedStringArray("res://godot/Paperdoll.tscn")\ninclude_filter=""\nexclude_filter=""\n[preset.0.options]\nbinary_format/architecture="x86_64"\n');
  const pack = join(directory, 'regression.pck');
  const packaged = spawnSync(process.env.GODOT_BIN!, ['--headless', '--path', directory, '--export-pack', 'Regression', pack], options);
  writeFileSync(join(directory, 'pack.log'), packaged.stdout + packaged.stderr);
  expect(packaged.status, packaged.stdout + packaged.stderr).toBe(0);
  expect(packaged.stdout + packaged.stderr).not.toMatch(/ERROR:/);
  // The verifier stays outside the PCK; every resource it tests must be loaded through the selected-scene pack.
  const packed = spawnSync(process.env.GODOT_BIN!, ['--headless', '--main-pack', pack, '--fixed-fps', '60', '--script', join(directory, 'verify.gd')], options);
  writeFileSync(join(directory, 'packed-runtime.log'), packed.stdout + packed.stderr);
  expect(packed.status, packed.stdout + packed.stderr).toBe(0);
  expect(packed.stdout + packed.stderr).not.toMatch(/ERROR:/);
  expect(packed.stdout).toContain('GODOT_EXPORT_PASS');
}, 120_000);

const NATIVE_TEST = `extends SceneTree
var fails := 0
func check(ok: bool, message: String) -> void:
	if not ok:
		fails += 1
		printerr(message)
func color(doll: Node, slot: String) -> Color:
	var node: AnimatedSprite2D = doll.get_node(slot + "_fg")
	return node.sprite_frames.get_frame_texture(node.animation, node.frame).get_image().get_pixel(32, 21)
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	var doll = load("res://godot/Paperdoll.tscn").instantiate()
	root.add_child(doll)
	await process_frame
	check(doll.anim == "walk-fast" and doll.dir == "south", "Startup skips empty moves and unavailable first rig view")
	doll.play_anim("walk-fast", "east")
	check(doll.dir == "south", "Unavailable view must not replace active playback")
	doll.play_anim("empty", "south")
	check(doll.anim == "walk-fast", "Empty move must not replace active playback")
	check(doll.equipped.body == "base", "Default must retain frozen base even with body:null")
	check(color(doll, "hair") == Color.BLUE, "Default must use sourceSheets and defaultVariant")
	check(color(doll, "body") == Color8(100, 100, 100), "Equal source RGBs must remain owner-local")
	doll.play_anim("walk_fast", "south")
	doll.body.set_frame_and_progress(1, 0.4)
	doll.set_preset("red")
	check(color(doll, "hair") == Color.RED, "Preset variant must replace default")
	check(doll.body.frame == 1 and is_equal_approx(doll.body.frame_progress, 0.4) and doll.body.is_playing(), "Palette changes must preserve playback")
	doll.equip("body", "")
	doll.equip("hair", "base")
	check(doll.equipped.body == "base" and doll.equipped.hair == "a", "Frozen base and wrong-slot guards")
	doll.equip("hair", "b")
	check(color(doll, "hair") == Color8(100, 100, 100), "Unworn alternate equipment must load without palette bleed")
	doll.set_variant("b", "blue")
	check(color(doll, "hair") == Color.BLUE, "Runtime variant")
	doll.manifest.materials[2]["linkTo"] = "a"
	doll.set_variant("a", "red")
	check(color(doll, "hair") == Color.RED, "Linked material selection")
	doll.manifest.materials[1]["linkTo"] = "b"
	doll.set_variant("a", "blue")
	check(color(doll, "hair") == Color8(100, 100, 100), "Linked cycles must retain source palette")
	for a in doll.manifest.rig.animations:
		doll.play_anim(a.id, "south")
		for i in 45:
			await process_frame
			check(doll.get_node("hair_fg").frame == doll.body.frame, "Layer frame synchronization")
	doll.queue_free()
	await process_frame
	print("GODOT_EXPORT_PASS" if fails == 0 else "GODOT_EXPORT_FAIL: %s" % fails)
	quit(0 if fails == 0 else 1)
`;
