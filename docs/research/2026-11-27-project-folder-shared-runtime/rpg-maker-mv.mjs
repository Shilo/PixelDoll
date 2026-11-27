import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const [matrix, installed] = process.argv.slice(2);
assert(
  matrix && installed,
  "Pass the matrix directory and installed RPG Maker MV directory.",
);
const root = mkdtempSync(join(tmpdir(), "pixeldoll-rpgmv-"));
cpSync(join(installed, "nwjs-win"), root, {
  recursive: true,
  filter: (file) => !["www", "package.json"].includes(basename(file)),
});
const web = join(root, "www");
cpSync(join(installed, "NewData", "js"), join(web, "js"), { recursive: true });
mkdirSync(join(web, "data"));
cpSync(
  join(installed, "NewData", "data", "Map001.json"),
  join(web, "data", "Map001.json"),
);
writeFileSync(
  join(root, "package.json"),
  JSON.stringify({
    name: basename(root),
    main: "www/index.html",
    window: { show: false },
  }),
);
const sprites = join(web, "img", "characters");
mkdirSync(sprites, { recursive: true });
const cases = [];
for (const scenario of ["distinct", "duplicate", "mixed"]) {
  const dir = join(matrix, "rpgmaker", scenario);
  const original = ["a", "b"].map((side) => {
    const name = readdirSync(join(dir, side)).find((file) =>
      /^\$adventurer-[ab]\.png$/.test(file),
    );
    assert(name);
    return name;
  });
  const names = original.map((name, i) => {
    const renamed =
      name.slice(0, -4) +
      "-" +
      scenario +
      (scenario === "duplicate" && i === 1 ? "-relink" : "");
    cpSync(
      join(dir, i === 0 ? "a" : "b", name),
      join(sprites, renamed + ".png"),
    );
    return renamed;
  });
  cases.push({
    scenario,
    original: original.map((name) => name.slice(0, -4)),
    names,
  });
}
const out = join(root, "native-result.json");
const html = readFileSync(join(installed, "NewData", "index.html"), "utf8")
  .replace(/<script[^>]*src="js\/(?:plugins|main)\.js"[^>]*><\/script>/g, "")
  .replace("</body>", '<script src="verify.js"></script></body>');
writeFileSync(join(web, "index.html"), html);
writeFileSync(
  join(web, "verify.js"),
  `
const fs = require('fs');
const results = [];
function finish(error) {
	fs.writeFileSync(${JSON.stringify(out)}, JSON.stringify({
		version: Utils.RPGMAKER_VERSION, nw: process.versions.nw, results, error: error && error.stack
	}, null, 2));
	nw.App.quit();
}
async function verify() {
	$dataMap = JSON.parse(fs.readFileSync(${JSON.stringify(join(web, "data", "Map001.json"))}, 'utf8'));
	$gameMap = Object.create(Game_Map.prototype);
	$gameMap._tilesetId = $dataMap.tilesetId;
	for (const {scenario, original, names} of ${JSON.stringify(cases)}) {
		const loaded = await Promise.all(names.map((name) => new Promise((resolve, reject) => {
			const char = new Game_Character();
			char.setImage(name, 0);
			const sprite = new Sprite_Character(char);
			sprite.updateBitmap();
			const bitmap = sprite.bitmap;
			bitmap.addLoadListener(() => {
				if (!ImageManager.isBigCharacter(name) || sprite.patternWidth() * 3 !== bitmap.width ||
					sprite.patternHeight() * 4 !== bitmap.height) reject(Error(name + ' unexpected sprite dimensions'));
				else resolve({ name, bitmap, cell: [sprite.patternWidth(), sprite.patternHeight()] });
			});
			setTimeout(() => reject(Error('Timed out loading ' + name)), 5000);
		})));
		if (loaded[0].bitmap === loaded[1].bitmap) throw Error('Distinct game filenames shared a bitmap');
		const namesCollide = original[0] === original[1];
		const sameOriginalCacheKey = ImageManager._generateCacheKey('img/characters/' + original[0] + '.png', 0) ===
			ImageManager._generateCacheKey('img/characters/' + original[1] + '.png', 0);
		if (namesCollide !== (scenario === 'duplicate') || sameOriginalCacheKey !== namesCollide) {
			throw Error('Unexpected original filename or cache key');
		}
		results.push({ scenario, namesCollide, sameOriginalCacheKey, sprites: loaded.map(({ name, cell }) => ({ name, cell })) });
	}
}
verify().then(() => finish(null), finish);
`,
);
const run = spawnSync(
  join(root, "Game.exe"),
  ["--user-data-dir=" + join(root, "profile")],
  {
    cwd: root,
    timeout: 30000,
    windowsHide: true,
    encoding: "utf8",
  },
);
if (run.error) throw run.error;
const result = JSON.parse(readFileSync(out, "utf8"));
console.log(root, result);
assert.equal(result.error, null);
assert.equal(result.results.length, cases.length);
