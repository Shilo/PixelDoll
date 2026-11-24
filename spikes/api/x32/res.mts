// x32: does posing at 2x (184 px) and downscaling to 92 beat posing at 92 directly, at the same 3 generations?
// usage (from spikes/api/x32): node --experimental-transform-types --no-warnings res.mts [items|all] [seed] [dirs]
// DRY=1 builds plans only. Paid calls are idempotent and capped.
process.env.C25_RUN ??= "x32";
process.env.C25_CAP ??= "1000";
const L = await import("../x31/lib.mts");
const { items, b64, save, paid, OUT, dressed, rig } = L;
import fs from "node:fs";
import path from "node:path";

const ids = (
  process.argv[2] && process.argv[2] !== "all"
    ? process.argv[2].split(",")
    : L.ITEMS
).slice(0, 2);
const seed = +(process.argv[3] ?? 7);
const dirs = (process.argv[4]?.split(",") ?? [...L.DIRS]) as L.Dir[];
const DRY = !!process.env.DRY;
const F = 2; // exact 2x
const CELL = { w: rig.cell.w * F, h: rig.cell.h * F };
const W = rig.cell.w,
  H = rig.cell.h;

/** Nearest-neighbour upscale (no resampling, exact pixel copies). */
function up2(im: L.Img): L.Img {
  const o = L.blank(im.w * F, im.h * F);
  for (let y = 0; y < im.h; y++)
    for (let x = 0; x < im.w; x++) {
      const s = (y * im.w + x) * 4;
      for (let dy = 0; dy < F; dy++)
        for (let dx = 0; dx < F; dx++) {
          const d = ((y * F + dy) * o.w + x * F + dx) * 4;
          o.data.set(im.data.subarray(s, s + 4), d);
        }
    }
  return o;
}
/** Majority-of-4 downscale, binary alpha: the most frequent opaque RGBA in each 2x2 block; transparent when fewer than 2 are opaque. */
function down2(im: L.Img): L.Img {
  const o = L.blank(im.w / F, im.h / F);
  for (let y = 0; y < o.h; y++)
    for (let x = 0; x < o.w; x++) {
      const tally = new Map<number, number>();
      for (let dy = 0; dy < F; dy++)
        for (let dx = 0; dx < F; dx++) {
          const s = ((y * F + dy) * im.w + x * F + dx) * 4;
          if (im.data[s + 3] < 128) continue;
          const c =
            ((im.data[s] << 24) |
              (im.data[s + 1] << 16) |
              (im.data[s + 2] << 8) |
              255) >>>
            0;
          tally.set(c, (tally.get(c) ?? 0) + 1);
        }
      let best = 0,
        key = 0;
      for (const [c, n] of tally) if (n > best) ((best = n), (key = c));
      if (best >= 2) {
        const d = (y * o.w + x) * 4;
        o.data[d] = (key >>> 24) & 255;
        o.data[d + 1] = (key >>> 16) & 255;
        o.data[d + 2] = (key >>> 8) & 255;
        o.data[d + 3] = 255;
      }
    }
  return o;
}

const dir = path.join(OUT, "res");
fs.mkdirSync(dir, { recursive: true });
const tasks: (() => Promise<unknown>)[] = [];
let total = 0;
for (const id of ids)
  for (const d of dirs) {
    const keys = Array.from({ length: 6 }, (_, i) => `walk/${d}/${i}`);
    const ref = await dressed(id, d);
    const poses = keys.map((k) => items.cellKeypoints(rig, k)!);
    const base = {
      item: L.item(id).prompt,
      slot: L.slotOf(id),
      key: "green",
      anim: "walk",
      dir: d,
      seed,
      pad: 0,
      view: rig.view,
    };
    // API keypoints are fractions of the frame (0-1), so a larger cell keeps them unchanged.
    for (const [arm, cell, first, rest, ps] of [
      ["native92", { w: W, h: H }, ref, rig.rest[d].keypoints, poses],
      ["up184", CELL, up2(ref), rig.rest[d].keypoints, poses],
    ] as const) {
      const req = items.itemRoute.pose({
        ...base,
        cell,
        first_frame: undefined,
        keyframePngB64: await b64(first),
        rest,
        poses: ps,
      } as any);
      const file = path.join(dir, `${arm}.${id}.s${seed}.${d}`);
      const estimate = L.clips.poseGensFor(6);
      const strip = JSON.parse(
        JSON.stringify(req.body, (k, v) =>
          typeof v === "string" && v.length > 300 ? `<${v.length} chars>` : v,
        ),
      );
      fs.writeFileSync(
        `${file}.plan.json`,
        JSON.stringify(
          {
            arm,
            item: id,
            seed,
            d,
            cell,
            estimate,
            req: { path: req.path, body: strip },
          },
          null,
          1,
        ),
      );
      await save(`${file}.keyframe.png`, first);
      total += estimate;
      if (!DRY)
        tasks.push(async () => {
          const outs = await paid({
            arm,
            label: `${arm} ${id} s${seed} ${d}`,
            file,
            req: { path: req.path, body: req.body },
            estimate,
            armCap: 60,
          });
          if (outs && arm === "up184")
            for (const [i, im] of outs.entries())
              await save(`${file}.down.${i}.png`, down2(im));
          return outs;
        });
    }
  }
console.log(
  `res: ${tasks.length || "dry"} calls, estimate ${total} gens; ledger ${L.spent()} / ${L.TOTAL_CAP}`,
);
if (!DRY) await L.pool(tasks, 4);
console.log(`ledger now ${L.spent()}`);
