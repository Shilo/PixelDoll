// Two construction families for a single connected P with a pixel-character
// negative space. Run: node docs/design/branding/p-dual-construction.mjs
import { writeFileSync } from 'node:fs';

const SIZE = 24;
const themes = {
  dark: { foreground: '#f2eee6', background: '#111317' },
  light: { foreground: '#25282d', background: '#faf7f0' },
};

const inRect = (x, y, x1, y1, x2, y2) => x >= x1 && x < x2 && y >= y1 && y < y2;

function wrappedP(x, y, form) {
  if (inRect(x, y, form.left, form.bottom, form.stem, SIZE)) return true;
  if (y < 1 || y >= form.bottom || x < form.left) return false;
  let right = 24;
  if (form.cap === 'soft') right = y === 1 ? 17 : y === 2 ? 21 : y >= 19 ? 22 - (y - 19) * 2 : 24;
  if (form.cap === 'arch') right = y === 1 ? 15 : y === 2 ? 19 : y === 3 ? 22 : y >= 18 ? 24 - (y - 18) * 2 : 24;
  if (form.cap === 'cut') right = y === 1 ? 18 : y === 2 ? 20 : y === 3 ? 22 : y >= 18 ? 23 - (y - 18) * 2 : 24;
  if (form.cap === 'pixel') right = y < 3 ? 19 : y < 5 ? 22 : y >= 19 ? 20 : 24;
  return x < right;
}

function wrappedPerson(x, y, form) {
  const headX = form.headX ?? 7;
  const headRight = form.headRight ?? 19;
  const headTop = form.headTop ?? 3;
  const headBottom = form.headBottom ?? 10;
  let head = inRect(x, y, headX, headTop, headRight, headBottom);
  if (form.headShape === 'soft' && head && (y === headTop || y === headBottom - 1)) head = x > headX && x < headRight - 1;
  if (form.headShape === 'cut' && head) head = !((y === headTop || y === headBottom - 1) && (x === headX || x === headRight - 1));
  const shoulderLeft = form.shoulderLeft ?? 4;
  const shoulderRight = form.shoulderRight ?? 21;
  const shoulderTop = form.shoulderTop ?? 12;
  const shoulderBottom = form.shoulderBottom ?? 16;
  let shoulders = inRect(x, y, shoulderLeft, shoulderTop, shoulderRight, shoulderBottom);
  if (form.shoulderShape === 'angled' && shoulders && y === shoulderTop) shoulders = x >= shoulderLeft + 2 && x < shoulderRight - 2;
  if (form.shoulderShape === 'soft' && shoulders && y === shoulderTop) shoulders = x >= shoulderLeft + 1 && x < shoulderRight - 1;
  const torsoLeft = form.torsoLeft ?? 7;
  const torsoRight = form.torsoRight ?? 19;
  const torsoBottom = form.torsoBottom ?? 21;
  let torso = inRect(x, y, torsoLeft, shoulderBottom, torsoRight, torsoBottom);
  if (form.torsoShape === 'taper' && torso && y >= shoulderBottom + 2) torso = x >= torsoLeft + 1 && x < torsoRight - 1;
  return head || shoulders || torso;
}

// The outer P follows the body: top/head, neck, broad shoulders and torso.
// Its left arm/side continues downward as the P stem.
function figureP(x, y, form) {
  const spine = inRect(x, y, form.left ?? 2, 2, form.stem ?? 7, SIZE);
  let head = inRect(x, y, 4, 2, 20, 11);
  if (form.headShape === 'round' && head && (y === 2 || y === 10)) head = x >= 6 && x < 18;
  if (form.headShape === 'cut' && head && (y === 2 || y === 10)) head = x >= 5 && x < 19;
  let shoulders = inRect(x, y, 5, 11, form.shoulderRight ?? 22, 16);
  if (form.shoulderShape === 'angled' && shoulders && y === 11) shoulders = x >= 7 && x < (form.shoulderRight ?? 22) - 2;
  if (form.shoulderShape === 'soft' && shoulders && y === 11) shoulders = x >= 6 && x < (form.shoulderRight ?? 22) - 1;
  let torso = inRect(x, y, 6, 16, form.torsoRight ?? 22, form.torsoBottom ?? 22);
  if (form.torsoShape === 'taper' && torso && y >= 19) torso = x >= 7 && x < (form.torsoRight ?? 22) - 1;
  return spine || head || shoulders || torso;
}

function figureNegative(x, y, form) {
  let head = inRect(x, y, form.headLeft ?? 9, 4, form.headRight ?? 18, 10);
  if (form.headShape === 'round' && head && (y === 4 || y === 9)) head = x >= 11 && x < 16;
  if (form.headShape === 'cut' && head && (y === 4 || y === 9)) head = x >= 10 && x < 17;
  const left = form.shoulderLeft ?? 8;
  const right = form.shoulderRight ?? 19;
  let shoulders = inRect(x, y, left, 13, right, 16);
  if (form.shoulderShape === 'angled' && shoulders && y === 13) shoulders = x >= left + 1 && x < right - 1;
  let torso = inRect(x, y, form.torsoLeft ?? 10, 16, form.torsoRight ?? 17, form.torsoBottom ?? 22);
  if (form.torsoShape === 'taper' && torso && y >= 19) torso = x >= (form.torsoLeft ?? 10) + 1 && x < (form.torsoRight ?? 17) - 1;
  return head || shoulders || torso;
}

