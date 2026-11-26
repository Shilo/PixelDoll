import { rejects } from 'node:assert/strict';
import { access, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { stageAssets } from './stage-assets.mjs';

test('restaging removes assets absent from the app build', async (t) => {
  const temp = await realpath(tmpdir());
  const spike = await mkdtemp(join(temp, 'pixeldoll-stage-test-'));
  t.after(async () => {
    if (dirname(await realpath(spike)) !== temp) throw new Error('Unexpected scratch directory');
    await rm(spike, { recursive: true });
  });
  const dist = join(spike, 'dist');
  const stale = join(dist, 'obsolete-spike-test.js');
  await mkdir(dist);
  await writeFile(stale, 'obsolete');

  await stageAssets(pathToFileURL(join(spike, 'stage.mjs')));

  await rejects(access(stale), { code: 'ENOENT' });
  await access(join(dist, 'release.json'));
});
