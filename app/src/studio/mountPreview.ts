import { message } from '../lib/message.ts';
import { setShowMount, syncRiderPose } from './experience/riderPose.ts';
import { doc, store, toast, ui } from './state.svelte.ts';

/** Mounting with a Riding pose selects it in Preview; dismounting gives Preview back its earlier selection. */
export function applyRiderPose() {
	const next = syncRiderPose(doc.id, store.project?.manifest, ui.anim);
	if (next === ui.anim) return;
	ui.anim = next;
	ui.frame = 0;
}

/** Show or hide the test mount (Mount settings, the live views' Mount action); a refused save still applies here. */
export function showMount(show: boolean) {
	if (!setShowMount(show)) toast(message('settings.mountNotSaved'), { tone: 'warning' });
	applyRiderPose();
}
