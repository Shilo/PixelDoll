// PixelDoll identity study: the P has a head counter and an open lower-right
// body space. No P pixels sit to the right of the torso. Run this file with Node.
import { writeFileSync } from 'node:fs';

const SIZE = 32;
const themes = {
  dark: '#f2eee6',
  light: '#25282d',
};

const inside = (x, y, left, top, right, bottom) => x >= left && x < right && y >= top && y < bottom;

const versions = [
  { id: 'square', name: 'Square P', note: 'The simplest open-right construction.', cap: 'square', head: 'square', stem: [6, 8] },
  { id: 'soft-cap', name: 'Soft Cap', note: 'A softened P outside, square head inside.', cap: 'soft', head: 'square', stem: [6, 8] },
  { id: 'cut-cap', name: 'Cut Cap', note: 'A crisp paper-cut corner.', cap: 'cut', head: 'square', stem: [6, 8] },
  { id: 'pixel-cap', name: 'Pixel Cap', note: 'Small pixel steps on the P curve.', cap: 'pixel', head: 'square', stem: [6, 8] },
  { id: 'soft-head', name: 'Soft Head', note: 'Rounded corners only in the head counter.', cap: 'square', head: 'soft', stem: [6, 8] },
  { id: 'cut-head', name: 'Cut Head', note: 'Chamfered head within a plain P.', cap: 'square', head: 'cut', stem: [6, 8] },
  { id: 'wide-bowl', name: 'Wide Bowl', note: 'More air on both sides of the head.', cap: 'wide', head: 'square', stem: [6, 8] },
  { id: 'tight-bowl', name: 'Tight Bowl', note: 'A condensed P around the same figure.', cap: 'tight', head: 'square', stem: [6, 8] },
  { id: 'thin-spine', name: 'Thin Spine', note: 'A lighter P stem beside the open torso.', cap: 'square', head: 'square', stem: [5, 7] },
  { id: 'bold-spine', name: 'Bold Spine', note: 'A thicker left side survives at 16 px.', cap: 'square', head: 'square', stem: [7, 9] },
  { id: 'high-head', name: 'High Head', note: 'More room between head and shoulders.', cap: 'soft', head: 'square', headTop: 4, headBottom: 13, stem: [6, 8] },
  { id: 'low-head', name: 'Low Head', note: 'A closer head-to-shoulder relationship.', cap: 'soft', head: 'square', headTop: 6, headBottom: 15, stem: [6, 8] },
  { id: 'broad-shoulders', name: 'Broad Shoulders', note: 'The shoulder opening reaches farther left.', cap: 'square', head: 'square', shoulderLeft: 5, stem: [5, 8] },
  { id: 'narrow-shoulders', name: 'Narrow Shoulders', note: 'A little more P survives below the head.', cap: 'square', head: 'square', shoulderLeft: 8, stem: [7, 9], torsoLeft: 9 },
  { id: 'tapered-left', name: 'Tapered Left', note: 'A one-step waist transition, no feet.', cap: 'cut', head: 'soft', stem: [6, 9], torsoLeft: 9 },
  { id: 'balanced', name: 'Balanced', note: 'Rounded P, square head, calm proportions.', cap: 'soft', head: 'square', stem: [7, 9], shoulderLeft: 7, torsoLeft: 9 },
];

function capRight(y, type) {
  if (type === 'soft') return y <= 2 ? 23 : y <= 3 ? 27 : y >= 15 ? 30 - (y - 15) * 2 : 30;
  if (type === 'cut') return y <= 2 ? 24 : y <= 4 ? 27 : y >= 16 ? 28 : 30;
  if (type === 'pixel') return y <= 3 ? 26 : y <= 5 ? 29 : y >= 16 ? 28 : 30;
  if (type === 'wide') return 32;
  if (type === 'tight') return 28;
  return 30;
}

function positiveP(x, y, version) {
  const shoulderLeft = version.shoulderLeft ?? 6;
  const torsoLeft = version.torsoLeft ?? 8;
  const stemRight = y < 22 ? version.stem[0] : version.stem[1];
  const outer = (inside(x, y, 2, 2, capRight(y, version.cap), 18)) ||
    (inside(x, y, 2, 18, stemRight, SIZE));
  if (!outer) return false;

  const headTop = version.headTop ?? 5;
  const headBottom = version.headBottom ?? 14;
  let head = inside(x, y, 12, headTop, 24, headBottom);
  if ((version.head === 'soft' || version.head === 'cut') && head && (y === headTop || y === headBottom - 1)) {
    head = x >= (version.head === 'soft' ? 14 : 13) && x < (version.head === 'soft' ? 22 : 23);
  }
  const shoulders = inside(x, y, shoulderLeft, 17, SIZE, 22);
  const torso = inside(x, y, torsoLeft, 22, 28, SIZE);
  return !head && !shoulders && !torso;
}

