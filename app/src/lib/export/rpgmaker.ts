// RPG Maker character sheets (docs/research/rpg-maker-export-2026-11-07.md). RPG Maker draws one baked image per character, so
// each outfit becomes a composite walking sheet. Two layouts cover the versions that import custom art, one export card each:
// MZ, MV, VX Ace and VX read a "$name.png" single-character sheet of 3 × 4 cells; XP (and Pokémon Essentials) reads "name.png"
// with 4 × 4 cells. Rows are down, left, right, up. Every engine derives the cell from the image size, so cells stay at the
// character's native size (no scaling).
import { makeImg, type Img } from '../image/png.ts';
import { bakedFrame, composeCell, over, type Frame } from '../compose/compose.ts';
import { DEFAULT_MOVE, type DirectionName, type RigAnimation } from '../rig/rig.ts';
import { moveWords, WALK_WORDS } from '../rig/clips.ts';
import { moveDirs } from '../dress/dress.ts';
import type { Manifest, Project } from '../store/manifest.ts';
import { outfitProject, type OutFile } from './generic.ts';

const ROWS: DirectionName[] = ['south', 'west', 'east', 'north'];
type Pick = { anim: string; cell: number };

/** Playback order: (cell, start ms) per playlist entry, and the loop length. */
function timeline(a: RigAnimation): { at: { cell: number; t: number }[]; total: number } {
  const frames = a.frames.length ? a.frames : Array.from({ length: a.cells }, (_, cell) => ({ cell, ms: 100 }));
  let t = 0;
  const at = frames.map((f) => { const e = { cell: f.cell, t }; t += f.ms; return e; });
  return { at, total: t };
}
/** The cell on screen at time t (wrapping), so a held frame wins over a short one starting near t. */
const atTime = (tl: ReturnType<typeof timeline>, t: number) => {
  const want = ((t % tl.total) + tl.total) % tl.total;
  return tl.at.findLast((e) => e.t <= want)!.cell;
};

/** Screen direction a view faces: a stride shows as the leading ankle ahead along it. */
const FORWARD: Partial<Record<DirectionName, [number, number]>> = { east: [1, 0], west: [-1, 0], south: [0, 1], north: [0, -1] };
/** Left ankle ahead of the right along the view's facing, in px per cell, from the keypoints measured on the frames when they
 *  have both ankles on every cell, else the requested ones; undefined when neither does. */
function leads(m: Manifest, walk: RigAnimation, dir: DirectionName): number[] | undefined {
  const f = FORWARD[dir], src = walk.sources?.[dir];
  if (!f) return;
  const of = (keys?: { label: string; x: number; y: number }[][]) => {
    if (keys?.length !== walk.cells) return;
    const out = keys.map((k) => {
      const l = k.find((q) => q.label === 'LEFT LEG'), r = k.find((q) => q.label === 'RIGHT LEG');
      return l && r ? (l.x - r.x) * f[0] * m.rig.cell.w + (l.y - r.y) * f[1] * m.rig.cell.h : NaN;
    });
    return out.some(Number.isNaN) ? undefined : out;
  };
  return of(src?.measured) ?? of(src?.keypoints);
}

/** Walk frames by time, never by pixels: the left-foot stride (the frame whose lead most exceeds the lead half a cycle later),
 *  then the frames on screen a quarter and half a cycle later. Ankle gaps alone misread front and back views, where a square
 *  stance looks wide and a stride overlaps (7 of 12 bench views, south, east and north of 4 bodies; the signed lead got all 12,
 *  2026-11-08). Views of one managed template share a gait phase per frame, so they take the side view's phase, whose signal
 *  is about 4x stronger.
 *  Without keypoints the first frame stands in for the stride. Mirrored views use their source view's choice. */
