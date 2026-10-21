// Runs every module's selfTest(). console.assert failures are counted by wrapping console.assert.
import * as hash from './image/hash.ts';
import * as png from './image/png.ts';
import * as zip from './store/zip.ts';
import * as db from './store/db.ts';
import * as client from './pixellab/client.ts';
import * as routes from './pixellab/routes.ts';
import * as queue from './pixellab/queue.ts';

type Test = [string, () => unknown];
const shared: Test[] = [
  ['hash', hash.selfTest],
  ['zip', zip.selfTest],
  ['client', client.selfTest],
  ['routes', routes.selfTest],
  ['queue', queue.selfTest],
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
