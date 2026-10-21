// S4/Q2: base animation with ALLOWED modes only.
// usage: node --env-file=../../.env s4_anim.mjs gen <tag> <baseTag> <route> <action> <dirs> [frames]
//          route: v3 | pixminimax  (managed /characters/animations, keep_first_frame=false)
//                 rawpm | rawv3    (raw /animate-pixminimax | /animate-with-text-v3, first_frame = frozen rotation padded to 64)
//        node s4_anim.mjs eval <tag> <rotPrefix> <framePrefix> <dirs>    (offline metrics for any frame set, e.g. S2 template frames)
// baseTag -> out/s4_base/<baseTag>_character.json (cid) + rotations <baseTag>_<dir>.png; or "s2b48" = S2's v3 48 base.
// Frames -> out/s4_anim/<tag>_<dir>_<i>.png ; metrics -> out/s4_anim/anim.jsonl
import fs from 'node:fs';
import { experiment, imagesOf } from './lib/run.mjs';
import { toB64, canvasTo, bbox, colors, opaqueCount } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
import { basePalette, paletteDist } from './lib/diff.mjs';
import { sheet } from './lib/sheet.mjs';
const X = experiment('s4_anim');
const [cmd, tag, ...rest] = process.argv.slice(2);

export const ACT = {
  walk: { f: 8, d: 'walking in place, a natural looping walk cycle with alternating arm and leg swings' },
  idle: { f: 4, d: 'breathing idle, standing still in place with subtle breathing, arms relaxed' },
  run: { f: 8, d: 'running in place, a looping run cycle with strong arm pumps' },
  slash: { f: 8, d: 'one-handed sword slash with the right arm (empty fist as if gripping a sword): raise the arm, swing it down and across in front of the body, then return to the starting stance' },
  // slash2: S4 saw pixminimax ADD a sword to the bare base with the 'slash' wording -> explicit unarmed variant
  slash2: { f: 8, d: 'unarmed overhead chop with the right arm: raise the empty right fist above the head, swing it down and across in front of the body, then return to the starting stance. No weapon, no sword, no props, no effects; the hands stay empty' },
  hurt: { f: 4, d: 'getting hit: flinch backward from a blow to the chest, then recover to the starting stance' },
  // hurt2: S4 saw pixminimax draw the attacker's giant fist + dust for 'hurt' -> describe only the body's own motion
  hurt2: { f: 4, d: 'the character alone recoils: torso and head jerk backward, knees bend slightly, arms flinch up, then the character recovers to the starting stance. Only this one character, no other people, no fists, no impact effects' },
  death: { f: 8, d: 'dying: knees buckle and the character falls backward to the ground and lies still' },
};
const base = t => t === 's2b48' ? { cid: '5352683c-54aa-4617-b303-e942e472c66d', rot: d => X.load(`../s2_base/b48_${d}.png`) }
  : { cid: JSON.parse(fs.readFileSync(`${X.dir}/../s4_base/${t}_character.json`)).id, rot: d => X.load(`../s4_base/${t}_${d}.png`) };
const pad64 = im => im.w === 64 ? im : canvasTo(im, 64, 64, (64 - im.w) / 2 | 0, 64 - im.h); // 48 -> x+8, y+16 (S2 rig rule)

function metrics(rot, frames) {
  const rb = bbox(rot), pal = basePalette(rot), rc = colors(rot).size;
  const fr = frames.map(f => {
    const b = bbox(f) || { x: 0, y: 0, w: 0, h: 0 }; let n = 0, far = 0, dsum = 0;
    for (let i = 0; i < f.d.length; i += 4) if (f.d[i + 3]) { n++; const d = paletteDist(pal, f.d[i], f.d[i + 1], f.d[i + 2]); dsum += d; if (d > 18) far++; }
    // managed animations come back on a larger CENTRED canvas (48 rot -> 68x68: offset 10,10), so map to rotation coords by centring
    const ox = (f.w - rot.w) / 2, oy = (f.h - rot.h) / 2;
    return { canvas: `${f.w}x${f.h}`, b, feetY: b.y + b.h - 1 - oy, cx: b.x + b.w / 2 - ox, top: b.y - oy, opaque: n, colors: colors(f).size, palDist: n ? dsum / n : 0, offPal: n ? far / n : 0 };
  });
  // body redraw: first frame vs rotation (same canvas only)
  const f0 = frames[0] && canvasTo(frames[0], rot.w, rot.h, -(frames[0].w - rot.w) / 2, -(frames[0].h - rot.h) / 2); let exact = null, iou = null;
  if (f0 && f0.w === rot.w && f0.h === rot.h) { let e = 0, o = 0, i2 = 0, u = 0; for (let i = 0; i < f0.d.length; i += 4) { const a = f0.d[i + 3] > 0, b = rot.d[i + 3] > 0; if (a && b) i2++; if (a || b) u++; if (b) { o++; if (a && f0.d[i] === rot.d[i] && f0.d[i + 1] === rot.d[i + 1] && f0.d[i + 2] === rot.d[i + 2]) e++; } } exact = +(e / o).toFixed(3); iou = +(i2 / u).toFixed(3); }
  const rng = k => { const v = fr.map(x => x[k]); return [Math.min(...v), Math.max(...v)]; };
  return { n: frames.length, canvases: [...new Set(fr.map(x => x.canvas))].join(','), rotFeetY: rb.y + rb.h - 1, feetY: rng('feetY'), cx: rng('cx').map(v => +v.toFixed(1)), rotCx: rb.x + rb.w / 2, top: rng('top'), rotTop: rb.y,
    opaqueRange: rng('opaque'), colorsMax: Math.max(...fr.map(x => x.colors)), rotColors: rc, palDist: +(fr.reduce((s, x) => s + x.palDist, 0) / fr.length).toFixed(1), offPal: +(fr.reduce((s, x) => s + x.offPal, 0) / fr.length).toFixed(3), f0ExactVsRot: exact, f0IouVsRot: iou };
}

