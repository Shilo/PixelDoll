// S4: free probes — balance, Pro Flash capabilities + cost estimates. usage: node --env-file=../../.env s4_probe.mjs
import { experiment } from './lib/run.mjs';
const X = experiment('s4_probe');
const out = { balance: await X.api.balance(), capabilities: await X.api.get('/pro-flash/capabilities'), cost: {} };
for (const [op, w, h, n] of [['edit', 64, 64], ['edit', 128, 128], ['edit', 256, 256], ['edit', 192, 128], ['inpaint', 64, 64], ['inpaint', 128, 128], ['inpaint', 256, 256], ['character', 48, 48, 8], ['character', 64, 64, 8], ['character', 48, 48, 4], ['create', 64, 64]]) {
  const q = `/pro-flash/cost?operation=${op}&width=${w}&height=${h}${n ? `&n_directions=${n}` : ''}`;
  try { out.cost[q] = await X.api.get(q); } catch (e) { out.cost[q] = { error: e.status, body: e.body }; }
}
X.saveJson('probe.json', out);
console.log(JSON.stringify(out, null, 1).slice(0, 12000));
