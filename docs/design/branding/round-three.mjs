// Design-only logo board. Run: node docs/design/branding/round-three.mjs
import { writeFileSync } from 'node:fs';

const themes = {
  dark: { ink: '#f2eee6', bronze: '#c9a66b' },
  light: { ink: '#25282d', bronze: '#76562f' },
  mono: { ink: '#f2eee6', bronze: '#f2eee6' },
};

const marks = [
  {
    id: 'notched-d', name: 'Notched D', category: 'CUSTOM INITIAL', cue: 'A fitted bronze part completes the D.',
    risk: 'Strong initial; needs the name for meaning.',
    shapes: [
      ['ink', 'M1 1h3v14H1zM4 1h7v3H4zM4 12h7v3H4z'],
      ['bronze', 'M11 4h3v8h-3zM14 6h2v4h-2z'],
    ],
  },
  {
    id: 'folded-p', name: 'Folded P', category: 'CUSTOM INITIAL', cue: 'A sheet corner folds into the initial.',
    risk: 'Paper cue is subtle at 16 px.',
    shapes: [
      ['ink', 'M2 1h3v14H2zM5 1h7v3H5zM12 4h3v6h-3zM5 10h10v3H5z'],
      ['bronze', 'M12 1h3v3h-1V3h-1V2h-1z'],
    ],
  },
  {
    id: 'cutout-sheet', name: 'Cutout Sheet', category: 'PAPER CUTOUT', cue: 'A doll-shaped hole in a sheet of paper.',
    risk: 'Could read as a document at tiny size.',
    shapes: [
      ['ink', 'M1 0h12v16H1zM5 2h4v3H5zM4 6h6v4H4zM5 10h2v4H5zM8 10h2v4H8z', 'evenodd'],
      ['bronze', 'M13 6h3v4h-3z'],
    ],
  },
  {
    id: 'fold-tabs', name: 'Fold Tabs', category: 'PAPER CLOTHING', cue: 'Removable clothing with broad paper tabs.',
    risk: 'Watch for generic shirt/icon reading.',
    shapes: [
      ['bronze', 'M5 2h6v2h2v2h2v6h-3v3H4v-3H1V6h2V4h2zM6 2h4v3H6z', 'evenodd'],
      ['ink', 'M0 6h2v3H0zM14 6h2v3h-2z'],
    ],
  },
  {
    id: 'keyed-fit', name: 'Keyed Fit', category: 'SWAPPABLE FIT', cue: 'A swappable piece fits a fixed socket.',
    risk: 'May resemble a connector or plug.',
    shapes: [
      ['ink', 'M1 3h3v10H1zM12 3h3v10h-3zM1 12h14v3H1z'],
      ['bronze', 'M5 1h6v3H5zM7 4h2v8H7zM4 6h3v2H4zM9 6h3v2H9z'],
    ],
  },
];

const symbol = (mark, themeName) => {
  const colors = themes[themeName];
  return `<symbol id="${mark.id}-${themeName}" viewBox="0 0 16 16" shape-rendering="crispEdges">${mark.shapes.map(([role, d, rule]) => `<path d="${d}" fill="${colors[role]}"${rule ? ` fill-rule="${rule}"` : ''}/>`).join('')}</symbol>`;
};
const icon = (mark, theme, x, y, size) => `<use xlink:href="#${mark.id}-${theme}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;

const card = (mark, index, x, y) => `<g transform="translate(${x} ${y})">
  <rect width="480" height="390" rx="18" fill="#202329" stroke="#b8b5ad" stroke-opacity=".35"/>
  <text x="24" y="38" fill="#c9a66b" class="eyebrow">${String(index + 1).padStart(2, '0')} / ${mark.category}</text>
  <text x="24" y="76" fill="#f2eee6" class="name">${mark.name}</text>
  <rect x="24" y="93" width="178" height="178" rx="13" fill="#111317"/>
  ${icon(mark, 'dark', 41, 110, 144)}
  <text x="226" y="120" fill="#b8b5ad" class="mini">Browser dark / 16</text>
  <rect x="410" y="103" width="38" height="38" fill="#111317"/>
  ${icon(mark, 'dark', 421, 114, 16)}
  <text x="226" y="171" fill="#b8b5ad" class="mini">Browser light / 16</text>
  <rect x="410" y="154" width="38" height="38" fill="#faf7f0"/>
  ${icon(mark, 'light', 421, 165, 16)}
  <text x="226" y="222" fill="#b8b5ad" class="mini">One color / 32</text>
  <rect x="403" y="204" width="52" height="52" fill="#111317"/>
  ${icon(mark, 'mono', 413, 214, 32)}
  <text x="24" y="304" fill="#f2eee6" class="caption">${mark.cue}</text>
  <text x="24" y="333" fill="#b8b5ad" class="caption">${mark.risk}</text>
  <rect x="24" y="348" width="432" height="29" rx="5" fill="#faf7f0"/>
  ${icon(mark, 'light', 31, 351, 23)}
  <text x="61" y="369" fill="#25282d" font-size="18" font-weight="650">PixelDoll</text>
</g>`;

const positions = [[52, 188], [560, 188], [1068, 188], [306, 608], [814, 608]];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="1110" viewBox="0 0 1600 1110" role="img" aria-labelledby="title desc">
  <title id="title">PixelDoll third-round logo concepts</title>
  <desc id="desc">Five distinct logo directions inspired by paper-doll tabs, cutouts, initials, and fitted layers, shown at large and favicon sizes.</desc>
  <defs>${marks.flatMap(mark => Object.keys(themes).map(theme => symbol(mark, theme))).join('')}
    <style>text{font-family:'Segoe UI',Arial,sans-serif}.serif{font-family:Georgia,serif}.eyebrow{font-size:16px;font-weight:700;letter-spacing:.08em}.name{font-size:27px;font-weight:650}.mini{font-size:16px}.caption{font-size:17px}</style>
  </defs>
  <rect width="1600" height="1110" fill="#111317"/>
  <text x="52" y="59" fill="#c9a66b" class="eyebrow">PIXELDOLL / ROUND THREE</text>
  <text x="52" y="111" fill="#f2eee6" class="serif" font-size="51">Beyond the little person.</text>
  <text x="54" y="148" fill="#b8b5ad" font-size="21">Original marks informed by paper-doll tabs, paper cutouts and fitted sprite layers. All start at 16 × 16.</text>
  ${marks.map((mark, i) => card(mark, i, ...positions[i])).join('')}
  <text x="52" y="1050" fill="#c9a66b" class="eyebrow">READ THE SILHOUETTE FIRST</text>
  <text x="52" y="1082" fill="#f2eee6" font-size="20">The light/dark and one-color samples test recognition before any PWA padding or large-scale decoration.</text>
</svg>\n`;

writeFileSync(new URL('round-three.svg', import.meta.url), svg);
console.log(`Wrote round-three.svg with ${marks.length} concepts`);
