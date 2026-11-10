// Do dark item px (outlines, deep shadows) lean toward the generation key's hue? Dark = max channel < 64, tinted = chroma >= 8.
import fs from 'node:fs';
import { hueOf, type RGB } from './lib.mts';
const R: any[] = JSON.parse(fs.readFileSync(new URL('census.json', import.meta.url), 'utf8'));
const S: Record<string, RGB[]> = JSON.parse(fs.readFileSync(new URL('samples.json', import.meta.url), 'utf8'));
const bins = ['0-44 red/orange', '45-89 yellow/olive', '90-149 green', '150-194 teal/cyan', '195-254 azure/blue', '255-359 violet/magenta/red'];
const binOf = (h: number) => (h < 45 ? 0 : h < 90 ? 1 : h < 150 ? 2 : h < 195 ? 3 : h < 255 ? 4 : 5);
console.log('| Generation key | items | dark px | neutral (chroma < 8) | ' + bins.join(' | ') + ' |');
console.log('| --- | ---: | ---: | ---: | ' + bins.map(() => '---:').join(' | ') + ' |');
for (const g of ['green', 'magenta', 'blue', 'azure', 'none']) for (const test of [false, true]) {
  const rs = R.filter((r) => r.gen === g && r.test === test);
  if (!rs.length) continue;
  const h = new Array(6).fill(0); let n = 0, neu = 0;
  for (const r of rs) for (const c of [...S[r.id], ...S[r.id + ' ambOff']]) if (Math.max(...c) < 64) { n++; if (Math.max(...c) - Math.min(...c) < 8) neu++; else h[binOf(hueOf(...c))]++; }
  console.log(`| ${g}${test ? ' (color-test items)' : ' (ordinary)'} | ${rs.length} | ${n} | ${(100 * neu / n).toFixed(0)} % | ` + h.map((v) => `${(100 * v / n).toFixed(0)} %`).join(' | ') + ' |');
}
console.log('\n| Generation key | candidate px | off-ramp px scoring as the gen key | of which dark (max < 64) | all ambiguous incl. on-ramp |\n| --- | ---: | ---: | ---: | ---: |');
for (const g of ['green', 'magenta', 'blue', 'azure']) { const rs = R.filter((r) => r.gen === g); const n = rs.reduce((a, r) => a + r.n + r.amb, 0), off = rs.reduce((a, r) => a + r.ambOff, 0), dark = rs.reduce((a, r) => a + S[r.id + ' ambOff'].filter((c) => Math.max(...c) < 64).length, 0), amb = rs.reduce((a, r) => a + r.amb, 0);
  console.log(`| ${g} (${rs.length} items) | ${n} | ${off} (${(100 * off / n).toFixed(2)} %) | ${dark} | ${amb} (${(100 * amb / n).toFixed(2)} %) |`); }
