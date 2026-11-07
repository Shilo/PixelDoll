// Recreate only the ignored native challenge project. Run from any working directory, then use the Godot MCP tools.
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const folder = new URL('godot.local/', import.meta.url);
await mkdir(folder, { recursive: true });
await copyFile(new URL('native-renderer-probe.gd', import.meta.url), new URL('probe.gd', folder));
await writeFile(new URL('project.godot', folder), `config_version=5
[application]
config/name="PixelDoll native renderer challenge"
run/main_scene="res://main.tscn"
[display]
window/size/viewport_width=32
window/size/viewport_height=32
[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
`);
await writeFile(new URL('main.tscn', folder), `[gd_scene load_steps=2 format=3]
[ext_resource type="Script" path="res://probe.gd" id="1"]
[node name="Probe" type="Node2D"]
script = ExtResource("1")
`);
console.log('Prepared ignored godot.local renderer challenge project.');
