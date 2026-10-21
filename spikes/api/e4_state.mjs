// E4-state: create-character-state (helmet) on the base character, animate the state with the same template, diff vs base anim.
import { experiment, imagesOf } from './lib/run.mjs';
import { sheet } from './lib/sheet.mjs';
import { bbox } from './lib/img.mjs';
import { maskExact, heatmap, layerFrom, layerStats, paletteJaccard } from './lib/diff.mjs';
import { VARIANTS } from './lib/extract.mjs';
const X = experiment('e4_state');
const BASE = 'f6a0bdc5-354e-4682-8df3-55fc3d118737';
const st = await X.costed('create-character-state helmet', () => X.api.run('/create-character-state', { character_id: BASE, edit_description: 'wearing a simple grey steel knight helmet, face visible; everything else unchanged', use_color_palette_from_reference: true, seed: 7 }));
const sid = st.res.character_id; console.log('state', sid, st.totalMs + 'ms');
const sch = await X.api.get(`/characters/${sid}`); X.saveJson('state_character.json', sch);
const rot = [];
for (const [d, u] of Object.entries(sch.rotation_urls || {})) if (u) { const [{ im }] = await imagesOf(u); X.save(`state_rot_${d}.png`, im); if (['south', 'east'].includes(d)) rot.push([d, im]); }
for (const [d, im] of rot) { const B = X.load(`../e1_base/v3_${d}.png`); console.log('rotation', d, `${im.w}x${im.h}`, 'changedVsBaseRotation', maskExact(B, im).reduce((a, b) => a + b, 0), 'bbox', JSON.stringify(bbox(B)), JSON.stringify(bbox(im))); }
const an = await X.costed('animate state walking-8-frames', () => X.api.run('/characters/animations', { character_id: sid, mode: 'template', template_animation_id: 'walking-8-frames', animation_name: 'walk', directions: ['south', 'east'] }));
const ch = await X.api.get(`/characters/${sid}`);
const a = ch.animations.find(x => x.animation_group_id === an.res.animation_group_id);
const rows = [];
for (const d of a.directions) {
  const r0 = [], r1 = [], r2 = [], r3 = []; let L0;
  for (let i = 0; i < d.frames.length; i++) {
    const [{ im: C }] = await imagesOf(d.frames[i]); X.save(`state_walk_${d.direction}_${i}.png`, C);
    const B = X.load(`../e2_anim/walk_${d.direction}_${i}.png`);
    const ex = maskExact(B, C).reduce((x, y) => x + y, 0), bb = bbox(B), bc = bbox(C);
    const L = layerFrom(C, VARIANTS.novel_cc(B, C, { x: 0, y: 0, w: 64, h: 24 })), s = layerStats(L); L0 ??= s;
    console.log(d.direction, i, `${C.w}x${C.h}`, 'changed', ex, 'bboxBase', `${bb.x},${bb.y},${bb.w}x${bb.h}`, 'bboxState', `${bc.x},${bc.y},${bc.w}x${bc.h}`, 'headLayerPx', s.area, 'palJ0', paletteJaccard(s.palette, L0.palette));
    r0.push(B); r1.push(C); r2.push(heatmap(B, C)); r3.push(L);
  }
  rows.push(r0, r1, r2, r3);
}
X.save('state_vs_base_sheet.png', sheet(rows, { s: 3 }));
