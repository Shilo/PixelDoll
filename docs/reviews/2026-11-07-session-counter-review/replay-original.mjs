import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Reuse the prior independently authored raster controls, changing only the source pin and lexical dependencies.
const here = new URL('./', import.meta.url), tmp = new URL('temp.local/', here);
mkdirSync(tmp, { recursive: true });
let source = readFileSync(new URL('../2026-11-07-post-bb830dfb/item-quality/probe.mts', here), 'utf8');
source = source.replace("baseline: 'bb830dfb', head: '8ea08c28'", "baseline: '0992bae7', head: '19646f09'");
source = source.replace("line.startsWith('const OFF_HAND = ')", "line.startsWith('const OFF_HAND = ') || line.startsWith('const SUBJECT_END = ') || line.startsWith('const stripCount = ')");
source = source.replace("+ '\\n' + modelSource.match", "+ '\\n' + (modelSource.match(/const itemHead = \\([\\s\\S]*?\\n};/)?.[0] ?? '') + '\\n' + modelSource.match");
const generated = new URL('original.mts', tmp);
writeFileSync(generated, source);
writeFileSync(new URL('controls.mts', tmp), source.slice(0, source.indexOf('const results = {')) + '\nexport { head, baseline, rigOf, cellOf, blade, rect, chainCase, buckleCase, actionCase };\n');
execFileSync(process.execPath, [fileURLToPath(generated)], { stdio: ['ignore', 'ignore', 'inherit'] });
copyFileSync(new URL('results.json', tmp), new URL('original-results.json', here));
console.log('Replayed original authored fixtures at 0992bae7 and 19646f09.');
