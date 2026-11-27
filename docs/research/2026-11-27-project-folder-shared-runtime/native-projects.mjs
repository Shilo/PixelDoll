import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

const [matrix, engine, binary] = process.argv.slice(2);
assert(
  matrix &&
    ["godot", "unity", "unity-import", "aseprite"].includes(engine) &&
    binary,
);
const root = resolve(matrix);
const tempRelative = relative(tmpdir(), root);
assert(
  tempRelative && !tempRelative.startsWith("..") && !isAbsolute(tempRelative),
);
assert(existsSync(join(root, "matrix.json")));

function run(args) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 180000,
  });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

if (engine === "godot" || engine === "aseprite")
  console.log(run(["--version"]).output.trim());
for (const scenario of ["distinct", "duplicate", "mixed"]) {
  const project = join(
    root,
    engine === "unity-import" ? "unity" : engine,
    scenario,
  );
  if (engine === "godot") {
    writeFileSync(
      join(project, "project.godot"),
      `config_version=5
[application]
config/name="PixelDoll sibling runtime probe"
[rendering]
renderer/rendering_method="gl_compatibility"
`,
    );
    writeFileSync(
      join(project, "verify.gd"),
      `extends SceneTree

func _initialize():
	call_deferred("verify")

func verify():
	for folder in ["a", "b"]:
		var path = "res://" + folder + "/godot/Paperdoll.tscn"
		var scene = load(path)
		if scene == null:
			quit(1)
			return
		var doll = scene.instantiate()
		root.add_child(doll)
		var body = doll.get_node("body_fg")
		var ok = doll.get_script().resource_path == "res://" + folder + "/godot/paperdoll.gd"
		ok = ok and doll.play_anim("walk", "south")
		var texture = body.sprite_frames.get_frame_texture("walk_south", 0)
		ok = ok and texture.atlas.resource_path.begins_with("res://" + folder + "/")
		if not ok:
			quit(1)
			return
		print("PASS ", path, " ", doll.get_script().resource_path, " ", texture.atlas.resource_path)
	quit()
`,
    );
    for (const [label, options] of [
      ["import", ["--editor", "--import", "--quit"]],
      ["run", ["--script", "verify.gd"]],
    ]) {
      const result = run(["--headless", "--path", project, ...options]);
      writeFileSync(join(project, label + ".log"), result.output);
      console.log(
        engine,
        scenario,
        label,
        result.status,
        result.output.match(/^(?:PASS|.*ERROR).*$/gm),
      );
      if (result.status !== 0 || /(?:SCRIPT ERROR|ERROR:)/.test(result.output))
        process.exitCode = 1;
    }
  }
  if (engine === "aseprite") {
    const name = scenario === "duplicate" ? "adventurer-a" : "adventurer-b";
    for (const [folder, id] of [
      ["a", "adventurer-a"],
      ["b", name],
    ]) {
      assert(existsSync(join(project, folder, "aseprite", id + ".aseprite")));
    }
    const result = run([
      "-b",
      join(project, "a/aseprite/adventurer-a.aseprite"),
      "--save-as",
      join(project, "a.png"),
      join(project, "b/aseprite", name + ".aseprite"),
      "--save-as",
      join(project, "b.png"),
    ]);
    assert.equal(result.status, 0, result.output);
    const frames = (prefix) =>
      readdirSync(project)
        .filter((name) => new RegExp("^" + prefix + "\\d+\\.png$").test(name))
        .sort()
        .map((name) => readFileSync(join(project, name)));
    const a = frames("a"),
      b = frames("b");
    assert(a.length > 0 && b.length > 0, result.output);
    assert.equal(
      a.length === b.length && a.every((png, i) => png.equals(b[i])),
      scenario === "duplicate",
    );
    console.log(engine, scenario, a.length, b.length, result.output.trim());
  }
  if (engine === "unity") {
    // Compare unmodified output with a lab-only brace repair that isolates assembly identity.
    for (const repair of [false, true]) {
      const work = join(project, repair ? "repaired-control" : "unmodified");
      mkdirSync(join(work, "Assets"), { recursive: true });
      for (const folder of ["a", "b"]) {
        cpSync(join(project, folder), join(work, "Assets", folder), {
          recursive: true,
        });
        if (repair) {
          const source = join(
            work,
            "Assets",
            folder,
            "unity/Runtime/Paperdoll.cs",
          );
          const code = readFileSync(source, "utf8");
          const repaired = code.replace(
            /return true;\r?\n\r?\npublic bool IsActionPlaying/,
            "return true;\n        }\n\n        public bool IsActionPlaying",
          );
          writeFileSync(source, repaired);
        }
      }
      mkdirSync(join(work, "Packages"));
      mkdirSync(join(work, "ProjectSettings"));
      writeFileSync(
        join(work, "ProjectSettings/ProjectVersion.txt"),
        "m_EditorVersion: 6000.4.0f1\n",
      );
      writeFileSync(
        join(work, "Packages/manifest.json"),
        JSON.stringify({
          dependencies: {
            "com.unity.2d.sprite": "1.0.0",
            "com.unity.modules.animation": "1.0.0",
            "com.unity.modules.jsonserialize": "1.0.0",
            "com.unity.modules.imageconversion": "1.0.0",
            "com.unity.modules.imgui": "1.0.0",
          },
        }),
      );
      const log = join(work, "unity.log");
      const result = run([
        "-batchmode",
        "-nographics",
        "-projectPath",
        work,
        "-job-worker-count",
        "2",
        "-quit",
        "-logFile",
        log,
      ]);
      console.log(
        engine,
        scenario,
        repair,
        result.status,
        readFileSync(log, "utf8")
          .split(/\r?\n/)
          .filter((line) =>
            /error CS\d+|already exists|same assembly|Scripts have compiler errors/i.test(
              line,
            ),
          )
          .slice(0, 12),
      );
    }
  }
  if (engine === "unity-import" && scenario !== "duplicate") {
    const work = join(project, "repaired-control");
    const editor = join(work, "Assets", "Editor");
    mkdirSync(editor, { recursive: true });
    cpSync(
      new URL("./UnitySiblingImport.cs", import.meta.url),
      join(editor, "UnitySiblingImport.cs"),
    );
    const log = join(work, "import.log");
    const result = run([
      "-batchmode",
      "-nographics",
      "-projectPath",
      work,
      "-job-worker-count",
      "2",
      "-executeMethod",
      "UnitySiblingImport.Run",
      "-logFile",
      log,
    ]);
    const output = readFileSync(log, "utf8");
    const passes = output.match(/^PASS Assets.*$/gm);
    console.log(
      engine,
      scenario,
      result.status,
      passes ??
        output
          .split(/\r?\n/)
          .filter((line) => /error CS\d+|Exception|Error/i.test(line))
          .slice(-15),
    );
    if (result.status !== 0 || passes?.length !== 2) process.exitCode = 1;
  }
}
