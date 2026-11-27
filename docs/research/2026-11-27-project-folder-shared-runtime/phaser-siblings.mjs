import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(
  new URL("../../../app/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const [matrix, vendor] = process.argv.slice(2);
assert(matrix && vendor);
const browser = await chromium.launch({ headless: true });
try {
  for (const version of ["3.80.1", "3.90.0", "4.1.0"]) {
    const bundle = await readFile(join(vendor, "phaser-" + version + ".js"));
    for (const scenario of ["distinct", "duplicate", "mixed"]) {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const origin = "http://phaser-siblings.invalid";
      await page.route(origin + "/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/")
          return route.fulfill({
            contentType: "text/html",
            body: '<!doctype html><script src="/phaser.js"></script>',
          });
        if (path === "/phaser.js")
          return route.fulfill({
            contentType: "text/javascript",
            body: bundle,
          });
        const type = path.endsWith(".js")
          ? "text/javascript"
          : path.endsWith(".json")
            ? "application/json"
            : path.endsWith(".png")
              ? "image/png"
              : null;
        if (!type || !/^\/[ab]\//.test(path))
          return route.fulfill({ status: 404 });
        return route.fulfill({
          contentType: type,
          body: await readFile(join(matrix, "phaser", scenario, path)),
        });
      });
      try {
        await page.goto(origin);
        const result = await page.evaluate(async () => {
          const modules = await Promise.all([
            import("/a/phaser/PaperdollContainer.js"),
            import("/b/phaser/PaperdollContainer.js"),
          ]);
          return new Promise((resolve, reject) => {
            const game = new Phaser.Game({
              type: Phaser.CANVAS,
              width: 320,
              height: 160,
              audio: { noAudio: true },
              scene: {
                async create() {
                  try {
                    const loaded = [];
                    for (const [i, api] of modules.entries()) {
                      const m = await api.loadPaperdoll(
                        this,
                        i === 0 ? "/a/" : "/b/",
                      );
                      const doll = new api.Paperdoll(
                        this,
                        80 + i * 160,
                        100,
                        m,
                      );
                      doll.play("walk", "south");
                      const layer = m.items.find(
                        (item) => item.id === m.rig.baseItem,
                      ).layers[0];
                      const key = api.texKey(
                        m,
                        m.rig.baseItem,
                        layer.id,
                        "walk",
                      );
                      const animation = api.animKey(m, "walk", "south");
                      if (
                        !this.textures.exists(key) ||
                        !this.anims.exists(animation) ||
                        doll.body.anims.currentAnim?.key !== animation
                      )
                        throw Error("Missing loaded animation or texture");
                      loaded.push({
                        id: m.exportId,
                        key,
                        animation,
                        url: m._base,
                        preset: m.presets[0].id,
                      });
                    }
                    game.destroy(true);
                    resolve({
                      version: Phaser.VERSION,
                      loaded,
                      distinctModules:
                        modules[0].Paperdoll !== modules[1].Paperdoll,
                    });
                  } catch (error) {
                    reject(error);
                  }
                },
              },
            });
          });
        });
        assert.equal(result.version, version);
        assert.equal(result.distinctModules, true);
        assert.equal(
          result.loaded[0].id === result.loaded[1].id,
          scenario === "duplicate",
        );
        for (const prop of ["key", "animation", "url"])
          assert.notEqual(result.loaded[0][prop], result.loaded[1][prop]);
        assert.deepEqual(errors, []);
        console.log(scenario, JSON.stringify(result));
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
