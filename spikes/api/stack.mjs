// stack several sheet PNGs vertically for viewing: node stack.mjs out.png a.png b.png ...
import fs from 'node:fs'; import { decode, encode, make, blit } from './lib/img.mjs';
const [o, ...fs_] = process.argv.slice(2); const ims = fs_.map(f => decode(fs.readFileSync(f)));
const S = make(Math.max(...ims.map(i => i.w)), ims.reduce((a, i) => a + i.h, 0)); let y = 0; for (const i of ims) { blit(S, i, 0, y); y += i.h; }
fs.writeFileSync(o, encode(S));