function walkPicks(m: Manifest, walk: RigAnimation, dir: DirectionName): { strideA: number; passing: number; strideB: number } {
  const tl = timeline(walk), half = tl.total / 2, src = walk.sources ?? {};
  const side = (['east', 'west'] as const).find((d) => leads(m, walk, d));
  const motion = src[dir]?.motion, shared = !!side && !!motion?.startsWith('managed-') && src[side]?.motion === motion;
  const L = leads(m, walk, shared ? side! : dir);
  const score = (e: { cell: number; t: number }) => L![e.cell] - L![atTime(tl, e.t + half)];
  const start = L ? tl.at.reduce((best, e) => (score(e) > score(best) ? e : best)) : tl.at[0];
  return { strideA: start.cell, passing: atTime(tl, start.t + tl.total / 4), strideB: atTime(tl, start.t + half) };
}

/** ASCII file name parts: accents dropped (é → e), other characters → _. */
const safeName = (s: string) => s.normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
/** Windows cannot extract files named like devices (CON.png). */
const notDevice = (name: string) => (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name) ? `${name}_` : name);

export type RpgLayout = 'vx' | 'xp';

/** The move RPG Maker sheets take their steps from: the first whose id has a walk word. */
export const walkMove = (rig: { animations: RigAnimation[] }) =>
  rig.animations.find((a) => a.id !== DEFAULT_MOVE && moveWords(a.id).some((w) => WALK_WORDS.includes(w)));

/** One sheet per outfit in `layout`, at the zip root, plus a README; or an Error whose message starts with "RPG Maker: ".
 *  Moves, views and keypoints come from the source project (the exported manifest drops cells); outfits, colors and the
 *  baked frame from the exported manifest `m`. */
