// Open-right P study focused on the negative character's shoulders and torso.
// Run: node docs/design/branding/p-body-shapes.mjs
import { writeFileSync } from 'node:fs';

const SIZE = 32;
const darkInk = '#f2eee6';
const lightInk = '#25282d';
const rect = (x, y, left, top, right, bottom) => x >= left && x < right && y >= top && y < bottom;

const variants = [
  { id: 'reference', name: 'Reference', note: 'Broad arms, then a straight torso.', stops: [[16, 4], [22, 8]], torsoY: 22 },
  { id: 'firm-shoulder', name: 'Firm Shoulder', note: 'A stronger P spine beside the arms.', stops: [[16, 6], [22, 9]], torsoY: 22 },
  { id: 'compact-arm', name: 'Compact Arm', note: 'Shoulders sit closer to the torso.', stops: [[16, 8], [22, 10]], torsoY: 22 },
  { id: 'square-sleeve', name: 'Square Sleeve', note: 'A blocky arm with one outer step.', stops: [[16, 8], [18, 5], [22, 9]], torsoY: 22 },
  { id: 'raglan', name: 'Raglan', note: 'Pixel steps slope down into the arm.', stops: [[16, 12], [17, 10], [18, 8], [19, 6], [22, 9]], torsoY: 22 },
  { id: 'soft-slope', name: 'Soft Slope', note: 'A gentler shoulder line.', stops: [[16, 10], [17, 9], [18, 8], [19, 7], [22, 10]], torsoY: 22 },
  { id: 'dropped-arm', name: 'Dropped Arm', note: 'A lower shoulder and longer arm.', stops: [[17, 9], [19, 6], [23, 9]], torsoY: 23 },
  { id: 'raised-arm', name: 'Raised Arm', note: 'Shoulders begin nearer the head.', stops: [[15, 9], [17, 6], [21, 9]], torsoY: 21 },
  { id: 'short-sleeve', name: 'Short Sleeve', note: 'A shorter shoulder band above the torso.', stops: [[16, 6], [20, 10]], torsoY: 20 },
  { id: 'long-sleeve', name: 'Long Sleeve', note: 'A deeper shoulder band before the waist.', stops: [[16, 6], [24, 10]], torsoY: 24 },
  { id: 'slim-torso', name: 'Slim Torso', note: 'A narrow body leaves more P on the left.', stops: [[16, 6], [22, 12]], torsoY: 22 },
  { id: 'broad-torso', name: 'Broad Torso', note: 'The torso nearly matches shoulder width.', stops: [[16, 6], [22, 7]], torsoY: 22 },
  { id: 'tapered-torso', name: 'Tapered Torso', note: 'The body narrows in small pixel steps.', stops: [[16, 6], [22, 8], [26, 10], [29, 11]], torsoY: 22 },
  { id: 'rounded-waist', name: 'Rounded Waist', note: 'The waist rounds without forming legs.', stops: [[16, 6], [21, 8], [22, 9], [23, 10], [30, 9]], torsoY: 21 },
  { id: 'collar', name: 'Collar', note: 'A narrow upper shoulder opens into an arm.', stops: [[16, 14], [18, 10], [20, 5], [22, 9]], torsoY: 22 },
  { id: 'balanced', name: 'Balanced', note: 'A restrained shoulder and torso transition.', stops: [[16, 10], [19, 7], [22, 10]], torsoY: 22 },
];

function leftEdge(variant, y) {
  let edge = null;
  for (const [at, value] of variant.stops) {
    if (y < at) break;
    edge = value;
  }
  return edge;
}

function headCutout(x, y) {
  return rect(x, y, 12, 5, 24, 14);
}

function markAt(variant, x, y) {
  const outer = rect(x, y, 2, 2, 30, 18) || rect(x, y, 2, 18, 14, SIZE);
  if (!outer || headCutout(x, y)) return false;
  const edge = leftEdge(variant, y);
  return edge === null || x < edge;
}

function bodyMapAt(variant, x, y) {
  if (headCutout(x, y)) return true;
  const edge = leftEdge(variant, y);
  if (edge === null) return false;
  const right = y < variant.torsoY ? SIZE : 28;
  return x >= edge && x < right;
}

function countComponents(grid) {
  const seen = new Set();
  let count = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const index = y * SIZE + x;
    if (!grid[y][x] || seen.has(index)) continue;
    count++;
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
  return count;
}

function pathFor(grid) {
  const runs = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE;) {
    if (!grid[y][x]) { x++; continue; }
    const start = x;
    while (x < SIZE && grid[y][x]) x++;
    runs.push(`M${start} ${y}h${x - start}v1H${start}z`);
  }
  return runs.join('');
}

