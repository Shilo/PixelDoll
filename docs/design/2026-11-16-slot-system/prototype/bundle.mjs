import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../../..");
const read = (relative) => readFile(path.join(directory, relative), "utf8");
const bronze = path.join(root, "app/node_modules/@shilo/bronze-ui/styles");
const styles = await Promise.all(
  ["tokens.css", "base.css", "components.css"].map((name) =>
    readFile(path.join(bronze, name), "utf8"),
  ),
);
const assets = {};
for (const item of [
  "body/base",
  "head/helmet_steel",
  "head/hat_wizard",
  "hair/hair_brown",
  "torso_inner/vest_leather",
  "back/cape_red",
  "main_hand/sword_steel",
]) {
  const image = await readFile(
    path.join(root, "app/public/fixtures/s2/layers", item, "main/walk.png"),
  );
  assets[item] = `data:image/png;base64,${image.toString("base64")}`;
}
const script = await read("workshop.js");
const html = (await read("index.html"))
  .replace(/<link rel="stylesheet"[^>]+>/g, "")
  .replace(
    "</head>",
    `<style>${styles.join("\n")}\n${await read("workshop.css")}</style></head>`,
  )
  .replace(
    '<script src="workshop.js"></script>',
    `<script>window.SLOT_WORKSHOP_ASSETS=${JSON.stringify(assets)};\n${script}</script>`,
  )
  .replace(/[ \t]+$/gm, "");
await writeFile(path.join(directory, "workshop.html"), html);
const frameStyles = html
  .match(/<style>([\s\S]*?)<\/style>/)[1]
  .replace(
    /(-?\d+(?:\.\d+)?)(?:dvh|svh|lvh|vh)/g,
    (_, amount) => `${Number(amount) * 8}px`,
  );
const frameBody = html
  .match(/<body>([\s\S]*?)<\/body>/)[1]
  .replace(/<div>\s*<h1>Slot workshop<\/h1>[\s\S]*?<\/div>/, "")
  .replace(
    "<script>window.SLOT_WORKSHOP_ASSETS",
    '<script>document.documentElement.dataset.theme=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";window.SLOT_WORKSHOP_ASSETS',
  );
const frame = `<style>${frameStyles}\nhtml,body{background:transparent!important}#workshop{padding:0;max-width:none;width:100%}#theme{display:none}</style>\n${frameBody}`;
await writeFile(
  path.join(directory, "review-frame.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Slot decisions</title></head><body>${frame}</body></html>`.replace(
    /[ \t]+$/gm,
    "",
  ),
);
console.log(
  "Built standalone workshop.html from installed Bronze UI and repository fixtures.",
);
