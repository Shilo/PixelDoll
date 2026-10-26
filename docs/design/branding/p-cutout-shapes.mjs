// Design-only two-color P studies. Run: node docs/design/branding/p-cutout-shapes.mjs
import { writeFileSync } from 'node:fs';

const themes = {
  dark: { foreground: '#f2eee6', background: '#111317' },
  light: { foreground: '#25282d', background: '#faf7f0' },
};

// Every mark is a single foreground silhouette with transparent human-shaped
// openings. Positive figure parts reconnect to the P's lower bowl.
const marks = [
  {
    id: 'square', name: 'Square Cutout', family: 'FIGURE AS HOLE',
    note: 'The original cutout, reduced to two colors.',
    outer: 'M2 1h20v18H6v4H2z',
    holes: 'M11 5h4v3h-4zM9 9h8v4H9zM11 13h4v3h-4z',
  },
  {
    id: 'soft', name: 'Soft Paper', family: 'FIGURE AS HOLE',
    note: 'Rounded outside; crisp doll-shaped opening.',
    outer: 'M2 1h12c6 0 9 3 9 9s-3 9-9 9H6v4H2z',
    holes: 'M11 5h4v3h-4zM9 9h8v4H9zM11 13h4v3h-4z',
  },
  {
    id: 'chamfer', name: 'Cut Corners', family: 'FIGURE AS HOLE',
    note: 'Angled paper corners around a straight figure.',
    outer: 'M2 1h15l5 5v8l-5 5H6v4H2z',
    holes: 'M11 5h4v3h-4zM10 9h6v2h2v2h-3v3h-4v-3H8v-2h2z',
  },
  {
    id: 'narrow', name: 'Narrow Stamp', family: 'FIGURE AS HOLE',
    note: 'Condensed P with a taller human opening.',
    outer: 'M3 1h17v2h2v13h-2v2H7v5H3z',
    holes: 'M11 4h4v4h-4zM10 9h6v6h-2v2h-2v-2h-2z',
  },
  {
    id: 'wide', name: 'Wide Shoulders', family: 'FIGURE AS HOLE',
    note: 'The upper body fills more of the P counter.',
    outer: 'M1 1h22v17H6v5H1z',
    holes: 'M11 4h4v4h-4zM9 9h8v2h2v3h-3v3h-6v-3H7v-3h2z',
  },
  {
    id: 'fold', name: 'Folded Corner', family: 'FIGURE AS HOLE',
    note: 'A clipped paper tip without a third color.',
    outer: 'M2 1h15l5 5v12H6v5H2z',
    holes: 'M11 5h4v3h-4zM9 9h8v4H9zM11 13h4v3h-4z',
  },
  {
    id: 'round-head', name: 'Round Head', family: 'FIGURE AS HOLE',
    note: 'Softer human cue inside a geometric P.',
    outer: 'M2 1h20v18H6v4H2z',
    holes: 'M13 4a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5M9 11l4-2 4 2v3h-2v3h-4v-3H9z',
  },
  {
    id: 'paper-doll', name: 'Little Doll', family: 'FIGURE AS HOLE',
    note: 'A full figure, still enclosed by the P.',
    outer: 'M2 1h20v18H6v4H2z',
    holes: 'M11 4h4v3h-4zM10 8h6v1h2v4h-2v3h-2v1h-2v-1h-2v-3H8V9h2z',
  },
  {
    id: 'portrait', name: 'Head + Torso', family: 'BODY BUILDS THE P',
    note: 'The white torso becomes the lower P bowl.',
    outer: 'M2 1h20v18H6v4H2z',
    holes: 'M7 5h11v9H7z',
    body: 'M11 6h4v4h-4zM9 12h8v7H9z',
  },
  {
    id: 'rounded-body', name: 'Rounded Bust', family: 'BODY BUILDS THE P',
    note: 'A curved shell and curved shoulders.',
    outer: 'M2 1h12c6 0 9 3 9 9s-3 9-9 9H6v4H2z',
    holes: 'M7 5h9c2 0 3 2 3 4v2c0 2-1 4-3 4H7z',
    body: 'M13 6a2 2 0 1 0 0 4a2 2 0 1 0 0-4M9 13c1-2 3-3 4-3s3 1 4 3v6H9z',
  },
  {
    id: 'arms', name: 'Open Arms', family: 'BODY BUILDS THE P',
    note: 'Broad shoulders frame the head.',
    outer: 'M2 1h20v18H6v4H2z',
    holes: 'M7 5h11v10H7z',
    body: 'M11 6h4v4h-4zM10 12h6v2h2v2h-2v3h-6v-3H8v-2h2z',
  },
  {
    id: 'tunic', name: 'Tunic Bottom', family: 'BODY BUILDS THE P',
    note: 'An A-line garment shapes the bottom stroke.',
    outer: 'M2 1h20v18H6v4H2z',
    holes: 'M7 5h11v10H7z',
    body: 'M11 6h4v4h-4zM11 11h4l3 8H8z',
  },
  {
    id: 'thin', name: 'Slim Portrait', family: 'BODY BUILDS THE P',
    note: 'Tighter proportions inside a tall P.',
    outer: 'M3 1h17v2h2v13h-2v2H7v5H3z',
    holes: 'M8 5h10v10H8z',
    body: 'M11 6h4v4h-4zM10 12h6v6h-6z',
  },
  {
    id: 'pixel-body', name: 'Pixel Body', family: 'BODY BUILDS THE P',
    note: 'Separated legs touch the P baseline.',
    outer: 'M2 1h20v19H6v3H2z',
    holes: 'M7 5h11v12H7z',
    body: 'M11 6h4v3h-4zM10 11h6v4h-6zM10 15h2v5h-2zM14 15h2v5h-2z',
  },
  {
    id: 'shoulders', name: 'Shoulder Bar', family: 'BODY BUILDS THE P',
    note: 'The P crossbar doubles as shoulders.',
    outer: 'M2 1h20v19H6v3H2z',
    holes: 'M7 5h11v10H7z',
    body: 'M11 6h4v4h-4zM8 13h10v3h-3v4h-4v-4H8z',
  },
  {
    id: 'inset', name: 'Fitted Layer', family: 'BODY BUILDS THE P',
    note: 'Two small voids hint at a fitted garment.',
    outer: 'M2 1h20v19H6v3H2z',
    holes: 'M7 5h11v12H7z',
    body: 'M11 6h4v4h-4zM9 12h8v8H9z',
    detail: 'M10 15h2v2h-2zM14 15h2v2h-2z',
  },
];

