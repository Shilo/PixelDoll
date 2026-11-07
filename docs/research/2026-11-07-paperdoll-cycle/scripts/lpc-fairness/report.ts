// Prints the tables of lpc-fairness.md from results.json (written by lpc-fairness.ts).
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/lpc-fairness/report.ts
import { readFileSync } from 'node:fs';
import { OUT, type Tally } from './lpc-fairness.ts';

const { res, skinLum, check } = JSON.parse(readFileSync(OUT + 'results.json', 'utf8')) as { res: Record<string, Tally>; skinLum: Record<string, number>; check: unknown };
type Row = { toneSet: string; tone: string; base: string; mode: string; itemSet: string; item: string; rule: string; t: Tally };
const rows: Row[] = Object.entries(res).map(([k, t]) => { const [toneSet, tone, base, mode, itemSet, item, rule] = k.split('|'); return { toneSet, tone, base, mode, itemSet, item, rule, t }; });
const RULES = [...new Set(rows.map((r) => r.rule))], tones = Object.keys(skinLum).sort((a, b) => skinLum[b] - skinLum[a]);
const sum = (f: (r: Row) => boolean) => rows.filter(f).reduce((a, r) => { for (const k of Object.keys(a) as (keyof Tally)[]) a[k] += r.t[k]; return a; }, { darkTruth: 0, darkKept: 0, lightTruth: 0, lightKept: 0, fp: 0, fpNoItem: 0 } as Tally);
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '-');
const label = (tone: string) => `${tone}${rows.find((r) => r.tone === tone)!.toneSet === 'holdout' ? ' (held out)' : ''}`;
const table = (title: string, cols: string[], cell: (tone: string, col: string) => string, total?: (col: string) => string) => {
  console.log(`\n${title}\n\n| Tone | Skin lum | ${cols.join(' | ')} |\n| --- | ---: | ${cols.map(() => '---:').join(' | ')} |`);
  for (const tone of tones) console.log(`| ${label(tone)} | ${skinLum[tone].toFixed(2)} | ${cols.map((c) => cell(tone, c)).join(' | ')} |`);
  if (total) console.log(`| all | | ${cols.map(total).join(' | ')} |`);
};
console.log('cross-check', JSON.stringify(check), 'rules', RULES.join(','));
const ITEM_MODES = ['none', 'rim olive', 'outline olive 50%'];
const lost = (f: (r: Row) => boolean, kind: 'dark' | 'light') => { const t = sum(f); return kind === 'dark' ? `${t.darkTruth - t.darkKept} of ${t.darkTruth}` : `${t.lightTruth - t.lightKept} of ${t.lightTruth}`; };
for (const [set, name] of [['dev', 'LPC items, dev set'], ['holdout', 'LPC items, held-out set'], ['synthetic', 'synthetic 1 px straps']] as const) {
  const sel = (rule: string, tone?: string) => (r: Row) => r.itemSet === set && r.rule === rule && ITEM_MODES.includes(r.mode) && (!tone || r.tone === tone);
  table(`Dark item px lost (lum < 0.25), ${name}; modes none, rim olive, outline olive 50 %, both bases`, RULES, (tone, rule) => lost(sel(rule, tone), 'dark'), (rule) => lost(sel(rule), 'dark'));
  table(`Light item px lost, ${name}`, RULES, (tone, rule) => lost(sel(rule, tone), 'light'), (rule) => lost(sel(rule), 'light'));
}
const SC = ['scatter olive 15%', 'scatter olive 30%', 'scatter family 30%', 'scatter brown 30%'];
for (const m of SC) table(`False px shipped with no item, ${m} (both bases)`, RULES, (tone, rule) => String(sum((r) => r.tone === tone && r.rule === rule && r.mode === m && r.item === 'none').fpNoItem), (rule) => String(sum((r) => r.rule === rule && r.mode === m && r.item === 'none').fpNoItem));
for (const m of ['none', 'outline olive 50%', 'rim olive']) table(`False px shipped with no item, ${m}`, RULES, (tone, rule) => String(sum((r) => r.tone === tone && r.rule === rule && r.mode === m && r.item === 'none').fpNoItem));
for (const m of [...SC, 'none', 'outline olive 50%']) table(`False px shipped with LPC and synthetic items present, ${m} (summed over items)`, RULES, (tone, rule) => String(sum((r) => r.tone === tone && r.rule === rule && r.mode === m && r.item !== 'none').fp), (rule) => String(sum((r) => r.rule === rule && r.mode === m && r.item !== 'none').fp));
table('Dark item px lost under scatter modes (all items)', RULES, (tone, rule) => lost((r) => r.tone === tone && r.rule === rule && SC.includes(r.mode) && r.item !== 'none', 'dark'), (rule) => lost((r) => r.rule === rule && SC.includes(r.mode) && r.item !== 'none', 'dark'));
console.log('\nPer item: dark px kept %, prod, mode none, by tone (light to deep)');
for (const it of [...new Set(rows.filter((r) => r.item !== 'none').map((r) => r.item))]) console.log(it.padEnd(24), tones.map((tone) => { const t = sum((r) => r.tone === tone && r.rule === 'prod' && r.mode === 'none' && r.item === it); return pct(t.darkKept, t.darkTruth).padStart(5); }).join(' '));

