// Phase 2 (after labels.json exists): per-view metrics with production helpers, keyless (agentKey off).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
const APP = '<REPO>/app';
const require = createRequire(APP + '/package.json');
const { chromium } = require('playwright');
const HERE = '<SCRATCH>/live';
const OUT = APP + '/test-results-crossview';
if (!existsSync(OUT + '/labels.json')) throw new Error('label first');
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext();
await ctx.addInitScript(() => localStorage.setItem('pixeldoll.agentKey', 'off'));
const page = await ctx.newPage();
await page.goto('http://localhost:5199/');
const rd = (p) => readFileSync(p).toString('base64');
const results = {};
for (const id of readdirSync(OUT + '/calls').sort()) {
	const meta = JSON.parse(readFileSync(`${OUT}/calls/${id}/meta.json`, 'utf8'));
	const dirs = meta.spec.dirs.filter((d) => existsSync(`${OUT}/calls/${id}/layer_${d}.png`));
	if (!dirs.length) continue;
	const layers = Object.fromEntries(dirs.map((d) => [d, rd(`${OUT}/calls/${id}/layer_${d}.png`)]));
	const bodies = Object.fromEntries(dirs.map((d) => [d, rd(`${OUT}/body${meta.job.body}_rest_${d}.png`)]));
	results[id] = await page.evaluate(async ({ layers, bodies, slot, prompt }) => {
		const I = await import('/src/lib/items/items.ts');
		const PNG = await import('/src/lib/image/pngraw.ts');
		const dec = async (s) => PNG.decodePngBytes(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
		const dirs = Object.keys(layers), L = {}, B = {};
		for (const d of dirs) { L[d] = await dec(layers[d]); B[d] = await dec(bodies[d]); }
		const colors = (im) => { const s = new Set(); for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) s.add((im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2]); return s; };
		const st = {};
		for (const d of dirs) {
			const l = L[d], bo = B[d];
			let bTop = 1e9, bBot = -1, bArea = 0, area = 0, top = 1e9, bottom = -1;
			for (let p = 0; p < l.w * l.h; p++) {
				const y = (p / l.w) | 0;
				if (bo.data[p * 4 + 3]) { bArea++; bTop = Math.min(bTop, y); bBot = Math.max(bBot, y); }
				if (l.data[p * 4 + 3]) { area++; top = Math.min(top, y); bottom = Math.max(bottom, y); }
			}
			const H = bBot - bTop + 1;
			st[d] = { area, bodyArea: bArea, bodyH: H, share: area / bArea, top: area ? (top - bTop) / H : null, bottom: area ? (bottom + 1 - bTop) / H : null, nColors: colors(l).size, gray: I.grayShare(l) };
		}
		for (const d of dirs) {
			const o = dirs.filter((x) => x !== d && st[x].area);
			const union = new Set(); for (const x of o) for (const c of colors(L[x])) union.add(c);
			const s = st[d];
			s.palLOO = s.area && union.size ? I.paletteDistance([...union], [L[d]]) : null;
			s.palNearest = s.area && o.length ? Math.min(...o.map((x) => I.paletteDistance([...colors(L[x])], [L[d]]))) : null;
			// reverse direction: how much of the others' colors this view lacks (a view missing a part shows up here, not above)
			s.palOthersToThis = s.area && o.length ? Math.max(...o.map((x) => I.paletteDistance([...colors(L[d])], [L[x]]))) : null;
			if (s.area && o.length) {
				s.dTop = Math.min(...o.map((x) => Math.abs(st[x].top - s.top)));
				s.dBottom = Math.min(...o.map((x) => Math.abs(st[x].bottom - s.bottom)));
				s.extGap = Math.max(s.dTop, s.dBottom);
				s.shareToMinOther = s.share / Math.min(...o.map((x) => st[x].share));
				s.shareToMaxOther = s.share / Math.max(...o.map((x) => st[x].share));
			}
		}
		const sm = I.smudgedViews(slot, prompt, dirs.map((d) => L[d]));
		dirs.forEach((d, i) => (st[d].d1 = sm[i]));
		return st;
	}, { layers, bodies, slot: meta.spec.slot, prompt: meta.spec.prompt });
}
writeFileSync(OUT + '/metrics.json', JSON.stringify(results, null, 1));
await b.close();
console.log('metrics for', Object.keys(results).length, 'calls');
