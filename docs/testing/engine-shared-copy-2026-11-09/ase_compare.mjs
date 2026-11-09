import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [app, S] = process.argv.slice(2);
const lib = (p) => import(pathToFileURL(join(app, 'src/lib', p)).href);
const { decodePngBytes } = await lib('image/pngraw.ts');
const { readCharacterZip } = await lib('store/import.ts');
const { recolor } = await lib('dress/dress.ts');
const { composeCell, bakedFrame } = await lib('compose/compose.ts');
const sc = JSON.parse(readFileSync(join(S, 'out/scenario.json'), 'utf8')), { A, B, matA } = sc.copies;
const p = (await readCharacterZip(new Uint8Array(readFileSync(join(S, 'out/aseprite.pixeldoll.zip'))))).project, m = p.manifest;
const sh = m.items.find((i) => i.slot === 'off_hand').id, bf = bakedFrame(m);
// Aseprite carries the first outfit's colors: copy A azure, copy B its own default (azure); no Copy B crimson.
const configs = {
	default: [{ body: 'base', off_hand: sh, head: A }, { [matA]: 'azure' }],
	copyB: [{ body: 'base', head: B }, {}],
	copyB_shield: [{ body: 'base', off_hand: sh, head: B }, {}],
	copyA: [{ body: 'base', head: A }, { [matA]: 'azure' }]
};
const out = {};
let failed = 0;
for (const [name, [items, variants]] of Object.entries(configs)) {
	const colored = recolor(p, variants);
	let frame = 0, diff = 0, total = 0;
	for (const a of m.rig.animations)
		for (const f of a.frames) {
			const want = composeCell(colored, items, a.id, 'south', f.cell, bf),
				got = await decodePngBytes(readFileSync(join(S, 'ase', name, `${frame++}.png`)));
			assert.deepEqual([got.w, got.h], [bf.w, bf.h]);
			for (let i = 0; i < want.data.length; i += 4) {
				total++;
				const wa = want.data[i + 3], ga = got.data[i + 3];
				if (wa !== ga || (wa && [0, 1, 2].some((k) => want.data[i + k] !== got.data[i + k]))) diff++;
			}
		}
	out[name] = { diff, total };
	if (diff) failed++;
	console.log(`${diff ? 'FAIL' : 'PASS'} ${name}: ${diff}/${total} px differ`);
}
// Copy B alone: Cast frames (12..19) must be empty, idle/walk must not be.
const opaque = async (i) => (await decodePngBytes(readFileSync(join(S, 'ase/copyBonly', `${i}.png`)))).data.filter((v, k) => k % 4 === 3 && v).length;
const counts = [];
for (let i = 0; i < 20; i++) counts.push(await opaque(i));
const sparseOk = counts.slice(12).every((n) => n === 0) && counts.slice(0, 12).every((n) => n > 0);
if (!sparseOk) failed++;
console.log(`${sparseOk ? 'PASS' : 'FAIL'} copy B layer opaque px per frame: ${counts.join(',')}`);
writeFileSync(join(S, 'ase/results.json'), JSON.stringify({ out, counts }, null, 2));
console.log(failed ? 'ASEPRITE_SHARED_FAIL' : 'ASEPRITE_SHARED_PASS');
process.exitCode = failed ? 1 : 0;