function symbol(mark, themeName) {
  const { foreground } = themes[themeName];
  const maskId = `${mark.id}-${themeName}-mask`;
  return `<symbol id="${mark.id}-${themeName}" viewBox="0 0 24 24" shape-rendering="crispEdges">
    <mask id="${maskId}" x="0" y="0" width="24" height="24" maskUnits="userSpaceOnUse">
      <path d="${mark.outer}" fill="white"/>
      <path d="${mark.holes}" fill="black"/>
      ${mark.body ? `<path d="${mark.body}" fill="white"/>` : ''}
      ${mark.detail ? `<path d="${mark.detail}" fill="black"/>` : ''}
    </mask>
    <path d="M0 0h24v24H0z" fill="${foreground}" mask="url(#${maskId})"/>
  </symbol>`;
}

const icon = (mark, theme, x, y, size) => `<use xlink:href="#${mark.id}-${theme}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;

function card(mark, index, x, y) {
  return `<g transform="translate(${x} ${y})">
    <rect width="490" height="292" rx="16" fill="#202329" stroke="#b8b5ad" stroke-opacity=".35"/>
    <text x="20" y="32" fill="#c9a66b" class="eyebrow">${String(index + 1).padStart(2, '0')} / ${mark.family}</text>
    <text x="20" y="67" fill="#f2eee6" class="name">${mark.name}</text>
    <rect x="20" y="82" width="160" height="160" rx="10" fill="#111317"/>
    ${icon(mark, 'dark', 33, 95, 134)}
    <text x="199" y="107" fill="#b8b5ad" class="small">Dark / 16 px</text>
    <rect x="428" y="88" width="38" height="38" fill="#111317"/>
    ${icon(mark, 'dark', 439, 99, 16)}
    <text x="199" y="151" fill="#b8b5ad" class="small">Light / 16 px</text>
    <rect x="428" y="132" width="38" height="38" fill="#faf7f0"/>
    ${icon(mark, 'light', 439, 143, 16)}
    <text x="199" y="195" fill="#b8b5ad" class="small">Dark / 32 px</text>
    <rect x="420" y="176" width="54" height="54" fill="#111317"/>
    ${icon(mark, 'dark', 431, 187, 32)}
    <text x="20" y="273" fill="#f2eee6" class="caption">${mark.note}</text>
  </g>`;
}

function board(slice, boardIndex) {
  const isFirst = boardIndex === 0;
  const title = isFirst ? 'The figure is cut from the P.' : 'The figure becomes the P.';
  const subtitle = isFirst
    ? 'Eight human-shaped holes inside distinct P silhouettes.'
    : 'Eight filled-head and filled-torso variants. The torso joins the lower bowl.';
  const start = isFirst ? 0 : 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1040" height="1430" viewBox="0 0 1040 1430" role="img" aria-labelledby="title desc">
    <title id="title">PixelDoll two-color P logo shapes, board ${boardIndex + 1}</title>
    <desc id="desc">Eight P-shaped marks combining a human figure and the letter P. Each mark uses one foreground color and a transparent background.</desc>
    <defs>${slice.flatMap(mark => Object.keys(themes).map(theme => symbol(mark, theme))).join('')}
      <style>text{font-family:'Segoe UI',Arial,sans-serif}.serif{font-family:Georgia,serif}.eyebrow{font-size:15px;font-weight:700;letter-spacing:.07em}.name{font-size:27px;font-weight:650}.small{font-size:16px}.caption{font-size:17px}</style>
    </defs>
    <rect width="1040" height="1430" fill="#111317"/>
    <text x="20" y="42" fill="#c9a66b" class="eyebrow">PIXELDOLL / TWO-COLOR P STUDY / ${isFirst ? 'A' : 'B'}</text>
    <text x="20" y="94" fill="#f2eee6" class="serif" font-size="43">${title}</text>
    <text x="21" y="127" fill="#b8b5ad" font-size="18">${subtitle}</text>
    ${slice.map((mark, i) => card(mark, start + i, 20 + (i % 2) * 510, 154 + Math.floor(i / 2) * 310)).join('')}
    <text x="20" y="1420" fill="#b8b5ad" font-size="16">Logo shapes contain only foreground and transparent negative space. Samples use Bronze UI light/dark surfaces.</text>
  </svg>\n`;
}

for (let i = 0; i < 2; i++) {
  const name = `p-cutout-shapes-${i === 0 ? 'a' : 'b'}.svg`;
  writeFileSync(new URL(name, import.meta.url), board(marks.slice(i * 8, i * 8 + 8), i));
  console.log(`Wrote ${name} with 8 variations`);
}
