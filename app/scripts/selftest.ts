// `npm run selftest`: node-runnable self-checks (node >= 23 strips TS types natively). Browser-only checks: #/selftest.
import { runSelfTests } from '../src/lib/selftests.ts';
import * as agentKey from '../agent-key.ts'; // dev-server request guard (node only, never bundled)

const failures = await runSelfTests('node', console.log, [['agent-key', agentKey.selfTest]]);
process.exit(failures ? 1 : 0);
