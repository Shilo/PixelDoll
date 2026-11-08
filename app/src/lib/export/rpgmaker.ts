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

/** The bare body's feet per walk cell in one view, measured on the body layer alone so capes and weapons cannot change it:
 *  `span` is their width near the ground (a side view's step: feet apart), `lift` the height difference between the lowest
 *  pixels left and right of the pivot (a front or back view's step, where the width stays square). Undefined on an empty cell. */
function feet(p: Project, walk: RigAnimation, dir: DirectionName): { span: number[]; lift: number[] } | undefined {
  const m = p.manifest, base = m.items.find((i) => i.id === m.rig.baseItem);
  if (!base) return;
  const rows = Math.max(3, Math.round((m.rig.cell.h * 6) / 64)), pivot = Math.round(m.rig.pivot.x), span: number[] = [], lift: number[] = [];
  for (let cell = 0; cell < walk.cells; cell++) {
    const im = composeCell(p, { [base.slot]: base.id }, walk.id, dir, cell);
    let bottom = -1, left = im.w, right = -1, lowL = -1, lowR = -1;
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3]) { bottom = y; if (x < pivot) lowL = y; else lowR = y; }
    if (bottom < 0) return;
    for (let y = Math.max(0, bottom - rows + 1); y <= bottom; y++) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3]) { left = Math.min(left, x); right = Math.max(right, x); }
    span.push(right - left + 1);
    lift.push(lowL < 0 || lowR < 0 ? 0 : Math.abs(lowL - lowR));
  }
  return { span, lift };
}

/** When a signal that peaks at both steps (twice per cycle) first peaks: the phase of that twice-per-cycle rhythm, fitted over
 *  every frame weighted by its time on screen, so one odd frame (a hem near the ground, a held pose) cannot win on its own as
 *  the widest frame would. Undefined when the rhythm is under half a pixel (no usable signal). */
function stepTime(tl: ReturnType<typeof timeline>, v: number[]): number | undefined {
  let c = 0, s = 0;
  tl.at.forEach((e, i) => {
    const ms = (tl.at[i + 1]?.t ?? tl.total) - e.t, a = (4 * Math.PI * (e.t + ms / 2)) / tl.total;
    c += v[e.cell] * ms * Math.cos(a); s += v[e.cell] * ms * Math.sin(a);
  });
  if ((2 * Math.hypot(c, s)) / tl.total < 0.5) return;
  const t = (Math.atan2(s, c) / (4 * Math.PI)) * tl.total;
  return ((t % (tl.total / 2)) + tl.total / 2) % (tl.total / 2);
}

type Gait = { strideA: number; passing: number; strideB: number; rest: number; guessed: boolean };
/** Walk frames by time: stride A, then the frames on screen a quarter (passing), half (stride B) and three quarters (the other
 *  feet-together pose) of a cycle later. Stride A, best evidence first:
 *  1. the view's own keypoints (measured, else requested): the frame whose left-ankle lead along the facing most exceeds the
 *     lead half a cycle later. Ankle gaps alone misread front and back views, where a square stance looks wide and a stride
 *     overlaps (7 of 12 bench views; the signed lead got all 12, 2026-11-08). Views of one managed template share a gait phase
 *     per frame, so they take the side view's lead, about 4x stronger;
 *  2. the side view's keypoint lead, when the walk's views share one gait phase (a template or one managed motion);
 *  3. without keypoints, the bare body's feet fitted by `stepTime`: on a phase-shared walk the side view's foot span (steps at
 *     2 and 6 on the demo and every bench, cycle and template walk tested); otherwise each view's own signal, span for side
 *     views and foot lift for front and back (an import's back view stepped at 3 and 7 while its side view stepped at 0 and 4);
 *  4. the first frame, flagged as a guess.
 *  Mirrored views use their source view's choice. */
function walkPicks(p: Project, walk: RigAnimation, dir: DirectionName): Gait {
  const m = p.manifest, tl = timeline(walk), half = tl.total / 2, quarter = tl.total / 4, src = walk.sources ?? {};
  const motions = Object.values(src).map((s) => s?.motion);
  const aligned = walk.source?.mode === 'template' || (motions.length > 0 && motions.every((x) => !!x?.startsWith('managed-') && x === motions[0]));
  const keyed = (['east', 'west'] as const).find((d) => leads(m, walk, d));
  const motion = src[dir]?.motion, shared = !!keyed && !!motion?.startsWith('managed-') && src[keyed]?.motion === motion;
  const L = leads(m, walk, shared ? keyed! : dir) ?? (keyed && aligned ? leads(m, walk, keyed) : undefined);
  let start: { cell: number; t: number } | undefined;
  if (L) start = tl.at.reduce((best, e) => (L[e.cell] - L[atTime(tl, e.t + half)] > L[best.cell] - L[atTime(tl, best.t + half)] ? e : best));
  else {
    const side = (['east', 'west'] as const).find((d) => m.rig.directions.some((x) => x.id === d && !x.mirrorOf));
    const view = aligned ? side ?? dir : dir, f = feet(p, walk, view);
    const t = f && stepTime(tl, view === 'east' || view === 'west' ? f.span : f.lift);
    if (t !== undefined) start = tl.at.findLast((e) => e.t <= t);
  }
  const s = start ?? tl.at[0];
  return { strideA: s.cell, passing: atTime(tl, s.t + quarter), strideB: atTime(tl, s.t + half), rest: atTime(tl, s.t + 3 * quarter), guessed: !start };
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
  const srcOf = (dir: DirectionName) => rig.directions.find((d) => d.id === dir)?.mirrorOf ?? dir;
  const walkDirs = walk ? new Set(moveDirs(src, walk.id)) : new Set<DirectionName>();
  const gaits = new Map(walk ? ROWS.filter((d) => walkDirs.has(d)).map((d) => [d, walkPicks(p, walk, srcOf(d))] as const) : []);
  // standing: the standing view; without it the walk's other feet-together pose (XP's passing column takes the first one);
  // a view the walk lacks takes any move that has it, so no row is left empty
  const stand = (dir: DirectionName): Pick => {
    if (standing) return { anim: standing.id, cell: 0 };
    const g = gaits.get(dir);
    if (g) return { anim: walk!.id, cell: g.rest };
    return { anim: (rig.animations.find((a) => moveDirs(src, a.id).includes(dir)) ?? rig.animations[0]).id, cell: 0 };
  };
  const picks = new Map(ROWS.map((dir) => {
    const s = stand(dir), g = gaits.get(dir);
    if (!g) return [dir, { stand: s, strideA: s, passing: s, strideB: s }] as const;
    const at = (cell: number): Pick => ({ anim: walk!.id, cell });
    return [dir, { stand: s, strideA: at(g.strideA), passing: at(g.passing), strideB: at(g.strideB) }] as const;
  }));
  if (walk && ROWS.some((d) => !walkDirs.has(d))) warnings.push(`RPG Maker: the walk has no ${ROWS.filter((d) => !walkDirs.has(d)).join(', ')} view, so those rows stand still.`);
  if ([...gaits.values()].some((g) => g.guessed)) warnings.push('RPG Maker: the walk steps could not be detected, so the first walk frame is used as a step. Check the sheet.');

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
The steps are picked from your walk move automatically, where the feet are furthest apart, with the feet-together frames between them. Feet sit on the bottom row, centered; empty space around the art is
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
