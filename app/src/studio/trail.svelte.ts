// Feeds the problem report trail (lib/report/trail.ts) from the page: presses, sheets, screens, page visibility and
// connection, and PixelLab request transitions; problem notices record themselves in toast(). Only app vocabulary is recorded: a press names its control only through a static data-trail attribute,
// never through visible text or an accessible name, which can hold a character name or a prompt.
import { track, watchRequests } from '../lib/report/trail.ts';
import { queue } from '../lib/pixellab/queue.ts';
import { experience } from './experience/state.svelte.ts';
import { areaOf, currentArea } from './problemCapture.svelte.ts';
import { ui } from './state.svelte.ts';

const requests = watchRequests(performance.timeOrigin);
/** performance.now() when this tab saw the request settle, or undefined when it settled before this page or elsewhere: a
 *  report of it then has no trail, since this page's actions did not lead to it. */
export const settledAt = (id: string) => requests.settledAt(id);

/** Controls a press can land on. A press elsewhere (text, the canvas, a dialog backdrop) is not an action. */
const CONTROL =
	'[data-trail],button,a[href],summary,[role="button"],[role="menuitem"],[role="menuitemradio"],[role="tab"],[role="option"],[role="switch"],[role="checkbox"],[role="radio"],input[type="radio"],input[type="checkbox"]';

/** A press in Settings is named by the built-in ID its row already carries for Settings search (data-setting) or by its
 *  section's ID, as settings.<id> in camelCase. Both are fixed app IDs, never text; report.ts checks the name again. */
function settingName(control: Element): string | undefined {
	const id =
		control.getAttribute('data-setting-section') ??
		control.closest('[data-setting]')?.getAttribute('data-setting');
	return id
		? `settings.${id.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase())}`
		: undefined;
}

export function installTrail(): () => void {
	const press = (event: MouseEvent) => {
		// Programmatic clicks (a hidden download link) are not the person's actions.
		if (!event.isTrusted || !(event.target instanceof Element)) return;
		const control = event.target.closest(CONTROL);
		if (!control || control.closest('[data-trail-skip]')) return;
		const name = control.getAttribute('data-trail') ?? settingName(control);
		track({ kind: 'press', area: currentArea(), control: name });
	};
	// Files reach the app without a press on a named control: record that one arrived, never its name.
	const drop = (event: DragEvent) => {
		if (event.isTrusted && event.dataTransfer?.types.includes('Files'))
			track({ kind: 'press', area: currentArea(), control: 'file.drop' });
	};
	const change = (event: Event) => {
		if (event.isTrusted && event.target instanceof HTMLInputElement && event.target.type === 'file')
			track({ kind: 'press', area: currentArea(), control: 'file.choose' });
	};
	const visibility = () =>
		track({ kind: 'page', state: document.visibilityState === 'hidden' ? 'hidden' : 'visible' });
	const online = () => track({ kind: 'page', state: 'online' });
	const offline = () => track({ kind: 'page', state: 'offline' });
	// Capture on window runs before handlers that stop a press from propagating (tilePress.ts).
	addEventListener('click', press, true);
	addEventListener('drop', drop, true);
	addEventListener('change', change, true);
	addEventListener('online', online);
	addEventListener('offline', offline);
	document.addEventListener('visibilitychange', visibility);

	// A follower tab only mirrors the requests another tab runs.
	const unsubscribe = queue.subscribe((snapshot) =>
		requests.update(snapshot.jobs, snapshot.role !== 'follower')
	);

	let sheet: typeof ui.sheet = null;
	let overlay = false;
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
		$effect(() => {
			const open = ui.settingsOverlay;
			if (open === overlay) return;
			overlay = open;
			track({ kind: open ? 'open' : 'close', area: 'Settings' });
		});
	});

	return () => {
		removeEventListener('click', press, true);
		removeEventListener('drop', drop, true);
		removeEventListener('change', change, true);
		removeEventListener('online', online);
		removeEventListener('offline', offline);
		document.removeEventListener('visibilitychange', visibility);
		unsubscribe();
		stopScreen();
	};
}
