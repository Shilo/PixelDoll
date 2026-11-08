/** The app stays interactive. This is an opportunity to reload, never a startup wait. */
export const STARTUP_AUTO_UPDATE_MS = 15_000;
export class StartupUpdateCancelled extends Error {
	constructor() {
		super('The startup update window closed. Update when you are ready.');
	}
}
let eligible = false,
	opened = false,
	attempted = false,
	deadline = 0,
	wallDeadline = 0;
let marker = '';
let cancel = () => {};

/** Called before bootstrap, so input cannot slip between rendering and attaching Studio's listeners. */
export function observeStartupUpdate() {
	const navigation = performance.getEntriesByType('navigation')[0] as
		PerformanceNavigationTiming | undefined;
	const lifecycle = document as Document & { wasDiscarded?: boolean; prerendering?: boolean };
	eligible =
		!!navigation &&
		['navigate', 'reload'].includes(navigation.type) &&
		!lifecycle.wasDiscarded &&
		!lifecycle.prerendering &&
		navigator.onLine &&
		document.visibilityState === 'visible' &&
		document.hasFocus();
	marker = `pixeldoll.startupUpdate:${new URL(import.meta.env.BASE_URL, document.baseURI).href}`;
	try {
		// Suppress the document reached by our own reload, even if a deployment race served a different target.
		if (sessionStorage.getItem(marker)) {
			eligible = false;
			sessionStorage.removeItem(marker);
		}
	} catch {
		eligible = false;
	} // Optional session storage cannot make startup or manual updates fail.
	let timer: ReturnType<typeof setTimeout> | undefined;
	const intent = (event: Event) => {
		if (event.isTrusted) cancel();
	};
	// Capture also receives element blur during the app's own focus changes. Only leaving the window closes this opportunity.
	const blur = (event: Event) => {
		if (event.target === window) cancel();
	};
	const visibility = () => {
		if (document.visibilityState !== 'visible') cancel();
	};
	const restored = (event: PageTransitionEvent) => {
		if (event.persisted) cancel();
	};
	const inputs = [
		'pointerdown',
		'click',
		'keydown',
		'beforeinput',
		'input',
		'compositionstart',
		'paste',
		'drop',
		'wheel',
		'touchstart'
	];
	const exits = ['pagehide', 'popstate', 'hashchange', 'storage', 'offline'];
	cancel = () => {
		eligible = false;
		clearTimeout(timer);
		for (const type of inputs) window.removeEventListener(type, intent, true);
		for (const type of exits) window.removeEventListener(type, cancel, true);
		window.removeEventListener('blur', blur, true);
		document.removeEventListener('visibilitychange', visibility);
		window.removeEventListener('pageshow', restored);
	};
	if (!eligible) return cancel;
	for (const type of inputs)
		window.addEventListener(type, intent, { capture: true, passive: true });
	for (const type of exits) window.addEventListener(type, cancel, true);
	window.addEventListener('blur', blur, true);
	document.addEventListener('visibilitychange', visibility);
	window.addEventListener('pageshow', restored);
	// The deadline starts when the app appears, not while modules and existing storage initialize.
	armDeadline = () => {
		timer = setTimeout(cancel, STARTUP_AUTO_UPDATE_MS);
	};
	return cancel;
}
let armDeadline = () => {};
export function openStartupUpdateWindow() {
	if (opened) return;
	// Some systems pause the monotonic clock during sleep. Either clock can close, never extend, this opportunity.
	opened = true;
	deadline = performance.now() + STARTUP_AUTO_UPDATE_MS;
	wallDeadline = Date.now() + STARTUP_AUTO_UPDATE_MS;
	if (eligible) armDeadline();
}
export function assertStartupUpdate() {
	if (
		!eligible ||
		!opened ||
		performance.now() >= deadline ||
		Date.now() >= wallDeadline ||
		!navigator.onLine ||
		document.visibilityState !== 'visible' ||
		!document.hasFocus() ||
		document.querySelector(
			'dialog[open], [popover]:popover-open, input:focus, textarea:focus, select:focus, [contenteditable="true"]:focus'
		) ||
		// Native history restoration/autofill need not dispatch input. Do not erase a restored search or form.
		[
			...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
				'input:not([type="hidden"]), textarea'
			)
		].some((field) =>
			field instanceof HTMLInputElement && ['checkbox', 'radio'].includes(field.type)
				? field.checked !== field.defaultChecked
				: field.value !== field.defaultValue
		)
	)
		throw new StartupUpdateCancelled();
}
export function claimStartupUpdate() {
	if (attempted) return false;
	try {
		assertStartupUpdate();
	} catch (error) {
		if (error instanceof StartupUpdateCancelled) return false;
		throw error;
	}
	attempted = true;
	return true;
}
/** Called synchronously immediately before reload. Never persist credentials or UI snapshots. */
export function markStartupUpdateReload() {
	assertStartupUpdate();
	try {
		sessionStorage.setItem(marker, '1');
	} catch {
		cancel();
		throw new StartupUpdateCancelled();
	}
}
