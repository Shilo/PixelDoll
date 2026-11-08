// Capture the browser's single-use install event before modules, storage, or the Studio can delay startup.
(() => {
	if (window.top !== window) return;
	const display = window.matchMedia?.('(display-mode: standalone)');
	let prompt,
		installed = display?.matches || window.navigator?.standalone === true ? true : undefined;
	const listeners = new Set();
	const notify = () => {
		for (const listener of listeners) listener();
	};
	window.__pixeldollInstall = {
		get prompt() {
			return prompt;
		},
		get installed() {
			return installed;
		},
		take() {
			const event = prompt;
			prompt = undefined;
			notify();
			return event;
		},
		subscribe(listener) {
			listeners.add(listener);
			listener();
			return () => listeners.delete(listener);
		}
	};
	window.addEventListener('beforeinstallprompt', (event) => {
		if (typeof event.prompt !== 'function') return;
		event.preventDefault();
		// A fresh browser offer can follow uninstalling an app while this document is still open.
		installed = false;
		prompt = event;
		notify();
	});
	const observeInstalled = () => {
		installed = true;
		prompt = undefined;
		notify();
	};
	window.addEventListener('appinstalled', observeInstalled);
	// Positive mode transitions are newer evidence. Entering browser/fullscreen mode does not prove uninstalling.
	display?.addEventListener('change', () => {
		if (display.matches) observeInstalled();
	});
})();