export function rpgMakerFiles(p: Project, m: Manifest, layout: RpgLayout): { files: OutFile[]; warnings: string[] } {
  const src = p.manifest, { rig } = src, have = new Set(rig.directions.map((d) => d.id)), missing = ROWS.filter((d) => !have.has(d));
  if (missing.length) throw new Error(`RPG Maker: characters need front, side and back views; this one has no ${missing.join(', ')} view.`);
  const warnings: string[] = [];
  const standing = rig.animations.find((a) => a.id === DEFAULT_MOVE);
  const walk = walkMove(rig);
  if (!walk) warnings.push('RPG Maker: no walk move, so the sheets stand still. Add a walk move to animate them.');
  const stand = (dir: DirectionName): Pick => (standing ? { anim: standing.id, cell: 0 } : walk ? { anim: walk.id, cell: walkPicks(src, walk, srcOf(dir)).passing } : { anim: rig.animations[0].id, cell: 0 });
  const srcOf = (dir: DirectionName) => rig.directions.find((d) => d.id === dir)?.mirrorOf ?? dir;
  const walkDirs = walk ? new Set(moveDirs(src, walk.id)) : new Set<DirectionName>();
  const picks = new Map(ROWS.map((dir) => {
    const s = stand(dir);
    if (!walk || !walkDirs.has(dir)) return [dir, { stand: s, strideA: s, passing: s, strideB: s }] as const;
    const w = walkPicks(src, walk, srcOf(dir)), at = (cell: number): Pick => ({ anim: walk.id, cell });
    return [dir, { stand: s, strideA: at(w.strideA), passing: at(w.passing), strideB: at(w.strideB) }] as const;
  }));
  if (walk && ROWS.some((d) => !walkDirs.has(d))) warnings.push(`RPG Maker: the walk has no ${ROWS.filter((d) => !walkDirs.has(d)).join(', ')} view, so those rows stand still.`);

  const f = bakedFrame(m), files: OutFile[] = [], used = new Set<string>();
  const name = safeName(m.name) || 'character';
  for (const [i, pr] of m.presets.entries()) {
    // the first preset is the current look (Export sheet) or the default outfit: the plain character name
    const op = outfitProject(p, m, pr), want = i ? `${name}_${safeName(pr.name) || safeName(pr.id) || 'outfit'}` : name;
    let base = notDevice(want);
    for (let n = 2; used.has(base.toLowerCase()); n++) base = notDevice(`${want}_${n}`);
    used.add(base.toLowerCase());
    const cell = (k: Pick, dir: DirectionName) => composeCell(op, pr.items, k.anim, dir, k.cell, f);
    const grid = ROWS.map((dir) => { const k = picks.get(dir)!; return { a: cell(k.strideA, dir), s: cell(k.stand, dir), m: cell(k.passing, dir), b: cell(k.strideB, dir) }; });
    const { out, below } = place(f, grid.flatMap((g) => [g.a, g.s, g.m, g.b]));
    // walk frames often dip a pixel or two below the standing feet line: kept, and only a larger drop is worth a note
    if (below > 2) warnings.push(`RPG Maker: ${base} has ${below} px below the feet, so it stands ${below} px higher on the map.`);
    const sheet = (cols: (g: (typeof grid)[number]) => Img[]) => {
      const rows = grid.map(cols), w = out.w, h = out.h, o = makeImg(rows[0].length * w, rows.length * h);
      rows.forEach((r, y) => r.forEach((im, x) => over(o, out.cut(im), x * w, y * h)));
      return o;
    };
    files.push(layout === 'vx'
      ? { name: `$${base}.png`, data: sheet((g) => [g.a, g.s, g.b]) } // shown 1, 2, 1, 0: standing, step, standing, other step
      : { name: `${base}.png`, data: sheet((g) => [g.s, g.a, g.m, g.b]) }); // shown 0, 1, 2, 3
  }
  files.push({ name: 'README.txt', data: (layout === 'vx' ? `Copy the PNG files into img/characters (RPG Maker MZ, MV) or Graphics/Characters (VX Ace, VX), then pick one as an
actor or event image. One sheet per outfit; the "$" prefix tells the engine the image holds one character.
Rows: down, left, right, up. The middle column is the standing frame, the outer ones are walk steps.
MZ and MV use 48 px tiles, VX Ace and VX 32 px tiles; their built-in characters are about one tile tall.
` : `Copy the PNG files into Graphics/Characters (RPG Maker XP or Pokemon Essentials), then pick one as an actor or event image.
One sheet per outfit. Rows: down, left, right, up. The first column is the standing frame, then step, passing, other step.
XP uses 32 px tiles; its built-in characters are 32 x 48.
`) + `Sheets keep your character's own size (PixelDoll never scales pixel art): a larger Body stands taller than built-in characters.
The steps come from your walk move: the left-foot step from the skeleton, the others a quarter and half a cycle later. Feet sit on the bottom row, centered; empty space around the art is
trimmed, so speech balloons sit just above the head. Diagonal views, idle and action moves have no place in this format.
project.json and cells/ are PixelDoll's editable copy (Import it to keep working); the game does not need them.
` });
  return { files, warnings };
}

/** One cell for every frame, trimmed to the art: the pivot centered on an even width, the top at the highest opaque row
 *  (MV and MZ place balloons from the sprite's height), and the feet line (or anything lower) on the bottom row. */
function place(f: Frame, cells: Img[]): { out: { w: number; h: number; cut: (im: Img) => Img }; below: number } {
  const px = Math.round(f.x), feet = Math.ceil(f.y);
  let lowest = 0, top = feet, reach = 1;
  for (const im of cells) for (let p = 0; p < im.w * im.h; p++) if (im.data[p * 4 + 3]) {
    const x = p % im.w, y = (p / im.w) | 0;
    lowest = Math.max(lowest, y + 1); top = Math.min(top, y); reach = Math.max(reach, px - x, x + 1 - px);
  }
  const bottom = Math.max(feet, lowest), w = 2 * reach, h = bottom - top;
  const cut = (im: Img) => { const o = makeImg(w, h); over(o, im, reach - px, -top); return o; };
  return { out: { w, h, cut }, below: bottom - feet };
}
