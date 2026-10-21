// E0: free probes — self-test, balance, pro-flash capabilities/cost.
import { selfTest } from './lib/diff.mjs';
import { experiment } from './lib/run.mjs';
console.log('selfTest', selfTest());
const { api, saveJson } = experiment('e0_probe');
const bal = await api.balance(); console.log('balance', JSON.stringify(bal));
const caps = await api.get('/pro-flash/capabilities'); saveJson('pro_flash_capabilities.json', caps); console.log(JSON.stringify(caps).slice(0, 3000));
for (const op of ['edit', 'inpaint']) console.log(op, JSON.stringify(await api.get(`/pro-flash/cost?operation=${op}&width=64&height=64`)));
