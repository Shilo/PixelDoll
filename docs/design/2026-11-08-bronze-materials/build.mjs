import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const packageRoot = path.join(root, "app/node_modules/@shilo/bronze-ui");
const output = process.argv[2];
if (!output)
  throw new Error("Pass an absolute output path for the comparison fragment.");
if (!path.isAbsolute(output))
  throw new Error("The output path must be absolute.");
const [template, tokens, components, pkg] = await Promise.all([
  fs.readFile(path.join(here, "study.html"), "utf8"),
  fs.readFile(path.join(packageRoot, "styles/tokens.css"), "utf8"),
  fs.readFile(path.join(packageRoot, "styles/components.css"), "utf8"),
  fs.readFile(path.join(packageRoot, "package.json"), "utf8"),
]);
const assets = {};
for (const name of [
  "godot",
  "unity",
  "phaser",
  "gdevelop",
  "aseprite",
  "generic",
]) {
  const bytes = await fs.readFile(
    path.join(root, "app/public/icons/exports", name + ".svg"),
  );
  assets[name] = "data:image/svg+xml;base64," + bytes.toString("base64");
}
const demo = JSON.parse(
  await fs.readFile(
    path.resolve(root, "../..", "bronze-ui/showcase/assets/demo.json"),
    "utf8",
  ),
);
assets.helmet = demo.items.find((item) => item.id === "helmet_steel").thumbnail;
assets.hat = demo.items.find((item) => item.id === "hat_wizard").thumbnail;
if (!assets.helmet || !assets.hat)
  throw new Error("The showcase equipment thumbnails are missing.");
const baseline =
  "@scope (#bronze-proposals .specimen) {\n" +
  tokens.replaceAll(":root", ":scope") +
  "\n" +
  components +
  "\n}";
let html = template
  .replace("/* BASELINE_CSS */", baseline)
  .replace("ASSET_JSON", JSON.stringify(assets));
if (Buffer.byteLength(html) > 1_000_000)
  throw new Error("Comparison fragment exceeds the inline size limit.");
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, html);
const manifest = {
  bronzeVersion: JSON.parse(pkg).version,
  baselineTokensSha256: crypto
    .createHash("sha256")
    .update(tokens)
    .digest("hex"),
  baselineComponentsSha256: crypto
    .createHash("sha256")
    .update(components)
    .digest("hex"),
  artwork:
    "Unmodified equipment thumbnails from the Bronze showcase demo manifest",
  bytes: Buffer.byteLength(html),
  output,
};
await fs.writeFile(
  path.join(path.dirname(output), "bronze-study-provenance.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(JSON.stringify(manifest, null, 2));
