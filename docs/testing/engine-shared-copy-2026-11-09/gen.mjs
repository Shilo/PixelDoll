// Offline: builds a two-copy shared-equipment scenario from the retained Cast evidence and exports it with the app's code.
// node --experimental-transform-types gen.mjs <appDir> <evidenceDir> <outDir>
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [app, evidence, out] = process.argv.slice(2);
const lib = (p) => import(pathToFileURL(join(app, 'src/lib', p)).href);
const { readCharacterZip } = await lib('store/import.ts');
const { exportZip } = await lib('export/export.ts');
const { createDesign } = await lib('equipment/design.ts');
const { prepareCopy } = await lib('equipment/copy.ts');
const { coverageGaps, missingAt, storeVariants, recolor } = await lib('dress/dress.ts');
const { applyExportSettings } = await lib('store/export-settings.ts');
const { bakedFrame, composeCell, cellImg } = await lib('compose/compose.ts');
const { encodePngBytes } = await lib('image/pngraw.ts');
const { cellHash } = await lib('rig/rig.ts');
const { unzip } = await lib('store/zip.ts');

const read = async (f) => readCharacterZip(new Uint8Array(readFileSync(join(evidence, f))));
const cast = await read('cast-complete.pixeldoll.zip'),
	before = await read('one-view-move-test.pixeldoll.zip');
const p = cast.project,
	m = p.manifest;
const A = m.items.find((i) => i.design);
assert.ok(A, 'Cast evidence must contain the fitted copy');
const oldA = before.project.manifest.items.find((i) => i.id === A.id);
assert.ok(oldA, 'Pre-Cast clone must contain the same copy');
assert.equal(before.project.manifest.rig.animations.some((a) => a.id === 'cast'), false);

// Copy B: saved from the pre-Cast clone (idle/walk only), then copied onto the Cast character for free.
const design = await createDesign(
	before.project,
	oldA.id,
	before.project.manifest.presets[0].variants,
	'Helmet copy B'
);
const candidate = await prepareCopy(design, p);
assert.equal(candidate.assessment.canCopy, true);
const pm = candidate.project.manifest,
	B = pm.items.find((i) => i.id === candidate.itemId);
pm.presets = pm.presets.filter((x) => x.id !== 'fit-preview');
const matA = pm.materials.find((x) => x.owner === A.id),
	matB = pm.materials.find((x) => x.owner === B.id);
assert.deepEqual(matA.ramp, matB.ramp, 'Both copies start from identical source RGBs');
// An independent recolor of copy B only (a red ramp of the same length).
matB.variants.crimson = matB.ramp.map((_, i) => {
	const r = 0x60 + i * 12,
		g = 0x08 + i * 4;
	return '#' + [r, g, 0x10 + i].map((v) => v.toString(16).padStart(2, '0')).join('');
});
const shield = pm.items.find((i) => i.slot === 'off_hand');
pm.presets = [
	{
		id: 'current',
		name: 'Copy A azure',
		items: { body: 'base', off_hand: shield.id, head: A.id },
		variants: { [matA.id]: 'azure' }
	},
	{
		id: 'copy_b',
		name: 'Copy B crimson',
		items: { body: 'base', off_hand: shield.id, head: B.id },
		variants: { [matB.id]: 'crimson' }
	},
	{
		id: 'copy_b_default',
		name: 'Copy B default',
		items: { body: 'base', head: B.id },
		variants: {}
	},
	{
		id: 'copy_a_raw',
		name: 'Copy A source',
		items: { body: 'base', head: A.id },
		variants: {}
	}
];
// Studio export: global settings (Cast plays once) and stored selections, as ExportSheet does.
applyExportSettings(pm, { engine: 'godot', dressedCharacterSheets: true, playOnce: ['cast'] });
storeVariants(pm, ...pm.presets.map((x) => x.variants));

const coverage = {
	A: A.coverage?.length,
	B: B.coverage?.length,
	gaps: Object.fromEntries([A, B, shield].map((it) => [it.id, coverageGaps(pm, it)])),
	missingCells: {}
};
for (const it of [A, B, shield]) {
	const missing = [];
	for (const a of pm.rig.animations)
		for (const d of pm.rig.directions)
			for (let i = 0; i < a.cells; i++)
				if (it.layers.every((l) => !l.cells?.[a.id]?.[d.id]?.[i])) missing.push(`${a.id}/${d.id}/${i}`);
	coverage.missingCells[it.id] = missing;
}
coverage.missingAt = Object.fromEntries(
	pm.presets.map((pr) => [
		pr.id,
		Object.fromEntries(
			pm.rig.animations.map((a) => [a.id, missingAt(pm, pr.items, a.id, 'south').map((i) => i.id)])
		)
	])
);

// Expected composites per preset, move and playlist frame (PixelDoll compositor), shared by every engine check.
const project = candidate.project,
	bf = bakedFrame(pm);
mkdirSync(out, { recursive: true });
const expected = {};
for (const pr of pm.presets) {
	const colored = recolor(project, pr.variants);
	for (const a of pm.rig.animations)
		for (let i = 0; i < a.cells; i++) {
			const im = composeCell(colored, pr.items, a.id, 'south', i, bf),
				file = `expected/${pr.id}/${a.id}_${i}.png`;
			mkdirSync(dirname(join(out, file)), { recursive: true });
			writeFileSync(join(out, file), await encodePngBytes(im));
			expected[`${pr.id}/${a.id}/${i}`] = await cellHash(im);
		}
}

const results = { copies: { A: A.id, B: B.id, matA: matA.id, matB: matB.id }, coverage, bakedFrame: bf, exports: {} };
for (const engines of [['godot'], ['phaser'], ['aseprite'], ['generic']]) {
	const r = await exportZip(structuredClone(project), {
		engines,
		baked: true,
		projectData: cast.extra,
		exportedAt: '2026-11-09T00:00:00.000Z'
	});
	assert.deepEqual(r.errors, [], engines.join());
	const name = engines.join('-'),
		tree = join(out, name);
	rmSync(tree, { recursive: true, force: true });
	for (const e of r.entries) {
		mkdirSync(dirname(join(tree, e.name)), { recursive: true });
		writeFileSync(join(tree, e.name), e.data);
	}
	writeFileSync(join(out, `${name}.pixeldoll.zip`), r.zip);
	results.exports[name] = { files: r.entries.length, bytes: r.zip.length, warnings: r.warnings };
	// Round trip: the export reimports with both copies and their independent palettes.
	const round = await readCharacterZip(r.zip);
	const rm = round.project.manifest;
	for (const it of [A, B]) {
		const back = rm.items.find((x) => x.id === it.id);
		assert.ok(back?.design, `${it.id} must round-trip as a copy`);
		assert.equal(back.design.revision, it.design.revision);
	}
	assert.deepEqual(
		rm.materials.find((x) => x.id === matB.id).variants.crimson,
		matB.variants.crimson
	);
	assert.equal(rm.materials.find((x) => x.id === matA.id).variants.crimson, undefined);
}
results.expected = expected;
writeFileSync(join(out, 'scenario.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ ...results, expected: Object.keys(expected).length }, null, 2));