const marks = [
  { id: 'frame', name: 'Frame P', family: 'P WRAPS THE FIGURE', note: 'Closest wrap around the supplied proportions.', kind: 'wrap', outer: { left: 0, stem: 5, bottom: 21 }, person: {} },
  { id: 'soft-frame', name: 'Soft Frame', family: 'P WRAPS THE FIGURE', note: 'The head and shoulders stay square.', kind: 'wrap', outer: { left: 0, stem: 5, bottom: 21, cap: 'soft' }, person: {} },
  { id: 'arched-frame', name: 'Arched Frame', family: 'P WRAPS THE FIGURE', note: 'A rounded P around a larger head opening.', kind: 'wrap', outer: { left: 0, stem: 5, bottom: 21, cap: 'arch' }, person: { headShape: 'soft' } },
  { id: 'paper-frame', name: 'Paper Frame', family: 'P WRAPS THE FIGURE', note: 'Clipped corners keep the paper cue subtle.', kind: 'wrap', outer: { left: 0, stem: 5, bottom: 21, cap: 'cut' }, person: { headShape: 'cut' } },
  { id: 'pixel-frame', name: 'Pixel Frame', family: 'P WRAPS THE FIGURE', note: 'The outer corner steps on the grid.', kind: 'wrap', outer: { left: 0, stem: 5, bottom: 21, cap: 'pixel' }, person: { shoulderShape: 'angled' } },
  { id: 'tall-frame', name: 'Tall Frame', family: 'P WRAPS THE FIGURE', note: 'More of the torso stays within the P.', kind: 'wrap', outer: { left: 0, stem: 5, bottom: 22 }, person: { torsoBottom: 22 } },
  { id: 'broad-frame', name: 'Broad Frame', family: 'P WRAPS THE FIGURE', note: 'Broad shoulders match the latest sketch.', kind: 'wrap', outer: { left: 0, stem: 5, bottom: 21 }, person: { shoulderLeft: 3, shoulderRight: 22, torsoLeft: 7, torsoRight: 19 } },
  { id: 'fitted-frame', name: 'Fitted Frame', family: 'P WRAPS THE FIGURE', note: 'Shoulders taper into a narrow torso.', kind: 'wrap', outer: { left: 0, stem: 5, bottom: 21, cap: 'soft' }, person: { shoulderShape: 'soft', torsoShape: 'taper' } },
  { id: 'body-p', name: 'Body P', family: 'BODY FORMS THE P', note: 'The head and shoulders define the P bowl.', kind: 'figure', outer: {}, person: {} },
  { id: 'round-body', name: 'Round Body', family: 'BODY FORMS THE P', note: 'A softer head shapes the top counter.', kind: 'figure', outer: { headShape: 'round' }, person: { headShape: 'round' } },
  { id: 'cut-body', name: 'Cut Body', family: 'BODY FORMS THE P', note: 'Pixel chamfers on head and outer edge.', kind: 'figure', outer: { headShape: 'cut' }, person: { headShape: 'cut' } },
  { id: 'angled-body', name: 'Angled Body', family: 'BODY FORMS THE P', note: 'Angled shoulders make the person clearer.', kind: 'figure', outer: { shoulderShape: 'angled' }, person: { shoulderShape: 'angled' } },
  { id: 'soft-body', name: 'Soft Body', family: 'BODY FORMS THE P', note: 'The P follows rounded shoulders.', kind: 'figure', outer: { headShape: 'round', shoulderShape: 'soft' }, person: { headShape: 'round' } },
  { id: 'slim-body', name: 'Slim Body', family: 'BODY FORMS THE P', note: 'A slimmer torso leaves more negative space.', kind: 'figure', outer: { torsoShape: 'taper', torsoRight: 22 }, person: { torsoShape: 'taper' } },
  { id: 'bold-spine', name: 'Bold Spine', family: 'BODY FORMS THE P', note: 'A heavier left side strengthens the P.', kind: 'figure', outer: { left: 1, stem: 8 }, person: {} },
  { id: 'wide-shoulder', name: 'Wide Shoulder', family: 'BODY FORMS THE P', note: 'A wider silhouette with a compact head.', kind: 'figure', outer: { shoulderRight: 24 }, person: { headLeft: 11, headRight: 16 } },
];

function bitmap(mark) {
  return Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => {
    const outer = mark.kind === 'wrap' ? wrappedP(x, y, mark.outer) : figureP(x, y, mark.outer);
    const person = mark.kind === 'wrap' ? wrappedPerson(x, y, mark.person) : figureNegative(x, y, mark.person);
    return outer && !person;
  }));
}

