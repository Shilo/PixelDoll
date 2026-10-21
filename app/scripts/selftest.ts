// `npm run selftest`: node-runnable self-checks (node >= 23 strips TS types natively). Browser-only checks: #/selftest.
import { runSelfTests } from '../src/lib/selftests.ts';

const failures = await runSelfTests('node');
process.exit(failures ? 1 : 0);
