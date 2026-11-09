// Re-exports the generated Aseprite ZIP's editable project with copy_b_default as the first outfit (shield hidden).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [app, S] = process.argv.slice(2);
const lib = (p) => import(pathToFileURL(join(app, 'src/lib', p)).href);
const { readCharacterZip } = await lib('store/import.ts');
const { exportFiles } = await lib('export/export.ts');
const imp = await readCharacterZip(new Uint8Array(readFileSync(join(S, 'out/aseprite.pixeldoll.zip'))));
const m = imp.project.manifest;
m.presets.sort((a, b) => (a.id === 'copy_b_default' ? -1 : b.id === 'copy_b_default' ? 1 : 0));
const r = await exportFiles(imp.project, { engines: ['aseprite'], baked: true, projectData: imp.extra });
if (r.errors.length) throw new Error(r.errors.join());
const f = r.entries.find((e) => e.name.endsWith('.aseprite'));
writeFileSync(join(S, 'out/copy_b_first.aseprite'), f.data);
console.log('first preset', m.presets[0].id, f.data.length);