if (cmd === 'gen') {
  const [baseTag, route, action, dirs, frames] = rest, B = base(baseTag), A = ACT[action], n = +(frames || A.f), t0 = Date.now(), recs = [];
  const save = (d, ims) => ims.forEach((im, i) => X.save(`${tag}_${d}_${i}.png`, im));
  if (route === 'v3' || route === 'pixminimax') {
    // S4: a multi-direction request is SILENTLY truncated to the free job slots (3 dirs asked -> res.directions ["south"] at
    // the 22-job cap), so ask one direction per call and extend the same animation group.
    let group = null; var meta = { usage: [], jobMs: 0 };
    for (const d of dirs.split(',')) {
      const body = { character_id: B.cid, mode: route, animation_name: tag, action_description: A.d, frame_count: n, keep_first_frame: false, directions: [d], seed: 7, ...(group ? { animation_group_id: group } : {}) };
      const t1 = Date.now(), r = await X.api.run('/characters/animations', body); group = r.res.animation_group_id;
      if (!(r.res.directions || []).includes(d)) { console.log('TRUNCATED', d, JSON.stringify(r.res.directions)); continue; }
      X.saveJson(`${tag}_${d}_job.json`, { res: r.res, jobs: r.jobs.map(j => ({ ...j, last_response: { ...j.last_response, images: undefined, storage_urls: undefined } })) });
      const ch = await X.api.get(`/characters/${B.cid}`);
      const dd = ch.animations.find(a => a.animation_group_id === group).directions.find(x => x.direction === d);
      const ims = []; for (const u of dd.frames) ims.push((await imagesOf(u))[0].im); save(d, ims);
      recs.push({ dir: d, ims, usage: r.jobs.map(j => j.usage), ms: Date.now() - t1 });
    }
  } else {
    var meta = { usage: [], jobMs: 0 };
    await Promise.all(dirs.split(',').map(async d => {
      const F = pad64(B.rot(d)), t1 = Date.now();
      const r = route === 'rawpm'
        ? await X.api.run('/animate-pixminimax', { first_frame: b64img(toB64(F)), description: `${A.d}; start moving on the first frame`, frame_count: n, seed: 7, no_background: true, direction: d, view: 'low top-down', subject_description: 'a bald human mannequin in a plain grey t-shirt and grey shorts, barefoot', initial_pose: 'standing upright, arms slightly away from the torso' })
        : await X.api.run('/animate-with-text-v3', { first_frame: b64img(toB64(F)), action: `${A.d}, facing ${d}`, frame_count: n, seed: 7, no_background: true });
      const ims = (await imagesOf(r.jobs[0].last_response, { w: 64, h: 64 })).map(x => x.im);
      save(d, ims.slice(1)); recs.push({ dir: d, ims: ims.slice(1), echoExact: ims[0].d.every((v, i) => v === F.d[i] || (!F.d[i - (i % 4) + 3] && !ims[0].d[i - (i % 4) + 3])), returned: ims.length, usage: r.jobs[0].usage, ms: Date.now() - t1 });
    }));
  }
  const rows = [];
  for (const x of recs) {
    const rot = route.startsWith('raw') ? pad64(B.rot(x.dir)) : B.rot(x.dir);
    rows.push([rot, ...x.ims]);
    const m = { tag, base: baseTag, route, action, dir: x.dir, requested: n, ...metrics(rot, x.ims), echoExact: x.echoExact, returned: x.returned, usage: x.usage ?? meta.usage, ms: x.ms ?? meta.jobMs };
    fs.appendFileSync(`${X.dir}/anim.jsonl`, JSON.stringify(m) + '\n'); console.log(JSON.stringify(m));
  }
  X.save(`${tag}_sheet.png`, sheet(rows, { s: 3 }));
  console.log('total ms', Date.now() - t0);
} else if (cmd === 'eval') {
  const [rotPrefix, framePrefix, dirs] = rest, rows = [];
  for (const d of dirs.split(',')) {
    const rot = X.load(`../${rotPrefix}_${d}.png`), ims = []; for (let i = 0; fs.existsSync(`${X.dir}/../${framePrefix}_${d}_${i}.png`); i++) ims.push(X.load(`../${framePrefix}_${d}_${i}.png`));
    rows.push([rot, ...ims]); const m = { tag, route: 'eval', dir: d, ...metrics(rot, ims) };
    fs.appendFileSync(`${X.dir}/anim.jsonl`, JSON.stringify(m) + '\n'); console.log(JSON.stringify(m));
  }
  X.save(`${tag}_sheet.png`, sheet(rows, { s: 3 }));
}
