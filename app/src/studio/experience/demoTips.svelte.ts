/** The demo's first-run tips: one small callout at a time over the real editor, each ending by itself when the person
 *  does what it suggests (TipKit-style), never a tour with Next buttons. See docs/design/onboarding.md. */
import { dismissWelcome } from '../state.svelte.ts';

export type DemoTip = 'gear' | 'export';

export const demoTips = $state({
	step: null as DemoTip | null,
	/** Help > Demo tips asked to show them again: Experience opens the demo's Customize and starts them. */
	replay: false
});

/** Done or dismissed: never shown again on its own; Help replays them. */
export function finishDemoTips() {
	demoTips.step = null;
	demoTips.replay = false;
	dismissWelcome();
}

export function replayDemoTips() {
	demoTips.replay = true;
}
