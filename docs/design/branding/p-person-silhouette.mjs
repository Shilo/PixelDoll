// Design-only P/person negative-space study. Run: node docs/design/branding/p-person-silhouette.mjs
import { writeFileSync } from 'node:fs';

const themes = {
  dark: { ink: '#f2eee6', surface: '#111317' },
  light: { ink: '#25282d', surface: '#faf7f0' },
};

// The head is the upper counter. The broad shoulder opening is below it, and
// the narrower torso opens through the bottom of the P bowl. All marks are
// one solid foreground shape with transparent cutouts.
const squareP = 'M2 1h20v20H7v3H2z';
const roundP = 'M2 1h12c6 0 9 3 9 10s-3 10-9 10H7v3H2z';
const chamferP = 'M2 1h15l5 5v10l-5 5H7v3H2z';
const steppedP = 'M2 1h15v2h3v3h2v10h-2v3h-3v2H7v3H2z';
const narrowP = 'M3 1h16c2 0 3 2 3 4v12c0 2-1 4-3 4H8v3H3z';
const wideP = 'M1 1h22v20H7v3H1z';
const archedP = 'M2 1h11c7 0 10 4 10 10s-3 10-10 10H7v3H2z';
const slopedP = 'M2 1h17l4 4v11l-4 5H7v3H2z';
const longBowlP = 'M2 1h20v21H7v2H2z';

const head = 'M10 4h7v6h-7z';
const body = 'M7 12h14v4H7zM10 16h8v5h-8z';
const compactBody = 'M8 12h12v4H8zM10 16h8v5h-8z';
const openRightBody = 'M7 12h15v4H7zM10 16h8v5h-8z';
const taperedBody = 'M8 12h12v3h-1v1h-1v5h-8v-5H9v-1H8z';
const angledBody = 'M9 12h9l3 3v1h-3v5h-8v-5H7v-1z';
const curvedBody = 'M10 12h8c2 0 3 2 3 4h-3v5h-8v-5H7c0-2 1-4 3-4z';
const sleeveBody = 'M10 12h8v1h3v3h-3v5h-8v-5H7v-3h3z';

const marks = [
  { id: 'core', name: 'Core P', note: 'The clearest square baseline.', outer: squareP, head, body },
  { id: 'soft-bowl', name: 'Soft Bowl', note: 'A smoother exterior keeps the same cutout.', outer: roundP, head, body },
  { id: 'cut-corners', name: 'Cut Corners', note: 'Chamfered paper edge; compact torso.', outer: chamferP, head, body: compactBody },
  { id: 'pixel-steps', name: 'Pixel Steps', note: 'Stepped P outline, tied to pixel art.', outer: steppedP, head, body },
  { id: 'narrow', name: 'Narrow P', note: 'Tighter letterform around the figure.', outer: narrowP, head: 'M10 4h6v6h-6z', body: compactBody },
  { id: 'wide', name: 'Wide P', note: 'Broader shoulder line and counter.', outer: wideP, head, body: openRightBody },
  { id: 'arch', name: 'Arched P', note: 'A rounder head space in an arched bowl.', outer: archedP, head: 'M13.5 4a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7', body },
  { id: 'sloped', name: 'Sloped Edge', note: 'A paper-like P with a straight figure.', outer: slopedP, head, body },
  { id: 'long-bowl', name: 'Long Bowl', note: 'More room for the body before it opens below.', outer: longBowlP, head, body: 'M7 12h14v4H7zM10 16h8v6h-8z' },
  { id: 'tapered', name: 'Tapered Torso', note: 'The shoulders step into a fitted torso.', outer: squareP, head, body: taperedBody },
  { id: 'angled', name: 'Angled Shoulders', note: 'A garment-like shoulder transition.', outer: squareP, head, body: angledBody },
  { id: 'soft-figure', name: 'Soft Figure', note: 'Round shoulders inside a rounded P.', outer: roundP, head: 'M11 4h5c1 0 2 1 2 2v2c0 1-1 2-2 2h-5c-1 0-2-1-2-2V6c0-1 1-2 2-2z', body: curvedBody },
  { id: 'round-head', name: 'Round Head', note: 'A round head in a strictly square P.', outer: squareP, head: 'M13.5 4a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7', body: compactBody },
  { id: 'broad-head', name: 'Broad Head', note: 'A wider head echoes the broad shoulders.', outer: squareP, head: 'M9 4h9v6H9z', body: compactBody },
  { id: 'sleeves', name: 'Sleeve Cut', note: 'Small sleeve steps clarify the upper body.', outer: steppedP, head, body: sleeveBody },
  { id: 'balanced', name: 'Balanced P', note: 'A narrow torso with more P on the right.', outer: roundP, head: 'M11 4h6v6h-6z', body: compactBody },
];

