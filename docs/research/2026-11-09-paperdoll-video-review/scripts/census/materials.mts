// Tasks 2 and 3: synthetic material ramps under each key; key-ramp luminance structure and distance to outline/highlight colors.
import { KEYDEFS, KT, NEAR, classify, lum, hueOf, type RGB } from './lib.mts';
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
// Hand-built shade ramps (highlight -> shadow) in the style of common pixel-art palettes; one row per material.
export const MATERIALS: Record<string, string[]> = {
  'skin light': ['#ffe0c8', '#f5c6a5', '#e0a07a', '#b8775a'],
  'skin medium': ['#e8b48a', '#c98d62', '#a0663f', '#7a4a2c'],
  'skin dark': ['#a86b47', '#7d4a2e', '#5a321e', '#3b1f12'],
  'hair blonde': ['#fff1a8', '#f2d16b', '#d4a73c', '#9c7425', '#6b4c18'],
  'hair ginger': ['#f0904a', '#c45a22', '#8e3a16', '#5a220c'],
  'hair brown': ['#a0703f', '#7a5230', '#573a20', '#3a2614'],
  'hair black (blue-tinted)': ['#5a5a70', '#3c3c50', '#26263a', '#141420'],
  'leather brown': ['#b07a4a', '#8a5a34', '#643f24', '#422816'],
  'wood': ['#c89a5c', '#a0743e', '#7a5530', '#503820'],
  'gold / brass': ['#fff3a0', '#f2c94c', '#c9962a', '#8f6418', '#5c3f0f'],
  'bronze / copper': ['#e8a868', '#b87333', '#8a5220', '#5a3410'],
  'iron / steel (neutral)': ['#d8d8d8', '#a8a8a8', '#787878', '#4c4c4c', '#2c2c2c'],
  'steel (blue-tinted)': ['#dce6f0', '#a8b8c8', '#7888a0', '#4c5a70', '#2c3444'],
  'steel (cool, subtle)': ['#e4e8ec', '#b4bcc4', '#848c98', '#545c68', '#30343c'],
  'silver highlights': ['#ffffff', '#eef4fa', '#d0dce8'],
  'red cloth': ['#ff5a5a', '#d42a2a', '#9c1a1a', '#5e0e0e'],
  'crimson (real cloak)': ['#ea2b31', '#c21722', '#83091f', '#520419'],
  'orange': ['#ffa040', '#e07020', '#a04a10'],
  'pink': ['#ffb0c8', '#f07098', '#c04070'],
  'purple': ['#b06ad0', '#8040a8', '#582878', '#341848'],
  'navy': ['#3a4a8a', '#28336a', '#1c2448', '#10142c'],
  'denim': ['#8aa6d0', '#5a7ab0', '#3c5a8c', '#263c60'],
  'royal blue cloth': ['#5a8aff', '#2a5ae0', '#1a3aa0', '#0e2060'],
  'turquoise gem': ['#80f0e0', '#30d0c0', '#10a090', '#087060'],
  'ice / frost': ['#e8f8ff', '#b0e0f8', '#78c0e8', '#4890c8'],
  'water / sky': ['#a0d8ff', '#60b0f0', '#3080d0', '#1858a0'],
  'emerald': ['#50e090', '#20b068', '#108048', '#085030'],
  'forest green': ['#6aa050', '#4a7a38', '#305a28', '#1c3a18'],
  'olive / khaki': ['#c8c080', '#a09a58', '#78723a', '#4c4824'],
  'lime / poison': ['#d0ff60', '#a0e030', '#70b020', '#4a7a10'],
  'bone / ivory': ['#fffaf0', '#ece4d0', '#c8bca0', '#948a70'],
  'white cloth (cool shade, real robe)': ['#e0eaef', '#b7c7cf', '#9eafba', '#7c8d9a', '#5d6a7a'],
  'outline black': ['#000000', '#141414', '#1c1c1c'],
  'outline dark brown': ['#2b1d14', '#3b2414', '#24180c'],
  'outline dark navy': ['#141a2e', '#1b1f3b', '#0e1420', '#151124'],
  'outline dark teal-gray (real robe)': ['#1b2b2b', '#1c222c', '#272f3a'],
  'outline dark olive (real, green gen)': ['#24310c', '#101301', '#1a1f03'],
};
console.log('### Synthetic materials: shades lost (>= 35) / near (20..34, max >= 64) per key; max score in brackets\n');
console.log('| Material | shades | ' + KEYDEFS.map((k) => k.id).join(' | ') + ' |');
console.log('| --- | ---: | ' + KEYDEFS.map(() => '---').join(' | ') + ' |');
const hurt: Record<string, string[]> = Object.fromEntries(KEYDEFS.map((k) => [k.id, []]));
const flag: Record<string, string[]> = Object.fromEntries(KEYDEFS.map((k) => [k.id, []]));
for (const [m, hs] of Object.entries(MATERIALS)) {
  const cs = hs.map(hex);
  console.log(`| ${m} | ${cs.length} | ` + KEYDEFS.map((k) => {
    const l = cs.filter((c) => classify(k, c) === 'lost').length, n = cs.filter((c) => classify(k, c) === 'near').length, mx = Math.max(...cs.map(k.score));
    if (l) hurt[k.id].push(`${m} (${l}/${cs.length})`); else if (n) flag[k.id].push(`${m} (${n}/${cs.length})`);
    return l || n ? `**${l}**/${n} [${mx}]` : `0/0 [${mx}]`;
  }).join(' | ') + ' |');
}
console.log('\nSummary (lost = at least one shade keyed out; flagged = near-key only):\n');
for (const k of KEYDEFS) console.log(`- **${k.id}** loses: ${hurt[k.id].join(', ') || 'nothing'}. Flags: ${flag[k.id].join(', ') || 'nothing'}.`);

