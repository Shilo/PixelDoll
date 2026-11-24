// x32: does edit-images-v2 edit N separate images in one call, and how is it billed?
// usage (from spikes/api/x32): [X32_SRC=s2] node --experimental-transform-types --no-warnings batch.mts <nImages> [item] [seed] [dir]
// DRY=1 builds inputs only. Never resends a paid call (x31 paid() markers).
process.env.C25_RUN ??= "x32";
process.env.C25_CAP ??= "1000";
const L = await import("../x31/lib.mts");
const { items, b64, save, paid, OUT, dressed, item, rig, targets, refKey } = L;
import fs from "node:fs";
import path from "node:path";

const n = Math.max(2, Math.min(16, +(process.argv[2] ?? 8)));
const id = process.argv[3] ?? L.ITEMS[0];
const seed = +(process.argv[4] ?? 7);
const dir = (process.argv[5] ?? "south") as L.Dir;
const DRY = !!process.env.DRY;
const ARM = `batch${n}`;
const ARM_CAP = +(process.env.ARM_CAP ?? 60);
const W = rig.cell.w,
  H = rig.cell.h;
const png = (b: string) => ({ type: "base64", base64: b, format: "png" });

const tg = await targets(dir);
const ref = await dressed(id, dir);
const chroma = tg.map((t) => items.inputCell(t.im, "green"));
// The first image is the dressed reference; then real frames, then repeats if n exceeds the frames available.
const pool = [ref, ...chroma];
const picked = Array.from({ length: n }, (_, i) => pool[i % pool.length]);
const keys = Array.from({ length: n }, (_, i) =>
  i < pool.length
    ? i === 0
      ? refKey(dir)
      : tg[i - 1].key
    : `repeat/${dir}/${i}`,
);
const prompt = item(id).prompt.replace(/\s+/g, " ").trim();
const description =
  `These ${n} separate images are frames of the same pixel art character, a solid bright green mannequin, facing ${dir}. ` +
  `Image 1 already wears ${prompt}: copy exactly that design, colors and size onto the other images, fitted to each pose. ` +
  `If an image repeats another, draw the same result. The bright green is a chroma key; keep it exactly. ` +
  `Keep every other pixel, the pose and the transparent background unchanged; empty hands, no weapon, no effects.`;

const sheet = L.blank(W, H);
for (const [i, im] of picked.entries()) {
  const key = keys[i];
  const file = path.join(OUT, `${ARM}-${id}-s${seed}-${dir}`, `in${i}.png`);
  await save(file, im);
  void sheet;
}
const inputs = await Promise.all(picked.map((im) => b64(im)));
const body = {
  method: "edit_with_text",
  edit_images: await Promise.all(
    inputs.map(async (b, i) => ({ image: png(b), width: W, height: H })),
  ),
  image_size: { width: W, height: H },
  description,
  no_background: true,
  seed,
};
const plan = {
  arm: ARM,
  item: id,
  seed,
  dir,
  keys,
  path: "/edit-images-v2",
  body,
};
fs.mkdirSync(path.join(OUT, `${ARM}-${id}-s${seed}-${dir}`), {
  recursive: true,
});
fs.writeFileSync(
  path.join(OUT, `${ARM}-${id}-s${seed}-${dir}`, "plan.json"),
  JSON.stringify(
    { ...plan, body: { ...body, edit_images: `<${n} images elided>` } },
    null,
    1,
  ),
);
console.log(
  `${ARM} ${id} s${seed} ${dir}: ${n} images, ${W}x${H}, estimate 10-25 gens`,
);
if (DRY) process.exit(0);

const outs = await paid({
  arm: ARM,
  label: `${ARM} ${id} s${seed} ${dir} x${n}`,
  file: path.join(OUT, `${ARM}-${id}-s${seed}-${dir}`, "out"),
  req: { path: "/edit-images-v2", body },
  estimate: 10,
  armCap: ARM_CAP,
});
console.log(outs ? `returned ${outs.length} images` : "no result");
