// Round 9 step 1: body moves from PixelLab's text models (raw, first frame = the body's rest view, 80 px), S and E.
// Usage (spikes/api): node --env-file=<repo root>/.env x28/body.mts <model pm|v3> <dirs comma> <seeds comma> <move ids...>
import { b64, call, BODY, SEED, OUT, spent, TOTAL_CAP, pool } from './lib.mts';

const SUBJECT = 'a bald bare-skinned human man, barefoot, empty hands';
const ALONE = 'only this one character, empty hands, no weapon, no props, no other people, no effects';
export const MOVES: Record<string, { n: number; text: string; last?: boolean }> = {
  idle: { n: 8, text: `breathing idle: the chest rises and falls, shoulders lift slightly, arms sway a little, feet stay planted; ${ALONE}` },
  walk: { n: 8, text: `walking in place, a full stride cycle with arms swinging opposite the legs; ${ALONE}` },
  run: { n: 8, text: `running in place, a full stride cycle, knees high, arms pumping; ${ALONE}` },
  attack: { n: 8, text: `unarmed overhead chop with the right arm: raise the empty right fist above the head, swing it down and across in front of the body, then return to the starting stance; ${ALONE}` },
  hurt: { n: 8, text: `the character alone recoils from a blow to the chest: torso and head jerk backward, knees bend slightly, arms flinch up, then the character recovers to the starting stance; ${ALONE}` },
  // round 9b: hold the facing (both models turned the body away mid-attack), a livelier idle
  attack_f: { n: 8, text: `unarmed overhead chop with the right arm, the body keeps facing the same way the whole time: raise the empty right fist above the head, swing it down and across in front of the body, then return to the starting stance; ${ALONE}` },
  attack_l: { n: 8, last: true, text: `unarmed overhead chop with the right arm, the body keeps facing the same way the whole time: raise the empty right fist above the head, swing it down hard in front of the body, then return to the starting stance; ${ALONE}` },
  idle_b: { n: 8, text: `idle: clearly visible deep breathing, the chest and shoulders rise and fall by two pixels, the head bobs gently, the arms sway slightly, feet stay planted, same facing the whole time; ${ALONE}` },
  idle_s: { n: 8, text: `combat-ready idle stance: knees slightly bent, weight shifting gently from foot to foot, fists loose at the sides, a slow rhythmic bounce, same facing the whole time; ${ALONE}` },
  die: { n: 8, text: `knees buckle and the character falls to the ground and lies still, whole body visible; ${ALONE}` },
};

export async function body(model: 'pm' | 'v3', move: string, d: string, seed = SEED) {
  const m = MOVES[move], first = { type: 'base64', base64: await b64(await BODY.rest(d)), format: 'png' }, last = m.last ? { last_frame: first } : {};
  const req = model === 'pm'
    ? { path: '/animate-pixminimax', body: { first_frame: first, description: m.text, frame_count: m.n, seed, no_background: true, ...last, direction: d, view: 'low top-down', subject_description: SUBJECT, initial_pose: 'standing upright, arms at the sides' } }
    : { path: '/animate-with-text-v3', body: { first_frame: first, action: `${m.text}; facing ${d}`, frame_count: m.n, seed, no_background: true, ...last } };
  return call({ arm: `B${model}`, label: `body ${model} ${move} ${d} s${seed}`, file: `${OUT}/B/${model}_${move}${seed === SEED ? '' : `_s${seed}`}_${d}`, req, estimate: model === 'pm' ? 1 : 4, armCap: 400 });
}

if (import.meta.main) {
  const [model, dirs, seeds, ...moves] = process.argv.slice(2);
  await pool(moves.flatMap((mv) => dirs.split(',').flatMap((d) => seeds.split(',').map((s) => () => body(model as any, mv, d, +s)))), 12);
  console.log(`spent ${spent()} / ${TOTAL_CAP}`);
}
