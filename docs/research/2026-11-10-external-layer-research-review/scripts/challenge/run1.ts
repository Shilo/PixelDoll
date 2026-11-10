import { realEval } from './real.ts';
import { evaluate, cases } from '../gates/pipe.ts';
for (const id of ['b-tunic', 'a-chest']) {
	const { res, clean } = await realEval(id, undefined, true);
	const h = await evaluate(cases.find((c) => c.id === id)!);
	console.log(id, 'REAL clean', clean, 'status', res.qa?.qa.status, 'g1', [...res.g1.values()], 'fails', [...(res.qa?.failCalls.values() ?? [])].flat().slice(0, 4), 'warn', res.qa?.warnings.slice(0, 6));
	console.log(id, 'HARNESS clean', h.clean, h.status, h.g1, h.fails.slice(0, 4), h.warnings.slice(0, 6));
}
