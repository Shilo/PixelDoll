import { syncRiderPose } from './experience/riderPose.ts';
import { doc, store, ui } from './state.svelte.ts';

/** Mounting with a Riding pose selects it in Preview; dismounting gives Preview back its earlier selection. */
export function applyRiderPose() {
	const next = syncRiderPose(doc.id, store.project?.manifest, ui.anim);
	if (next === ui.anim) return;
	ui.anim = next;
	ui.frame = 0;
}
