import { cases, evaluate } from './pipe.ts';
for (const c of cases.filter((c) => c.clips.length)) {
	const t = Date.now(), e = await evaluate(c);
	const sig = (m: string) => m.replace(/^(\S+ \S+).*/, '$1');
	console.log(`${c.id} clean=${e.clean} status=${e.status} g1=${e.g1.length} fails=${e.fails.length} warn=${e.warnings.length} (${Date.now() - t} ms)`);
	for (const m of [...e.g1, ...e.fails, ...e.warnings].slice(0, 12)) console.log('   ', m.slice(0, 130));
}
