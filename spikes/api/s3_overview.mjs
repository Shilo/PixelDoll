// S3: overview contact sheets for the report (offline). Rows = clips, first cell = the reference rotation.
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { canvasTo } from './lib/img.mjs';
import { sheet } from './lib/sheet.mjs';
const X = experiment('s3_overview');
const clip = (dir, pre) => { const o = []; for (let i = 0; fs.existsSync(`${X.dir}/../${dir}/${pre}_${i}.png`); i++) o.push(X.load(`../${dir}/${pre}_${i}.png`)); return o; };
const rot = d => canvasTo(X.load(`../s2_base/b48_${d}.png`), 64, 64, 8, 16);
const row = (pre, d, dir = 's3_k1') => [rot(d), ...clip(dir, pre)];
X.save('k1_v3_actions.png', sheet(['slash_south', 'slash_east', 'slash_north', 'cast_south', 'cast_east', 'hurt_south', 'hurt_east', 'death_south', 'death_east', 'death_north'].map(n => row(`${n}_v3_s7`, n.split('_')[1])), { s: 3 }));
X.save('k1_routes_slash_south.png', sheet([row('slash_south_v3_s7', 'south'), row('slash_south_v3_s11', 'south'), row('slash_south_legacy_s7', 'south'), row('slash_south_text_s7', 'south'), row('slash_south_charv3_s7', 'south')], { s: 3 }));
X.save('k1_retarget.png', sheet([row('walk_south_v3tpl_s7', 'south'), row('walk_east_v3tpl_s7', 'east'), row('walk_north_v3tpl_s7', 'north'), row('punch_south_v3tpl_s7', 'south'), row('walking-8-frames_south_charsk_s7', 'south'), row('falling-back-death_south_charsk_s7', 'south'), row('taking-punch_south_charsk_s7', 'south')], { s: 3 }));
