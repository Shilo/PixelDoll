// Agents that drive the page through script evaluation receive tool results as text, never as images. Showing the evidence
// in the page lets them look at it with their screenshot tool, and lets the person see what the agent is judging.
import { mount } from 'svelte';
import { get } from 'svelte/store';
import { budgetView } from './budget.ts';
import { fitSheet, type Evidence } from './evidence.ts';
import AgentEvidence from './AgentEvidence.svelte';

class EvidencePanel {
	/** The tool whose sheets these are; the panel names it in the person's language. */
	tool = $state('');
	images = $state.raw<Evidence[]>([]);
	/** The one sheet shown, so each is as large as the window allows. */
	index = $state(0);
}

export const panel = new EvidencePanel();
let mounted = false;

// The panel's layout around one sheet, in CSS pixels (AgentEvidence.svelte): 16 px side padding, 16 px bottom padding and
// 24 px for the caption under a header of about 52 px, 40 px taller while the budget line floats above it.
const SIDES = 32,
	BELOW = 40,
	HEADER = 52,
	BUDGET = 40;
/** Room for a sheet in a scroller of this size. */
export const sheetArea = (scroller: { width: number; height: number }) => ({
	width: scroller.width - SIDES,
	height: scroller.height - BELOW
});
/** How a sheet will be shown in this window, before the panel has laid out: for telling the agent which ones scroll. */
export const plannedFit = (image: Evidence) =>
	fitSheet(
		image.page,
		sheetArea({
			width: innerWidth,
			height: innerHeight - HEADER - (get(budgetView).active ? BUDGET : 0)
		}),
		devicePixelRatio
	);

export function showEvidence(tool: string, images: Evidence[]) {
	if (!images.length) return;
	panel.tool = tool;
	panel.images = images;
	panel.index = 0;
	if (mounted) return;
	// A page framed by another site never shows agent controls over itself (main.ts also keeps the Studio out of frames).
	if (window.top !== window) return;
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
