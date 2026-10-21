// Runs the browser export code in node on the S1 fixture: `node scripts/export-fixture.ts <outDir> [engines]`
// Writes <outDir>/<name>.pixeldoll.zip and the unzipped tree <outDir>/<name>/ (for engine tests).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadFixture } from '../src/lib/compose/fixture.ts';
import { exportZip } from '../src/lib/export/export.ts';
import type { Engine } from '../src/lib/store/manifest.ts';

const [outDir = 'export-out', engines = 'generic,godot,phaser,unity'] = process.argv.slice(2);
const p = await loadFixture(async (f) => readFileSync(new URL(`../public/fixtures/s1/${f}`, import.meta.url)));
const r = await exportZip(p, { engines: engines.split(',') as Engine[], baked: true });
if (r.errors.length) throw new Error(r.errors.join('\n'));
const name = p.manifest.name, tree = join(outDir, name);
rmSync(tree, { recursive: true, force: true });
for (const e of r.entries) {
  mkdirSync(dirname(join(tree, e.name)), { recursive: true });
  writeFileSync(join(tree, e.name), e.data);
}
writeFileSync(join(outDir, `${name}.pixeldoll.zip`), r.zip!);
console.log(`${r.entries.length} files, zip ${r.zip!.length} bytes -> ${outDir}`, r.warnings);
