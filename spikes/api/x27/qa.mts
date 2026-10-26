// Round 8 body-clip QA (no API calls): props drawn into the body layer and broken frames, with production's measures.
// foreign = opaque px whose color is not within 24 of a rest-view color (swords, sticks, dust); detached = px outside the
// largest component; area = opaque px vs the rest view (a frame that dissolves or shrinks shows here).
// Usage (spikes/api): node x27/qa.mts <arm> [id-filter]
import fs from 'node:fs';
import { load, OUT, BODY, clips } from './lib.mts';

export async function qa(arm: string, id: string, d: string) {
  const f = `${OUT}/${arm}/body_${id}_${d}`;
  if (!fs.existsSync(`${f}.json`)) return null;
  const labels: string[] = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8')).labels.sort((a: string, b: string) => +a - +b);
  const rest = await BODY.rest(d), restArea = rest.data.filter((_, i) => i % 4 === 3 && _ > 0).length;
  const rows = [];
  for (const l of labels) {
    const im = await load(`${f}.${l}.png`), area = im.data.filter((v, i) => i % 4 === 3 && v > 0).length;
    rows.push({ foreign: Math.round(area * (1 - clips.paletteFit(rest, [im], 24))), detached: clips.bodyComponents(im).detachedPixels, area: +(area / restArea).toFixed(2) });
  }
  return { id, d, maxForeign: Math.max(...rows.map((r) => r.foreign)), framesWithProps: rows.filter((r) => r.foreign >= 12).length, maxDetached: Math.max(...rows.map((r) => r.detached)), areaRange: [Math.min(...rows.map((r) => r.area)), Math.max(...rows.map((r) => r.area))], n: rows.length, rows };
}

if (import.meta.main) {
  const [arm, filt] = process.argv.slice(2);
  const ids = [...new Set(fs.readdirSync(`${OUT}/${arm}`).filter((f) => /^body_.*\.json$/.test(f)).map((f) => f.slice(5, -5)))];
  for (const k of ids.filter((k) => !filt || k.includes(filt)).sort()) {
    const d = k.endsWith('_south') ? 'south' : k.endsWith('_east') ? 'east' : 'north', id = k.slice(0, -d.length - 1);
    const r = (await qa(arm, id, d))!;
    console.log(k.padEnd(26), `props in ${r.framesWithProps}/${r.n} frames (max ${r.maxForeign} px)`.padEnd(32), `detached max ${r.maxDetached}`.padEnd(18), `area ${r.areaRange.join('–')}`);
  }
}
