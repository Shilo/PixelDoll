// Idea 1 decisive test on matched paid output already on disk (no PixelLab call): the same frozen walk frames and
// the same approved design were (a) painted on the real frames with edit-animation-v2, (b) painted on the real frames
// with transfer-outfit-v2, (c) re-posed with animate-with-skeleton-v3 from the dressed standing view. Does (c) misfit the base?
import { readFileSync, writeFileSync } from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { evaluateTrialFrames } = await import(APP + 'scripts/item-trial-evaluate.ts');
const { base64ToBytes } = await import(APP + 'src/lib/image/png.ts');
const { decodePngBytes } = await import(APP + 'src/lib/image/pngraw.ts');
const { fit, summarize } = await import('./fitlib.mts');
const plan = JSON.parse(
	readFileSync(new URL('test-results-item-trials/final-evidence/plan.json', APP), 'utf8')
);
const groups: Record<string, any[]> = {};
const perTrial: any[] = [];
for (const t of plan.trials) {
	const { packet, arm } = t.record;
	if (packet.conditioning !== 'raw') continue; // matched comparison uses raw conditioning only
	const imgs = [...t.images].sort(
		(a: any, b: any) => Number(a.label.match(/\d+$/)?.[0] ?? 0) - Number(b.label.match(/\d+$/)?.[0] ?? 0)
	);
	const frames = await Promise.all(imgs.map((i: any) => decodePngBytes(base64ToBytes(i.png))));
	const { cells } = await evaluateTrialFrames(packet, arm, frames, packet.id);
	const rows = cells.map((c: any) => fit(c, packet.key));
	const g = `${packet.caseId} ${packet.direction} ${arm}`;
	(groups[g] ??= []).push(...rows);
	perTrial.push({ id: packet.id, arm, rows });
}
const out = Object.entries(groups)
	.sort()
	.map(([g, rows]) => ({ group: g, ...summarize(rows) }));
console.table(out);
writeFileSync(new URL('./trials-fit.json', import.meta.url), JSON.stringify({ out, perTrial }, null, 1));
