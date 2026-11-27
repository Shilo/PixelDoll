// Feeds the problem report trail (lib/report/trail.ts) from the page: presses, sheets, screens, page visibility and
// connection, and PixelLab request transitions; problem notices record themselves in toast(). Only app vocabulary is recorded: a press names its control only through a static data-trail attribute,
// never through visible text or an accessible name, which can hold a character name or a prompt.
import { track } from '../lib/report/trail.ts';
import { queue } from '../lib/pixellab/queue.ts';
import { experience } from './experience/state.svelte.ts';
import { areaOf } from './problemCapture.svelte.ts';
import { ui } from './state.svelte.ts';

/** Controls a press can land on. A press elsewhere (text, the canvas, a dialog backdrop) is not an action. */
const CONTROL =
	'[data-trail],button,a[href],summary,[role="button"],[role="menuitem"],[role="menuitemradio"],[role="tab"],[role="option"],[role="switch"],[role="checkbox"],[role="radio"]';

export function installTrail(): () => void {
	const press = (event: MouseEvent) => {
		// Programmatic clicks (a hidden download link) are not the person's actions.
		if (!event.isTrusted || !(event.target instanceof Element)) return;
		const control = event.target.closest(CONTROL);
		if (!control || control.closest('[data-trail-skip]')) return;
		const name = control.getAttribute('data-trail') ?? undefined;
		track({ kind: 'press', area: areaOf(ui.sheet), control: name });
	};
	const visibility = () =>
		track({ kind: 'page', state: document.visibilityState === 'hidden' ? 'hidden' : 'visible' });
	const online = () => track({ kind: 'page', state: 'online' });
	const offline = () => track({ kind: 'page', state: 'offline' });
	// Capture on window runs before handlers that stop a press from propagating (tilePress.ts).
	addEventListener('click', press, true);
	addEventListener('online', online);
	addEventListener('offline', offline);
	document.addEventListener('visibilitychange', visibility);

	// Request transitions only: the queue notifies on every poll, and most notifications change nothing.
	const states = new Map<string, string>();
	const unsubscribe = queue.subscribe((snapshot) => {
		const seen = new Set<string>();
		for (const record of snapshot.jobs) {
			seen.add(record.id);
			if (states.get(record.id) === record.state) continue;
			// A record from an earlier visit is history until it changes here.
			const known = states.has(record.id) || record.createdAt >= performance.timeOrigin;
			states.set(record.id, record.state);
			if (known)
				track({
					kind: 'job',
					method: record.method,
					endpoint: record.endpoint,
					state: record.state
				});
		}
		for (const id of states.keys()) if (!seen.has(id)) states.delete(id);
	});

	let sheet: typeof ui.sheet = null;
	const stopScreen = $effect.root(() => {
		$effect(() => {
			track({ kind: 'screen', area: experience.screen === 'studio' ? 'Studio' : 'Characters' });
		});
		// Effects batch changes, so a sheet opened and closed again within one tick is not recorded.
		$effect(() => {
			const next = ui.sheet;
			if (next === sheet) return;
			if (sheet) track({ kind: 'close', area: areaOf(sheet) });
			if (next) track({ kind: 'open', area: areaOf(next) });
			sheet = next;
		});
	});

	return () => {
		removeEventListener('click', press, true);
		removeEventListener('online', online);
		removeEventListener('offline', offline);
		document.removeEventListener('visibilitychange', visibility);
		unsubscribe();
		stopScreen();
	};
}
