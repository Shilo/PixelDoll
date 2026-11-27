/** App tips: small callouts, each anchored to one control, that end for good once the person does what they suggest or
 *  closes them (Apple TipKit's model). This module owns which tips are done and keeps that across visits. The app never
 *  reports to it: TipsHost observes app state and the page. See docs/design/onboarding.md. */
import { untrack } from 'svelte';
import { workspaceCopy } from '../../lib/store/workspace-mode.ts';
import { TIP_IDS, type TipId } from './ids.ts';

export { TIP_IDS, type TipId };

/** The done tips, as a JSON array of ids. Ids this version does not know are ignored. */
export const TIPS_KEY = 'pixeldoll.tips';

function read(): Partial<Record<TipId, true>> {
	try {
		const ids: unknown = JSON.parse(localStorage.getItem(TIPS_KEY) ?? '[]');
		return Object.fromEntries((Array.isArray(ids) ? ids : []).map((id) => [id, true]));
	} catch {
		// Storage can be blocked (private mode, site data off): tips then show once per visit.
		return {};
	}
}
function write() {
	try {
		localStorage.setItem(TIPS_KEY, JSON.stringify(Object.keys(tips.done).sort()));
	} catch {
		// Blocked storage keeps done tips for this visit only (see read).
	}
}

export const tips = $state({
	/** Done tips (acted on or closed). A workspace copy is someone's backup opened for a look: no tips there. */
	done: workspaceCopy ? {} : read(),
	/** Asked for again this visit (Show tips again): tips that otherwise only greet a newcomer show too. */
	requested: false,
	/** Bumped by each request, so baselines such as the outfit start over. */
	request: 0
});

/** Backups opened for a look (workspace copies) never show tips or offer Show tips again. */
export const tipsEnabled = !workspaceCopy;

export function tipDone(id: TipId): boolean {
	return !tipsEnabled || !!tips.done[id];
}

/** The person did what the tip suggests, or closed it: it never shows on its own again. */
export function completeTip(id: TipId) {
	// Untracked, so an effect that completes a tip reruns only when what it watches changes, never when tips reset.
	untrack(() => {
		if (!tipsEnabled || tips.done[id]) return;
		// Merge with what storage holds now, so another tab's progress (or its Show tips again) is not overwritten.
		tips.done = { ...read(), [id]: true };
		write();
	});
}

// Another tab finished a tip or asked for them all again: this tab follows.
if (tipsEnabled && typeof addEventListener === 'function')
	addEventListener('storage', (event) => {
		if (event.key === TIPS_KEY || event.key === null) tips.done = read();
	});

/** Every tip can show again, starting where the person is now. */
export function showTipsAgain() {
	tips.done = {};
	write();
	tips.requested = true;
	tips.request++;
}