for (const variant of variants) {
  const mark = Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => markAt(variant, x, y)));
  const body = Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => bodyMapAt(variant, x, y)));
  if (countComponents(mark) !== 1) throw new Error(`${variant.id}: P must stay connected`);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const edge = leftEdge(variant, y);
    if (edge !== null && x >= edge && mark[y][x]) throw new Error(`${variant.id}: P appears right of the body`);
  }
  variant.markPath = pathFor(mark);
  variant.bodyPath = pathFor(body);
}

const symbol = (variant, mode) => `<symbol id="${variant.id}-${mode}" viewBox="0 0 32 32" shape-rendering="crispEdges"><path d="${variant.markPath}" fill="${mode === 'dark' ? darkInk : lightInk}"/></symbol>`;
const mapSymbol = variant => `<symbol id="${variant.id}-map" viewBox="0 0 32 32" shape-rendering="crispEdges"><path d="${variant.bodyPath}" fill="${lightInk}"/></symbol>`;
const use = (variant, mode, x, y, size) => `<use xlink:href="#${variant.id}-${mode}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;

function card(variant, index, x, y) {
  return `<g transform="translate(${x} ${y})">
    <rect width="490" height="302" rx="16" fill="#202329" stroke="#b8b5ad" stroke-opacity=".35"/>
    <text x="20" y="31" fill="#c9a66b" class="eyebrow">VERSION ${String(index + 1).padStart(2, '0')}</text>
    <text x="20" y="65" fill="#f2eee6" class="name">${variant.name}</text>
    <rect x="20" y="79" width="160" height="160" rx="10" fill="#111317"/>
    ${use(variant, 'dark', 33, 92, 134)}
    <rect x="190" y="79" width="160" height="160" rx="10" fill="#faf7f0"/>
    <use xlink:href="#${variant.id}-map" x="203" y="92" width="134" height="134"/>
    <text x="20" y="257" fill="#b8b5ad" class="tile-label">ACTUAL MARK</text>
    <text x="190" y="257" fill="#b8b5ad" class="tile-label">CUTOUT SHAPE</text>
    <text x="367" y="104" fill="#b8b5ad" class="mini">16 dark</text>
    <rect x="440" y="85" width="38" height="38" fill="#111317"/>
    ${use(variant, 'dark', 451, 96, 16)}
    <text x="367" y="153" fill="#b8b5ad" class="mini">16 light</text>
    <rect x="440" y="134" width="38" height="38" fill="#faf7f0"/>
    ${use(variant, 'light', 451, 145, 16)}
    <text x="367" y="208" fill="#b8b5ad" class="mini">32 dark</text>
    <rect x="432" y="183" width="54" height="54" fill="#111317"/>
    ${use(variant, 'dark', 443, 194, 32)}
    <text x="20" y="286" fill="#f2eee6" class="caption">${variant.note}</text>
  </g>`;
}

function board(part, index) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1040" height="1480" viewBox="0 0 1040 1480" role="img" aria-labelledby="title desc">
    <title id="title">PixelDoll open-right P body-shape study ${index === 0 ? 'A' : 'B'}</title>
    <desc id="desc">Eight connected P marks with varied shoulder and torso cutouts. Each card shows the actual mark, a cutout-shape diagram, and true 16/32 pixel samples.</desc>
    <defs>${part.flatMap(variant => [symbol(variant, 'dark'), symbol(variant, 'light'), mapSymbol(variant)]).join('')}
      <style>text{font-family:'Segoe UI',Arial,sans-serif}.serif{font-family:Georgia,serif}.eyebrow{font-size:15px;font-weight:700;letter-spacing:.07em}.name{font-size:27px;font-weight:650}.mini{font-size:14px}.tile-label{font-size:13px;font-weight:700;letter-spacing:.07em}.caption{font-size:17px}</style>
    </defs>
    <rect width="1040" height="1480" fill="#111317"/>
    <text x="20" y="42" fill="#c9a66b" class="eyebrow">PIXELDOLL / BODY SHAPE STUDY / ${index === 0 ? 'A' : 'B'}</text>
    <text x="20" y="94" fill="#f2eee6" class="serif" font-size="42">Change the body, keep the P.</text>
    <text x="21" y="127" fill="#b8b5ad" font-size="18">Only shoulders, arms and torso change. The cutout map is a diagram, not a second logo.</text>
    ${part.map((variant, i) => card(variant, index * 8 + i, 20 + (i % 2) * 510, 154 + Math.floor(i / 2) * 320)).join('')}
    <text x="20" y="1460" fill="#b8b5ad" font-size="16">Head counter fixed. No P to the right of the open body, no feet, and one connected P foreground.</text>
  </svg>\n`;
}

for (let i = 0; i < 2; i++) {
  const name = `p-body-shapes-${i === 0 ? 'a' : 'b'}.svg`;
  writeFileSync(new URL(name, import.meta.url), board(variants.slice(i * 8, i * 8 + 8), i));
  console.log(`Wrote ${name} with 8 body variations`);
}