// ---------- task 3: ramps ----------
console.log('\n### Key ramps (t = 0, 0.25, 0.5, 0.75, 1): RGB, true Rec.601 luminance\n');
console.log('| Key | t=0 | t=0.25 | t=0.5 | t=0.75 | t=1 | luminance range | hue of every step |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
const ts = [0, 0.25, 0.5, 0.75, 1];
for (const k of KEYDEFS) {
  const cs = ts.map(k.ramp), ls = cs.map((c) => lum(...c));
  const hues = [...new Set(Array.from({ length: 65 }, (_, i) => k.ramp(i / 64)).filter((c) => Math.max(...c) - Math.min(...c) > 0).map((c) => Math.round(hueOf(...c))))];
  console.log(`| ${k.id} | ` + cs.map((c, i) => `${'#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')} (${ls[i].toFixed(2)})`).join(' | ') + ` | ${ls[0].toFixed(2)}..${ls[4].toFixed(2)} | ${hues.length > 3 ? hues.slice(0, 3).join(',') + '..' : hues.join(',')} |`);
}
// keyScore along the ramp: every mannequin px must score as key, including the darkest
console.log('\nMinimum keyScore along each own ramp (65 steps): ' + KEYDEFS.map((k) => `${k.id} ${Math.min(...Array.from({ length: 65 }, (_, i) => k.score(k.ramp(i / 64))))}`).join(', '));

const REFS: Record<string, string[]> = {
  'near-black': ['#000000', '#141414', '#1c1c1c'],
  'dark brown': ['#2b1d14', '#3b2414', '#24180c'],
  'dark navy': ['#141a2e', '#1b1f3b', '#0e1420'],
  'dark olive': ['#24310c', '#2e3315'],
  'dark green': ['#1c3a18', '#12231c'],
  'dark teal': ['#0f2a2a', '#1b2b2b'],
  'white / highlight': ['#ffffff', '#f0f8ff', '#e8f0f8'],
  'light skin highlight': ['#ffe0c8'],
};
const rampDist = (k: (typeof KEYDEFS)[number], c: RGB) => { let d = 1e9; for (let i = 0; i <= 64; i++) { const r = k.ramp(i / 64); d = Math.min(d, Math.max(...r.map((v, j) => Math.abs(v - c[j])))); } return d; };
console.log('\n### Min Chebyshev RGB distance from each key ramp to reference colors (lower = closer; ramp shades within ~24 are hard to tell apart), and the reference color\'s own key score\n');
console.log('| Reference | ' + KEYDEFS.map((k) => k.id).join(' | ') + ' |');
console.log('| --- | ' + KEYDEFS.map(() => '---').join(' | ') + ' |');
for (const [n, hs] of Object.entries(REFS)) console.log(`| ${n} (${hs.join(' ')}) | ` + KEYDEFS.map((k) => { const cs = hs.map(hex); return `${Math.min(...cs.map((c) => rampDist(k, c)))} (score ${Math.max(...cs.map(k.score))})`; }).join(' | ') + ' |');
console.log(`\nKT ${KT}, NEAR ${NEAR}.`);
