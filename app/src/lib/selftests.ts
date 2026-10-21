// Runs every module's selfTest(). console.assert failures are counted by wrapping console.assert.
import * as hash from './image/hash.ts';
import * as png from './image/png.ts';
import * as zip from './store/zip.ts';
import * as db from './store/db.ts';
import * as client from './pixellab/client.ts';
import * as routes from './pixellab/routes.ts';
import * as queue from './pixellab/queue.ts';
import * as rig from './rig/rig.ts';
import * as normalize from './rig/normalize.ts';
import * as mirror from './rig/mirror.ts';
import * as skeleton from './rig/skeleton.ts';
import * as freeze from './rig/freeze.ts';
import * as pngraw from './image/pngraw.ts';
import * as compose from './compose/compose.ts';
import * as split from './compose/split.ts';
import * as sheets from './export/sheets.ts';
import * as generic from './export/generic.ts';
import * as godot from './export/godot.ts';
import * as phaser from './export/phaser.ts';
import * as unity from './export/unity.ts';
import * as chroma from './image/chroma.ts';
import * as diff from './image/diff.ts';
import * as items from './items/items.ts';
import * as palette from './dress/palette.ts';
import * as dress from './dress/dress.ts';
import * as studio from '../studio/model.ts';

type Test = [string, () => unknown];
const shared: Test[] = [
  ['hash', hash.selfTest],
  ['zip', zip.selfTest],
  ['client', client.selfTest],
  ['routes', routes.selfTest],
  ['queue', queue.selfTest],
  ['rig', rig.selfTest],
  ['rig/normalize', normalize.selfTest],
  ['rig/mirror', mirror.selfTest],
  ['rig/skeleton', skeleton.selfTest],
  ['rig/freeze', freeze.selfTest],
  ['pngraw', pngraw.selfTest],
  ['compose', compose.selfTest],
  ['compose/split', split.selfTest],
  ['export/sheets', sheets.selfTest],
  ['export/generic', generic.selfTest],
  ['export/godot', godot.selfTest],
  ['export/phaser', phaser.selfTest],
  ['export/unity', unity.selfTest],
  ['image/chroma', chroma.selfTest],
  ['image/diff', diff.selfTest],
  ['items', items.selfTest],
  ['dress/palette', palette.selfTest],
  ['dress', dress.selfTest],
  ['studio/model', studio.selfTest],
];
const node: Test[] = [...shared, ['png (pure)', png.selfTestNode]];
const browser: Test[] = [...shared, ['png', png.selfTest], ['db', db.selfTest]];

export async function runSelfTests(env: 'node' | 'browser', log: (line: string) => void = console.log): Promise<number> {
  let total = 0;
  const orig = console.assert;
  for (const [name, fn] of env === 'node' ? node : browser) {
    let fails = 0;
    console.assert = (cond?: boolean, ...msg: unknown[]) => {
      if (!cond) { fails++; log(`  FAIL ${name}: ${msg.join(' ')}`); }
    };
    try { await fn(); } catch (e) { fails++; log(`  THROW ${name}: ${(e as Error).stack ?? e}`); }
    console.assert = orig;
    log(`${fails ? 'FAIL' : 'ok  '} ${name}`);
    total += fails;
  }
  log(total ? `${total} failure(s)` : 'all self-tests passed');
  return total;
}
