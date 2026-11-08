import { fileURLToPath } from 'node:url';
export default {
  resolve:{alias:{vitest:fileURLToPath(new URL('../../../app/node_modules/vitest/dist/index.js',import.meta.url))}},
  test:{include:[fileURLToPath(new URL('temp.local/*/motion.test.ts',import.meta.url)).replaceAll('\\','/')],environment:'node',maxWorkers:1,testTimeout:20000},
};
