// Round 8 move catalog: CC0 mocap clips (Quaternius UAL1) as skeleton-v3 keypoint sequences, with the retarget knobs per move.
// Free preview of every sequence: node x27/moves.mts [id-filter] (spikes/api) -> out/mocap/x27/<id>_<dir>.png
import fs from 'node:fs';
import { build, span, strip, OUT, type At, type Opts, type Dir } from '../mocap/mocap.mts';

export interface Move { id: string; action: string; frames: At[]; opts?: Opts; ms?: number | number[] }
const cat = (...parts: At[][]) => parts.flat();
const at = (anim: string, times: number[]): At[] => times.map((t) => [anim, t]);
/** Sprite defaults: keep facing, half the twist and lean, half the travel. */
const SPRITE: Opts = { face: 1, twist: 0.5, lean: 0.6, travel: 0.5 };

export const MOVES: Move[] = [
  // idles: the plain loop moves under 2 px, so try it amplified, plus livelier sources
  { id: 'idle', action: 'breathing idle', frames: span('Idle_Loop', 8), opts: { ...SPRITE } , ms: 160 },
  { id: 'idle_g3', action: 'breathing idle', frames: span('Idle_Loop', 8), opts: { ...SPRITE, gain: 3 }, ms: 160 },
  { id: 'idle_sword', action: 'fighting stance idle', frames: span('Sword_Idle', 8), opts: { ...SPRITE, gain: 1.5 }, ms: 130 },
  { id: 'idle_tired', action: 'tired idle, catching breath', frames: span('Idle_Tired_Loop', 8), opts: { ...SPRITE }, ms: 140 },
  // locomotion
  { id: 'walk', action: 'walking', frames: span('Walk_Loop', 8), opts: { ...SPRITE }, ms: 110 },
  { id: 'run', action: 'running', frames: span('Jog_Fwd_Loop', 8), opts: { ...SPRITE }, ms: 90 },
  { id: 'sprint', action: 'sprinting', frames: span('Sprint_Loop', 8), opts: { ...SPRITE }, ms: 80 },
  { id: 'jump', action: 'jumping', frames: cat(span('Jump_Start', 4, 0.3, 1.33, true), span('Jump_Loop', 2, 0, 1.2), span('Jump_Land', 4, 0, 0.9, true)), opts: { ...SPRITE }, ms: 100 },
  // attacks
  { id: 'slash_raw', action: 'sword slash', frames: span('Sword_Attack', 10, 0, 1.4, true), opts: {}, ms: 90 },
  { id: 'slash', action: 'sword slash', frames: span('Sword_Attack', 10, 0, 1.4, true), opts: { ...SPRITE }, ms: 90 },
  // key poses: wind-up 0.1-0.33, strike 0.33-0.5 (hand 1.59 m -> 0.53 m), hold, guard back; the even spacing above misses the strike
  { id: 'slash_k', action: 'sword slash', frames: at('Sword_Attack', [0.1, 0.2, 0.28, 0.33, 0.37, 0.4, 0.44, 0.5, 0.62, 0.85, 1.1, 1.4]), opts: { ...SPRITE }, ms: [70, 70, 80, 120, 50, 50, 60, 140, 100, 90, 90, 90] },
  { id: 'slash_k_soft', action: 'sword slash', frames: at('Sword_Attack', [0.1, 0.2, 0.28, 0.33, 0.37, 0.4, 0.44, 0.5, 0.62, 0.85, 1.1, 1.4]), opts: { face: 1, twist: 0.3, lean: 0.4, travel: 0.3, legs: 0.5 }, ms: [70, 70, 80, 120, 50, 50, 60, 140, 100, 90, 90, 90] },
  { id: 'slash_ks_soft', action: 'sword slash', frames: at('Sword_Attack_Standing', [0.1, 0.2, 0.27, 0.33, 0.37, 0.4, 0.44, 0.5, 0.62, 0.85, 1.1, 1.4]), opts: { face: 1, twist: 0.3, lean: 0.4, travel: 0.3, legs: 0.5 }, ms: [70, 70, 80, 120, 50, 50, 60, 140, 100, 90, 90, 90] },
  { id: 'punch', action: 'punch', frames: span('Punch_Cross', 8, 0, 1, true), opts: { ...SPRITE }, ms: 90 },
  { id: 'jab', action: 'quick jab punch', frames: span('Punch_Jab', 6, 0, 0.87, true), opts: { ...SPRITE }, ms: 90 },
  { id: 'kick', action: 'kick', frames: span('Kick', 8, 0, 1.1, true), opts: { ...SPRITE }, ms: 90 },
  { id: 'cast', action: 'casting a spell', frames: cat(span('Spell_Simple_Enter', 3, 0, 0.53, true), span('Spell_Simple_Shoot', 4, 0, 0.5, true), span('Spell_Simple_Exit', 3, 0, 0.43, true)), opts: { ...SPRITE }, ms: 100 },
  // reactions
  { id: 'hurt', action: 'getting hit, flinching', frames: cat([['Idle_Loop', 0]], span('Hit_Chest', 5, 0, 0.33, true)), opts: { ...SPRITE, lean: 1 }, ms: 100 },
  { id: 'hurt_head', action: 'getting hit in the head, flinching', frames: cat([['Idle_Loop', 0]], span('Hit_Head', 5, 0, 0.43, true)), opts: { ...SPRITE, lean: 1 }, ms: 100 },
  { id: 'die', action: 'dying, falling to the ground', frames: span('Death01', 10, 0, 2.4, true), opts: { face: 1, twist: 0.5, lean: 1, travel: 0.6 }, ms: 120 },
  { id: 'die2', action: 'dying, collapsing to the ground', frames: span('Death02', 10, 0, 2.47, true), opts: { face: 1, twist: 0.5, lean: 1, travel: 0.6 }, ms: 120 },
];

export const seq = (m: Move, dir: Dir) => build(m.frames, dir, m.opts);

if (import.meta.main) {
  const f = process.argv[2];
  for (const m of MOVES.filter((m) => !f || m.id.includes(f))) for (const d of ['south', 'east'] as Dir[]) {
    const r = seq(m, d);
    await strip(`${OUT}/x27/${m.id}_${d}.png`, r.rest, r.frames);
    fs.writeFileSync(`${OUT}/x27/${m.id}_${d}.json`, JSON.stringify(r.frames));
    console.log(m.id.padEnd(12), d.padEnd(6), r.frames.length, 'frames, shift', r.meta.shift);
  }
}