function symbol(mark, mode) {
  const maskId = `${mark.id}-${mode}-mask`;
  return `<symbol id="${mark.id}-${mode}" viewBox="0 0 24 24" shape-rendering="crispEdges">
    <mask id="${maskId}" x="0" y="0" width="24" height="24" maskUnits="userSpaceOnUse">
      <path d="${mark.outer}" fill="white"/>
      <path d="${mark.head}" fill="black"/>
      <path d="${mark.body}" fill="black"/>
    </mask>
    <path d="M0 0h24v24H0z" fill="${themes[mode].ink}" mask="url(#${maskId})"/>
  </symbol>`;
}

const icon = (mark, mode, x, y, size) => `<use xlink:href="#${mark.id}-${mode}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;

function card(mark, index, x, y) {
  return `<g transform="translate(${x} ${y})">
    <rect width="490" height="292" rx="16" fill="#202329" stroke="#b8b5ad" stroke-opacity=".35"/>
    <text x="20" y="31" fill="#c9a66b" class="eyebrow">VERSION ${String(index + 1).padStart(2, '0')}</text>
    <text x="20" y="66" fill="#f2eee6" class="name">${mark.name}</text>
    <rect x="20" y="82" width="160" height="160" rx="10" fill="#111317"/>
    ${icon(mark, 'dark', 33, 95, 134)}
    <text x="199" y="108" fill="#b8b5ad" class="small">Dark / 16 px</text>
    <rect x="428" y="88" width="38" height="38" fill="#111317"/>
    ${icon(mark, 'dark', 439, 99, 16)}
    <text x="199" y="152" fill="#b8b5ad" class="small">Light / 16 px</text>
    <rect x="428" y="132" width="38" height="38" fill="#faf7f0"/>
    ${icon(mark, 'light', 439, 143, 16)}
    <text x="199" y="196" fill="#b8b5ad" class="small">Dark / 32 px</text>
    <rect x="420" y="176" width="54" height="54" fill="#111317"/>
    ${icon(mark, 'dark', 431, 187, 32)}
    <text x="20" y="273" fill="#f2eee6" class="caption">${mark.note}</text>
  </g>`;
}

function board(slice, boardIndex) {
  const subtitle = boardIndex === 0
    ? 'Eight outer P silhouettes around a consistent person cutout.'
    : 'Eight refinements of the negative-space body and its placement.';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1040" height="1430" viewBox="0 0 1040 1430" role="img" aria-labelledby="title desc">
    <title id="title">PixelDoll P and person silhouette study, board ${boardIndex + 1}</title>
    <desc id="desc">Eight solid P marks with a person formed from transparent head and torso cutouts. Dark and light favicon samples are included.</desc>
    <defs>${slice.flatMap(mark => Object.keys(themes).map(mode => symbol(mark, mode))).join('')}
      <style>text{font-family:'Segoe UI',Arial,sans-serif}.serif{font-family:Georgia,serif}.eyebrow{font-size:15px;font-weight:700;letter-spacing:.07em}.name{font-size:27px;font-weight:650}.small{font-size:16px}.caption{font-size:17px}</style>
    </defs>
    <rect width="1040" height="1430" fill="#111317"/>
    <text x="20" y="42" fill="#c9a66b" class="eyebrow">PIXELDOLL / P + PERSON NEGATIVE SPACE / ${boardIndex === 0 ? 'A' : 'B'}</text>
    <text x="20" y="94" fill="#f2eee6" class="serif" font-size="42">The person shapes the P.</text>
    <text x="21" y="127" fill="#b8b5ad" font-size="18">${subtitle}</text>
    ${slice.map((mark, i) => card(mark, boardIndex * 8 + i, 20 + (i % 2) * 510, 154 + Math.floor(i / 2) * 310)).join('')}
    <text x="20" y="1420" fill="#b8b5ad" font-size="16">One foreground color, transparent figure. Compare the real 16 px samples before selecting a mark.</text>
  </svg>\n`;
}

for (let i = 0; i < 2; i++) {
  const filename = `p-person-silhouette-${i === 0 ? 'a' : 'b'}.svg`;
  writeFileSync(new URL(filename, import.meta.url), board(marks.slice(i * 8, i * 8 + 8), i));
  console.log(`Wrote ${filename}`);
}
