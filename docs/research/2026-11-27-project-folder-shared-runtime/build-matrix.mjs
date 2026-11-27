import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadFixture } from "../../../app/src/lib/compose/fixture.ts";
import { buildExport } from "../../../app/src/lib/export/build.ts";
import { decodePngBytes } from "../../../app/src/lib/image/pngraw.ts";
import { defaultExportSettings } from "../../../app/src/lib/store/export-settings.ts";
import { EXPORT_ENGINES } from "../../../app/src/lib/store/manifest.ts";

const [output, olderRoot] = process.argv.slice(2);
assert(
  output && olderRoot,
  "Pass a fresh output directory under TEMP and the extracted older revision.",
);
const root = resolve(output);
const tempRelative = relative(tmpdir(), root);
assert(
  tempRelative && !tempRelative.startsWith("..") && !isAbsolute(tempRelative),
);
const source = fileURLToPath(
  new URL("../../../app/public/fixtures/s2/", import.meta.url),
);
const older = await import(
  pathToFileURL(resolve(olderRoot, "app/src/lib/export/build.ts")).href
);
const fixture = await loadFixture((path) => readFile(join(source, path)));
const summary = {};
await mkdir(root);

async function build(builder, engine, id, outfit) {
  const manifest = structuredClone(fixture.manifest);
  manifest.name = id === "adventurer-a" ? "Adventurer A" : "Adventurer B";
  manifest.exportId = id;
  const result = await builder(
    { manifest, images: fixture.images },
    {
      engine,
      baked: true,
      look: manifest.presets[outfit],
      settings: defaultExportSettings(),
      rpgWalk: "walk",
      exportedAt: "2026-11-27T00:00:00.000Z",
      filesOnly: true,
    },
  );
  assert.equal(result.kind, "requested", JSON.stringify(result.errors));
  return result.entries;
}

function digest(data) {
  return createHash("sha256").update(data).digest("hex");
}

for (const engine of EXPORT_ENGINES) {
  const a = await build(buildExport, engine, "adventurer-a", 0);
  const b = await build(buildExport, engine, "adventurer-b", 1);
  const duplicate = await build(buildExport, engine, "adventurer-a", 0);
  const previous = await build(older.buildExport, engine, "adventurer-b", 1);
  assert.deepEqual(a, duplicate);
  const byName = (entries) =>
    new Map(entries.map(({ name, data }) => [name, data]));
  const before = byName(previous);
  summary[engine] = {
    fileCounts: [a.length, b.length, duplicate.length, previous.length],
    changedFromOlder: b
      .filter(
        ({ name, data }) =>
          !before.has(name) || digest(data) !== digest(before.get(name)),
      )
      .map(({ name }) => name),
    olderOnly: previous
      .filter(({ name }) => !byName(b).has(name))
      .map(({ name }) => name),
    data: {},
  };
  for (const [scenario, right] of [
    ["distinct", b],
    ["duplicate", duplicate],
    ["mixed", previous],
  ]) {
    for (const [folder, entries] of [
      ["a", a],
      ["b", right],
    ]) {
      const paths = byName(entries);
      if (engine === "generic") {
        const m = JSON.parse(
          new TextDecoder().decode(paths.get("manifest.json")),
        );
        assert.equal(
          m.exportId,
          scenario === "duplicate" || folder === "a"
            ? "adventurer-a"
            : "adventurer-b",
        );
        const sheets = new Set(
          m.items.flatMap((item) =>
            item.layers.flatMap((layer) => Object.values(layer.sheets ?? {})),
          ),
        );
        for (const path of sheets)
          assert.ok((await decodePngBytes(paths.get(path))).w > 0, path);
        summary[engine].data[scenario + "/" + folder] = sheets.size;
      }
      if (engine === "rpgmaker" || engine === "rpgmakerxp") {
        const pngs = entries.filter(
          ({ name }) => !name.includes("/") && name.endsWith(".png"),
        );
        assert.ok(pngs.length > 0);
        const columns = engine === "rpgmaker" ? 3 : 4;
        summary[engine].data[scenario + "/" + folder] = [];
        for (const { name, data } of pngs) {
          const { w, h } = await decodePngBytes(data);
          assert.equal((w % columns) + (h % 4), 0, name);
          assert.equal(name.startsWith("$"), columns === 3, name);
          summary[engine].data[scenario + "/" + folder].push({ name, w, h });
        }
      }
      for (const { name, data } of entries) {
        const path = join(root, engine, scenario, folder, name);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, data);
      }
    }
  }
}
await writeFile(join(root, "matrix.json"), JSON.stringify(summary, null, 2));
console.log(root, Object.keys(summary));