function gridFor(version) {
  const grid = Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => positiveP(x, y, version)));
  for (let y = 17; y < SIZE; y++) {
    const bodyLeft = y < 22 ? (version.shoulderLeft ?? 6) : (version.torsoLeft ?? 8);
    for (let x = bodyLeft; x < SIZE; x++) {
      if (grid[y][x]) throw new Error(`${version.id}: P extends right of the body at ${x},${y}`);
    }
  }
  const seen = new Set();
  let components = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const index = y * SIZE + x;
    if (!grid[y][x] || seen.has(index)) continue;
    components++;
    const stack = [index];
    seen.add(index);
    while (stack.length) {
      const next = stack.pop();
      const cx = next % SIZE, cy = Math.floor(next / SIZE);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, ni = ny * SIZE + nx;
        if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE && grid[ny][nx] && !seen.has(ni)) {
          seen.add(ni);
          stack.push(ni);
        }
      }
    }
  }
  if (components !== 1) throw new Error(`${version.id}: P has ${components} components`);
  return grid;
}

function gridPath(grid) {
  const runs = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE;) {
    if (!grid[y][x]) { x++; continue; }
    const left = x;
    while (x < SIZE && grid[y][x]) x++;
    runs.push(`M${left} ${y}h${x - left}v1H${left}z`);
  }
  return runs.join('');
}

for (const version of versions) version.path = gridPath(gridFor(version));

const symbol = (version, mode) => `<symbol id="${version.id}-${mode}" viewBox="0 0 32 32" shape-rendering="crispEdges"><path d="${version.path}" fill="${themes[mode]}"/></symbol>`;
const use = (version, mode, x, y, size) => `<use xlink:href="#${version.id}-${mode}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;

function card(version, index, x, y) {
  return `<g transform="translate(${x} ${y})">
    <rect width="490" height="292" rx="16" fill="#202329" stroke="#b8b5ad" stroke-opacity=".35"/>
    <text x="20" y="31" fill="#c9a66b" class="eyebrow">VERSION ${String(index + 1).padStart(2, '0')}</text>
    <text x="20" y="66" fill="#f2eee6" class="name">${version.name}</text>
    <rect x="20" y="82" width="160" height="160" rx="10" fill="#111317"/>
    ${use(version, 'dark', 33, 95, 134)}
    <text x="199" y="108" fill="#b8b5ad" class="small">Dark / 16 px</text>
    <rect x="428" y="88" width="38" height="38" fill="#111317"/>
    ${use(version, 'dark', 439, 99, 16)}
    <text x="199" y="152" fill="#b8b5ad" class="small">Light / 16 px</text>
    <rect x="428" y="132" width="38" height="38" fill="#faf7f0"/>
    ${use(version, 'light', 439, 143, 16)}
    <text x="199" y="196" fill="#b8b5ad" class="small">Dark / 32 px</text>
    <rect x="420" y="176" width="54" height="54" fill="#111317"/>
    ${use(version, 'dark', 431, 187, 32)}
    <text x="20" y="273" fill="#f2eee6" class="caption">${version.note}</text>
  </g>`;
}

function board(part, boardIndex) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1040" height="1430" viewBox="0 0 1040 1430" role="img" aria-labelledby="title desc">
    <title id="title">PixelDoll P with open-right negative torso, variations ${boardIndex === 0 ? '1 to 8' : '9 to 16'}</title>
    <desc id="desc">Eight connected P silhouettes. The head forms the P counter; shoulders and a straight torso occupy the open lower-right space. No foreground appears right of the body.</desc>
    <defs>${part.flatMap(version => Object.keys(themes).map(mode => symbol(version, mode))).join('')}
      <style>text{font-family:'Segoe UI',Arial,sans-serif}.serif{font-family:Georgia,serif}.eyebrow{font-size:15px;font-weight:700;letter-spacing:.07em}.name{font-size:27px;font-weight:650}.small{font-size:16px}.caption{font-size:17px}</style>
    </defs>
    <rect width="1040" height="1430" fill="#111317"/>
    <text x="20" y="42" fill="#c9a66b" class="eyebrow">PIXELDOLL / OPEN-RIGHT P STUDY / ${boardIndex === 0 ? 'A' : 'B'}</text>
    <text x="20" y="94" fill="#f2eee6" class="serif" font-size="42">The body opens to the right.</text>
    <text x="21" y="127" fill="#b8b5ad" font-size="18">Head in the P counter. Shoulders and torso in the lower opening. No right-side stroke or feet.</text>
    ${part.map((version, i) => card(version, boardIndex * 8 + i, 20 + (i % 2) * 510, 154 + Math.floor(i / 2) * 310)).join('')}
    <text x="20" y="1420" fill="#b8b5ad" font-size="16">The P stays connected. Every foreground pixel below the shoulders is left of the negative body.</text>
  </svg>\n`;
}

for (let i = 0; i < 2; i++) {
  const filename = `p-open-right-${i === 0 ? 'a' : 'b'}.svg`;
  writeFileSync(new URL(filename, import.meta.url), board(versions.slice(i * 8, i * 8 + 8), i));
  console.log(`Wrote ${filename} with 8 variants`);
}
