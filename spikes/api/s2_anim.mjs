// S2/X4: animate an S2 base with a template; frames -> out/s2_base/<name>_<dir>_<i>.png. usage: s2_anim.mjs <cid> <template> <name> template <dirs>
import { experiment, imagesOf } from './lib/run.mjs';
import { sheet } from './lib/sheet.mjs';
import { bbox, opaqueCount } from './lib/img.mjs';
import { maskExact } from './lib/diff.mjs';
const X = experiment('s2_base');
const [cid, tpl, name, mode = 'template', dirs = 'south,east'] = process.argv.slice(2);
const body = { character_id: cid, mode, animation_name: name, directions: dirs.split(',') };
if (mode === 'template') body.template_animation_id = tpl; else { body.action_description = tpl; body.frame_count = 8; }
const r = await X.costed(`${name} ${mode} ${tpl} ${dirs}`, () => X.api.run('/characters/animations', body));
r.jobs.forEach((j, i) => X.saveJson(`${name}_job_${i}.json`, j));
const ch = await X.api.get(`/characters/${cid}`);
X.saveJson(`${name}_character.json`, ch);
const anim = ch.animations.filter(a => a.animation_group_id === r.res.animation_group_id);
const rows = [];
for (const a of anim) for (const d of a.directions) {
  const frames = [];
  for (let i = 0; i < d.frames.length; i++) { const [{ im }] = await imagesOf(d.frames[i]); X.save(`${name}_${d.direction}_${i}.png`, im); frames.push(im); }
  // stability: pixels identical across all frames
  const n = frames[0].w * frames[0].h; let stable = 0, opaqueStable = 0;
  const changedAny = new Uint8Array(n); for (let i = 1; i < frames.length; i++) { const m = maskExact(frames[0], frames[i]); for (let p = 0; p < n; p++) changedAny[p] |= m[p]; }
  for (let p = 0; p < n; p++) if (!changedAny[p]) { stable++; if (frames[0].d[p * 4 + 3]) opaqueStable++; }
  console.log(JSON.stringify({ dir: d.direction, frames: frames.length, size: `${frames[0].w}x${frames[0].h}`, bboxes: frames.map(f => bbox(f)).map(b => `${b.x},${b.y},${b.w}x${b.h}`), opaque0: opaqueCount(frames[0]), opaqueStableAcrossFrames: opaqueStable }));
  rows.push(frames);
}
X.save(`${name}_sheet.png`, sheet(rows));
console.log(JSON.stringify({ group: r.res.animation_group_id, submitMs: r.submitMs, totalMs: r.totalMs, jobKeys: Object.keys(r.jobs[0].last_response || {}) }));
