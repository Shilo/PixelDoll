import { itemNameFrom } from '../../../../app/src/studio/model.ts';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const previous = execFileSync('git', ['show', 'bb830dfb:app/src/studio/model.ts'], { encoding: 'utf8' });
const match = previous.match(/export function itemNameFrom\(desc: string\): string \{([\s\S]*?)\n\}/);
if (!match) throw new Error('Pinned baseline helper was not located.');
const baseline = new Function('desc', match[1]) as (desc: string) => string;
const descriptions = ['a pair of leather boots', 'a pair of boots', 'the pair of leather gloves',
  'pair of leather boots', 'iron lantern hanging from a short chain', 'steel longsword with a gold crossguard'];
const report = { runtime: process.version, paidCalls: 0, baseline: 'bb830dfb', reviewed: '8ea08c28',
  currentSourceSha256: createHash('sha256').update(readFileSync(new URL('../../../../app/src/studio/model.ts', import.meta.url))).digest('hex'),
  cases: descriptions.map(description => ({ description, before: baseline(description), after: itemNameFrom(description) })) };
writeFileSync(fileURLToPath(new URL('naming-results.json', import.meta.url)), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