function componentCount(grid) {
  const seen = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  let count = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (!grid[y][x] || seen[y][x]) continue;
    count++;
    const stack = [[x, y]];
    seen[y][x] = true;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE || !grid[ny][nx] || seen[ny][nx]) continue;
        seen[ny][nx] = true;
        stack.push([nx, ny]);
      }
    }
  }
  return count;
}

function pathFromBitmap(grid) {
  const runs = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE;) {
      if (!grid[y][x]) { x++; continue; }
      const left = x;
      while (x < SIZE && grid[y][x]) x++;
      runs.push(`M${left} ${y}h${x - left}v1H${left}z`);
    }
  }
  return runs.join('');
}

for (const mark of marks) {
  mark.grid = bitmap(mark);
  const components = componentCount(mark.grid);
  if (components !== 1) throw new Error(`${mark.id}: positive P has ${components} components`);
  mark.path = pathFromBitmap(mark.grid);
}

const iconSymbol = (mark, mode) => `<symbol id="${mark.id}-${mode}" viewBox="0 0 24 24" shape-rendering="crispEdges"><path d="${mark.path}" fill="${themes[mode].foreground}"/></symbol>`;
const use = (mark, mode, x, y, size) => `<use xlink:href="#${mark.id}-${mode}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;

function card(mark, index, x, y) {
  return `<g transform="translate(${x} ${y})">
    <rect width="490" height="292" rx="16" fill="#202329" stroke="#b8b5ad" stroke-opacity=".35"/>
    <text x="20" y="31" fill="#c9a66b" class="eyebrow">VERSION ${String(index + 1).padStart(2, '0')}</text>
    <text x="20" y="66" fill="#f2eee6" class="name">${mark.name}</text>
    <rect x="20" y="82" width="160" height="160" rx="10" fill="#111317"/>
    ${use(mark, 'dark', 33, 95, 134)}
    <text x="199" y="108" fill="#b8b5ad" class="small">Dark / 16 px</text>
    <rect x="428" y="88" width="38" height="38" fill="#111317"/>
    ${use(mark, 'dark', 439, 99, 16)}
    <text x="199" y="152" fill="#b8b5ad" class="small">Light / 16 px</text>
    <rect x="428" y="132" width="38" height="38" fill="#faf7f0"/>
    ${use(mark, 'light', 439, 143, 16)}
    <text x="199" y="196" fill="#b8b5ad" class="small">Dark / 32 px</text>
    <rect x="420" y="176" width="54" height="54" fill="#111317"/>
    ${use(mark, 'dark', 431, 187, 32)}
    <text x="20" y="273" fill="#f2eee6" class="caption">${mark.note}</text>
  </g>`;
}

function board(part, index) {
  const title = index === 0 ? 'P wraps the person.' : 'The body forms the P.';
  const subtitle = index === 0
    ? 'A P foreground closely frames the negative pixel character.'
    : 'The P exterior follows a head, shoulders and torso rather than a tile.';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1040" height="1430" viewBox="0 0 1040 1430" role="img" aria-labelledby="title desc">
    <title id="title">PixelDoll positive P and negative character, ${index === 0 ? 'wrapped' : 'body-shaped'} family</title>
    <desc id="desc">Eight connected positive P shapes with transparent pixel characters, shown on dark and light surfaces at large and favicon size.</desc>
    <defs>${part.flatMap(mark => Object.keys(themes).map(mode => iconSymbol(mark, mode))).join('')}
      <style>text{font-family:'Segoe UI',Arial,sans-serif}.serif{font-family:Georgia,serif}.eyebrow{font-size:15px;font-weight:700;letter-spacing:.07em}.name{font-size:27px;font-weight:650}.small{font-size:16px}.caption{font-size:17px}</style>
    </defs>
    <rect width="1040" height="1430" fill="#111317"/>
    <text x="20" y="42" fill="#c9a66b" class="eyebrow">PIXELDOLL / CONNECTED P + NEGATIVE PERSON / ${index === 0 ? 'A' : 'B'}</text>
    <text x="20" y="94" fill="#f2eee6" class="serif" font-size="42">${title}</text>
    <text x="21" y="127" fill="#b8b5ad" font-size="18">${subtitle}</text>
    ${part.map((mark, i) => card(mark, index * 8 + i, 20 + (i % 2) * 510, 154 + Math.floor(i / 2) * 310)).join('')}
    <text x="20" y="1420" fill="#b8b5ad" font-size="16">Every positive P passes a 24 px connectivity check. The figure is transparent; no extra mark is added.</text>
  </svg>\n`;
}

for (let index = 0; index < 2; index++) {
  const name = `p-dual-construction-${index === 0 ? 'a' : 'b'}.svg`;
  writeFileSync(new URL(name, import.meta.url), board(marks.slice(index * 8, index * 8 + 8), index));
  console.log(`Wrote ${name} with 8 connected marks`);
}
