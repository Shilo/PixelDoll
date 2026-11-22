// Agents that drive the page through script evaluation receive tool results as text, never as images. Showing the evidence
// in the page lets them look at it with their screenshot tool, and lets the person see what the agent is judging.
import { mount } from 'svelte';
import type { Evidence } from './evidence.ts';
import AgentEvidence from './AgentEvidence.svelte';

class EvidencePanel {
	title = $state('');
	images = $state.raw<Evidence[]>([]);
	/** The one sheet shown, so each is as large as the window allows. */
	index = $state(0);
}

export const panel = new EvidencePanel();
let mounted = false;

export function showEvidence(title: string, images: Evidence[]) {
	if (!images.length) return;
	panel.title = title;
	panel.images = images;
	panel.index = 0;
	if (mounted) return;
	const target = document.createElement('div');
	document.body.append(target);
	mount(AgentEvidence, { target });
	mounted = true;
}

/** Shows another sheet of the call, wrapping around. */
export function turnEvidence(step: number) {
	const n = panel.images.length;
	if (n) panel.index = (panel.index + step + n) % n;
}

export function hideEvidence() {
	panel.images = [];
}