// ---------- compact tables for lpc-fairness.md ----------
const real = (r: Row) => r.itemSet === 'dev' || r.itemSet === 'holdout', syn = (r: Row) => r.itemSet === 'synthetic';
const dl = (f: (r: Row) => boolean) => { const t = sum(f); return [t.darkTruth - t.darkKept, t.darkTruth]; };
const shades: Record<string, number> = { 'ulpc light': 0, 'ulpc amber': 0, 'ulpc olive': 1, 'ulpc taupe': 0, 'ulpc bronze': 1, 'ulpc brown': 1, 'ulpc black': 3, 'lpcr porcelain': 0, 'lpcr peach': 0, 'lpcr tan': 1, 'lpcr tawny': 1, 'lpcr honey': 1, 'lpcr bronze': 2, 'lpcr brown': 3, 'lpcr coffee': 4 };
const im = (r: Row) => ITEM_MODES.includes(r.mode);
console.log('\nMD gap\n\n| Tone | Skin lum | Skin shades < 60 | LPC items: dark px lost | LPC items: % kept | 1 px straps: dark px lost | 1 px straps: % kept |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const tone of tones) { const [a, b] = dl((r) => r.tone === tone && r.rule === 'prod' && im(r) && real(r)), [c, d] = dl((r) => r.tone === tone && r.rule === 'prod' && im(r) && syn(r)); console.log(`| ${label(tone)} | ${skinLum[tone].toFixed(2)} | ${shades[tone]} | ${a} of ${b} | ${pct(b - a, b)} | ${c} of ${d} | ${pct(d - c, d)} |`); }
console.log('\nMD cand (dark px lost: LPC items / 1 px straps)\n\n| Tone | ' + RULES.join(' | ') + ' |\n| --- | ' + RULES.map(() => '---:').join(' | ') + ' |');
for (const tone of tones) console.log(`| ${label(tone)} | ` + RULES.map((rule) => `${dl((r) => r.tone === tone && r.rule === rule && im(r) && real(r))[0]} / ${dl((r) => r.tone === tone && r.rule === rule && im(r) && syn(r))[0]}`).join(' | ') + ' |');
console.log('| all | ' + RULES.map((rule) => `${dl((r) => r.rule === rule && im(r) && real(r))[0]} / ${dl((r) => r.rule === rule && im(r) && syn(r))[0]}`).join(' | ') + ' |');
const fpn = (tone: string | null, rule: string, m: string) => sum((r) => (!tone || r.tone === tone) && r.rule === rule && r.mode === m && r.item === 'none').fpNoItem;
const FPM = ['scatter olive 15%', 'scatter olive 30%', 'scatter brown 30%', 'outline olive 50%'];
console.log('\nMD fp (no item; ' + FPM.join(' / ') + ')\n\n| Tone | ' + RULES.join(' | ') + ' |\n| --- | ' + RULES.map(() => '---:').join(' | ') + ' |');
for (const tone of tones) console.log(`| ${label(tone)} | ` + RULES.map((rule) => FPM.map((m) => fpn(tone, rule, m)).join(' / ')).join(' | ') + ' |');
console.log('| all | ' + RULES.map((rule) => FPM.map((m) => fpn(null, rule, m)).join(' / ')).join(' | ') + ' |');
const fpi = (tone: string | null, rule: string, ms: string[]) => sum((r) => (!tone || r.tone === tone) && r.rule === rule && ms.includes(r.mode) && r.item !== 'none').fp;
console.log('\nMD fp with items (olive/family scatter + outline; brown scatter)\n');
for (const tone of [...tones, null]) console.log(`| ${tone ?? 'all'} | ` + RULES.map((rule) => `${fpi(tone, rule, ['scatter olive 15%', 'scatter olive 30%', 'scatter family 30%', 'outline olive 50%'])} / ${fpi(tone, rule, ['scatter brown 30%'])}`).join(' | ') + ' |');
