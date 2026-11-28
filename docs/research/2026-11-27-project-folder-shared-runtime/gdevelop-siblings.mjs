import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(
  new URL("../../../app/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const [matrix, engine, core] = process.argv
  .slice(2)
  .map((file) => path.resolve(file));
assert(matrix && engine && core);
const normalize = (file) => file.replace(/\\/g, "/");
const gd = await require(core)({
  locateFile: (name) => path.join(path.dirname(core), name),
});
gd.JsPlatform.get();
const scratch = fs.mkdtempSync(path.join(tmpdir(), "pixeldoll-gd-siblings-"));
const browser = await chromium.launch({ headless: true });
try {
  for (const label of ["distinct", "duplicate", "duplicate-dedup", "mixed"]) {
    const scenario = label === "duplicate-dedup" ? "duplicate" : label;
    const projectDir = path.join(matrix, "gdevelop", scenario);
    const [first, second] = ["a", "b"].map((folder) => {
      const result = JSON.parse(
        fs.readFileSync(
          path.join(projectDir, folder, "gdevelop/game.json"),
          "utf8",
        ),
      );
      for (const resource of result.resources.resources)
        resource.file = folder + "/gdevelop/" + resource.file;
      return result;
    });
    const layouts = [first.layouts[0], second.layouts[0]];
    const keys = layouts.map((layout) =>
      JSON.parse(layout.events[0].inlineCode[1].split(" = ")[1].slice(0, -1)),
    );
    const duplicateCount = (items) =>
      items.length - new Set(items.map((item) => item.name)).size;
    first.resources.resources.push(...second.resources.resources);
    layouts[0].objects.push(...layouts[1].objects);
    layouts[0].events.push(...layouts[1].events);
    const rawObjects = layouts[0].objects.length;
    const objectCollisions = duplicateCount(layouts[0].objects);
    const resourceCollisions = duplicateCount(first.resources.resources);
    assert.equal(keys[0] === keys[1], scenario === "duplicate");
    assert.equal(
      objectCollisions > 0 && resourceCollisions > 0,
      scenario === "duplicate",
    );
    if (label === "duplicate-dedup") {
      const unique = (items) => [
        ...new Map(
          items
            .slice()
            .reverse()
            .map((item) => [item.name, item]),
        ).values(),
      ];
      first.resources.resources = unique(first.resources.resources);
      layouts[0].objects = unique(layouts[0].objects);
    }
    const json = path.join(projectDir, label + "-merged.json");
    fs.writeFileSync(json, JSON.stringify(first));
    const project = new gd.Project();
    project.addPlatform(gd.JsPlatform.get());
    project.unserializeFrom(
      gd.Serializer.fromJSON(fs.readFileSync(json, "utf8")),
    );
    project.setProjectFile(normalize(json));
    const objects = project
      .getLayout("Paperdoll")
      .getObjects()
      .getObjectsCount();
    const afs = new gd.AbstractFileSystemJS();
    const exported = path.join(scratch, label, "html");
    Object.assign(afs, {
      mkDir: (file) =>
        !!fs.mkdirSync(file, { recursive: true }) || fs.existsSync(file),
      dirExists: fs.existsSync,
      clearDir: (file) => {
        const target = path.resolve(file);
        assert.ok(target.startsWith(scratch + path.sep));
        fs.mkdirSync(target, { recursive: true });
        for (const item of fs.readdirSync(target))
          fs.rmSync(path.join(target, item), { recursive: true });
      },
      getTempDir: () => normalize(path.join(scratch, label, "temp")),
      fileNameFrom: path.posix.basename,
      dirNameFrom: path.posix.dirname,
      isAbsolute: path.isAbsolute,
      makeAbsolute: (file, base) => normalize(path.resolve(base, file)),
      makeRelative: (file, base) => normalize(path.relative(base, file)),
      copyFile: (source, dest) => {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(source, dest);
        return true;
      },
      writeToFile: (file, value) => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, value);
        return true;
      },
      readFile: (file) => fs.readFileSync(file, "utf8"),
      fileExists: fs.existsSync,
      readDir: () => new gd.VectorString(),
    });
    const exporter = new gd.Exporter(
      afs,
      normalize(path.join(engine, "resources/GDJS")),
    );
    const options = new gd.ExportOptions(project, normalize(exported));
    options.setTarget("web");
    try {
      assert.ok(
        exporter.exportWholePixiProject(options),
        exporter.getLastError(),
      );
    } catch (error) {
      console.error(
        "EXPORT ERROR",
        label,
        {
          keys,
          rawObjects,
          objects,
          objectCollisions,
          resourceCollisions,
          json,
        },
        error.message,
      );
      if (label !== "duplicate") process.exitCode = 1;
      continue;
    }
    const page = await browser.newPage();
    const errors = [];
    const missing = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const origin = "http://gd-siblings.invalid";
    await page.route(origin + "/**", async (route) => {
      const name = decodeURIComponent(
        new URL(route.request().url()).pathname.slice(1),
      );
      const file = path.resolve(exported, name);
      if (!file.startsWith(exported + path.sep) || !fs.existsSync(file)) {
        if (name !== "favicon.ico") missing.push(name);
        return route.fulfill({ status: 404 });
      }
      const type = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".png": "image/png",
        ".json": "application/json",
      };
      let body = fs.readFileSync(file);
      if (name === "index.html")
        body = body
          .toString()
          .replace(
            "var game = new gdjs.RuntimeGame",
            "var game = window.probeGame = new gdjs.RuntimeGame",
          );
      return route.fulfill({
        contentType: type[path.extname(file)] ?? "application/octet-stream",
        body,
      });
    });
    try {
      await page.goto(origin + "/index.html");
      await page.waitForFunction(
        () => {
          const scene = window.probeGame?.getSceneStack().getCurrentScene();
          return (
            scene &&
            Object.keys(scene).some((key) => key.startsWith("PixelDoll_PD_"))
          );
        },
        undefined,
        { timeout: 15000 },
      );
      const native = await page.evaluate((keys) => {
        const scene = window.probeGame.getSceneStack().getCurrentScene();
        const libraries = keys.map((key) => scene[key]);
        for (const library of new Set(libraries))
          library.dolls[0].play("walk", "south", true);
        return {
          sameLibrary: libraries[0] === libraries[1],
          dolls: libraries.map((library) => library.dolls.length),
        };
      }, keys);
      assert.equal(native.sameLibrary, scenario === "duplicate");
      assert.deepEqual(native.dolls, [1, 1]);
      assert.deepEqual(errors, []);
      assert.deepEqual(missing, []);
      console.log("PASS", label, {
        keys,
        rawObjects,
        objects,
        objectCollisions,
        resourceCollisions,
        native,
        json,
        exported,
      });
    } catch (error) {
      console.error(
        "FAILED",
        scenario,
        {
          keys,
          rawObjects,
          objects,
          objectCollisions,
          resourceCollisions,
          errors,
          missing,
          json,
          exported,
        },
        error,
      );
      process.exitCode = 1;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
