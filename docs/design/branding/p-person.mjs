// Design-only P + human study. Run: node docs/design/branding/p-person.mjs
import { writeFileSync } from 'node:fs';

const colors = {
  dark: { ink: '#f2eee6', bronze: '#c9a66b' },
  light: { ink: '#25282d', bronze: '#76562f' },
  mono: { ink: '#f2eee6', bronze: '#f2eee6' },
};

const blockP = 'M2 1h4v22H2zM6 1h12v4H6zM18 5h4v10h-4zM6 15h12v4H6z';
const roundedP = 'M2 1h13c5 0 8 3 8 8v2c0 5-3 8-8 8H6v4H2zM6 5v10h9c3 0 4-2 4-4V9c0-2-1-4-4-4z';
const bust = 'M11 6h4v3h-4zM9 10h8v3H9zM11 13h4v2h-4z';
const figure = 'M11 5h4v3h-4zM10 9h6v4h-6zM8 10h2v3H8zM16 10h2v3h-2zM10 13h2v2h-2zM14 13h2v2h-2z';

const variants = [
  {
    id: 'portrait', name: 'Portrait P', cue: 'A bronze head and shoulders in the P.',
    note: 'Cleanest read at favicon size.',
    shapes: [['ink', blockP], ['bronze', bust]],
  },
  {
    id: 'standing', name: 'Standing P', cue: 'The whole doll stands in the counter.',
    note: 'Literal, with more detail to preserve.',
    shapes: [['ink', blockP], ['bronze', figure]],
  },
  {
    id: 'cutout', name: 'Cutout P', cue: 'A human-shaped hole in solid paper.',
    note: 'Bold silhouette; less obvious P.',
    shapes: [
      ['ink', 'M2 1h20v18H6v4H2zM11 5h4v3h-4zM9 9h8v4H9zM11 13h4v3h-4z', 'evenodd'],
      ['bronze', 'M18 1h4v4h-4z'],
    ],
  },
  {
    id: 'soft', name: 'Soft Portrait', cue: 'A rounded P around the same portrait.',
    note: 'Calmer beside Bronze UI surfaces.',
    shapes: [['ink', roundedP, 'evenodd'], ['bronze', bust]],
  },
  {
    id: 'tabbed', name: 'Tabbed P', cue: 'Paper tabs reach toward the P frame.',
    note: 'Most explicit paper-doll connection.',
    shapes: [
      ['ink', blockP],
      ['bronze', 'M11 5h4v3h-4zM10 9h6v5h-6zM7 10h3v2H7zM16 10h3v2h-3z'],
    ],
  },
  {
    id: 'dressed', name: 'Dressed P', cue: 'Ivory head, bronze wearable body.',
    note: 'Shows base and equipment separately.',
    shapes: [
      ['ink', blockP + 'M11 5h4v3h-4z'],
      ['bronze', 'M10 9h6v4h-6zM8 10h2v3H8zM16 10h2v3h-2zM10 13h2v2h-2zM14 13h2v2h-2z'],
    ],
  },
];

function symbol(variant, theme) {
  return `<symbol id="${variant.id}-${theme}" viewBox="0 0 24 24" shape-rendering="crispEdges">${variant.shapes.map(([role, path, rule]) => `<path d="${path}" fill="${colors[theme][role]}"${rule ? ` fill-rule="${rule}"` : ''}/>`).join('')}</symbol>`;
}
const icon = (variant, theme, x, y, size) => `<use xlink:href="#${variant.id}-${theme}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
const positions = [[52, 196], [560, 196], [1068, 196], [52, 652], [560, 652], [1068, 652]];

function card(variant, index, x, y) {
  return `<g transform="translate(${x} ${y})">
    <rect width="480" height="424" rx="18" fill="#202329" stroke="#b8b5ad" stroke-opacity=".35"/>
    <text x="25" y="42" fill="#c9a66b" class="eyebrow">VERSION ${String(index + 1).padStart(2, '0')}</text>
    <text x="25" y="82" fill="#f2eee6" class="name">${variant.name}</text>
    <rect x="25" y="104" width="181" height="181" rx="14" fill="#111317"/>
    ${icon(variant, 'dark', 43, 122, 145)}
    <text x="228" y="132" fill="#b8b5ad" class="small">Dark / 16 px</text>
    <rect x="405" y="114" width="42" height="42" fill="#111317"/>
    ${icon(variant, 'dark', 418, 127, 16)}
    <text x="228" y="172" fill="#b8b5ad" class="small">Light / 16 px</text>
    <rect x="405" y="154" width="42" height="42" fill="#faf7f0"/>
    ${icon(variant, 'light', 418, 167, 16)}
    <text x="228" y="218" fill="#b8b5ad" class="small">Dark / 32 px</text>
    <rect x="399" y="200" width="54" height="54" fill="#111317"/>
    ${icon(variant, 'dark', 410, 211, 32)}
    <text x="228" y="275" fill="#b8b5ad" class="small">One color / 32 px</text>
    <rect x="399" y="257" width="54" height="54" fill="#111317"/>
    ${icon(variant, 'mono', 410, 268, 32)}
    <text x="25" y="316" fill="#f2eee6" class="caption">${variant.cue}</text>
    <text x="25" y="345" fill="#b8b5ad" class="caption">${variant.note}</text>
    <rect x="25" y="362" width="430" height="47" rx="8" fill="#faf7f0"/>
    ${icon(variant, 'light', 35, 369, 33)}
    <text x="80" y="392" fill="#25282d" font-size="23" font-weight="650">PixelDoll</text>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="1160" viewBox="0 0 1600 1160" role="img" aria-labelledby="title desc">
  <title id="title">Six PixelDoll P and human logo studies</title>
  <desc id="desc">Six variations of a P-shaped mark with a human figure in its counter, shown at large, 16 pixel, 32 pixel, monochrome and light-theme sizes.</desc>
  <defs>${variants.flatMap(v => Object.keys(colors).map(theme => symbol(v, theme))).join('')}
    <style>text{font-family:'Segoe UI',Arial,sans-serif}.serif{font-family:Georgia,serif}.eyebrow{font-size:17px;font-weight:700;letter-spacing:.08em}.name{font-size:29px;font-weight:650}.small{font-size:17px}.caption{font-size:18px}</style>
  </defs>
  <rect width="1600" height="1160" fill="#111317"/>
  <text x="52" y="62" fill="#c9a66b" class="eyebrow">PIXELDOLL / P + HUMAN STUDY</text>
  <text x="52" y="117" fill="#f2eee6" class="serif" font-size="54">A person inside the P.</text>
  <text x="54" y="158" fill="#b8b5ad" font-size="22">Six variations mixing the folded initial and the paper-doll cutout. All use Bronze UI light/dark colors.</text>
  ${variants.map((variant, i) => card(variant, i, ...positions[i])).join('')}
  <text x="52" y="1127" fill="#b8b5ad" font-size="18">Design mockups only. Compare the 16 px and one-color samples before choosing an installed-icon treatment.</text>
</svg>\n`;

writeFileSync(new URL('p-person.svg', import.meta.url), svg);
console.log(`Wrote p-person.svg with ${variants.length} versions`);
