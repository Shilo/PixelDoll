import { cp, lstat, readFile, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = new URL('../../../app/dist/', import.meta.url);

export async function stageAssets(spike) {
  const html = await readFile(new URL('index.html', source), 'utf8');
  const parent = await realpath(fileURLToPath(new URL('.', spike)));
  const target = join(parent, 'dist');
  const existing = await lstat(target, { throwIfNoEntry: false });
  if (existing) {
    if (!existing.isDirectory() || await realpath(target) !== target) {
      throw new Error('Expected a generated dist directory inside the spike');
    }
    await rm(target, { recursive: true });
  }
  await cp(source, target, { recursive: true });
  return html;
}
