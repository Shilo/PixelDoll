/** App tips: small callouts, each anchored to one control, that end for good once the person does what they suggest or
 *  closes them (Apple TipKit's model). The app only reports those events; this module owns which tips are done, keeps
 *  that across visits, and lets one tip show at a time. See docs/design/onboarding.md. */
import { workspaceCopy } from '../../lib/store/workspace-mode.ts';

export type TipId = 'gear' | 'export' | 'pixellab';

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
	/** The tip on screen: one at a time. */
	showing: null as TipId | null,
	/** Asked for again this visit (Help > Show tips again): tips that otherwise only greet a newcomer show too. */
	requested: false,
	/** Bumped by each request, so the app can take the person to where the first tip lives. */
	request: 0
});

export const tipsEnabled = !workspaceCopy;

export function tipDone(id: TipId): boolean {
	return !tipsEnabled || !!tips.done[id];
}

/** The person did what the tip suggests, or closed it: it never shows on its own again. */
export function completeTip(id: TipId) {
	if (!tipsEnabled || tips.done[id]) return;
	tips.done[id] = true;
	write();
}

/** Every tip shows again, from the first. */
export function showTipsAgain() {
	tips.done = {};
	write();
	tips.requested = true;
	tips.request++;
}
