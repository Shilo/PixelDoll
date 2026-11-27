// Feeds the problem report trail (lib/report/trail.ts) from the page: presses, sheets, screens, page visibility and
// connection, and PixelLab request transitions; problem notices record themselves in toast(). Only app vocabulary is recorded: a press names its control only through a static data-trail attribute,
// never through visible text or an accessible name, which can hold a character name or a prompt.
import { track } from '../lib/report/trail.ts';
import { queue } from '../lib/pixellab/queue.ts';
import { experience } from './experience/state.svelte.ts';
import { areaOf } from './problemCapture.svelte.ts';
import { ui } from './state.svelte.ts';

const SETTLED = new Set(['done', 'failed', 'canceled', 'lost']);
const settledHere = new Map<string, number>();
/** performance.now() when this tab saw the request settle, or undefined when it settled before this page or elsewhere: a
 *  report of it then has no trail, since this page's actions did not lead to it. */
export const settledAt = (id: string) => settledHere.get(id);

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

	// A request's start and end only: its steps in between would push the person's own actions out of the trail. Only the
	// tab that runs the requests records them; another tab's requests are not this tab's actions.
	const states = new Map<string, string>();
	const unsubscribe = queue.subscribe((snapshot) => {
		const seen = new Set<string>();
		const runsHere = snapshot.role !== 'follower';
		for (const record of snapshot.jobs) {
			seen.add(record.id);
			const before = states.get(record.id);
			if (before === record.state) continue;
			states.set(record.id, record.state);
			const settled = SETTLED.has(record.state);
			if (settled && runsHere) settledHere.set(record.id, performance.now());
			// A record from an earlier visit is history until it settles here.
			const started = before === undefined && record.createdAt >= performance.timeOrigin;
			if (runsHere && (started || (settled && before !== undefined)))
				track({
					kind: 'job',
					method: record.method,
					endpoint: record.endpoint,
					state: record.state
				});
		}
		for (const id of states.keys())
			if (!seen.has(id)) {
				states.delete(id);
				settledHere.delete(id);
			}
	});

	let sheet: typeof ui.sheet = null;
	let screen = experience.screen;
	const stopScreen = $effect.root(() => {
		// Changes only: the screen the app opens on is not an action.
		$effect(() => {
			const next = experience.screen;
			if (next === screen) return;
			screen = next;
			track({ kind: 'screen', area: next === 'studio' ? 'Studio' : 'Characters' });
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
