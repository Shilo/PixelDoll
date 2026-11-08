import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface DeferredInstall extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
interface Capture {
	readonly prompt: DeferredInstall | undefined;
	readonly installed: boolean | undefined;
	take(): DeferredInstall | undefined;
	subscribe(listener: () => void): () => void;
}
const captureSource = readFileSync(new URL('../../public/install.js', import.meta.url), 'utf8');
const current = {
	build: '00000000-0000-4000-8000-000000000001',
	version: '0.4.11',
	commit: 'abc1234'
};
const scope = 'https://example.test/app/';

function capture(framed = false, initiallyStandalone = false, iosStandalone = false) {
	const mediaListeners = new Set<() => void>();
	const display = {
		matches: initiallyStandalone,
		addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
		removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener)
	};
	const media = vi.fn((_query: string) => display);
	const window = Object.assign(new EventTarget(), {
		top: undefined as unknown,
		isSecureContext: true,
		matchMedia: media,
		navigator: { standalone: iosStandalone },
		__pixeldollInstall: undefined as Capture | undefined
	});
	window.top = framed ? {} : window;
	runInNewContext(captureSource, { window });
	return {
		window,
		bridge: window.__pixeldollInstall,
		media,
		standalone: (matches: boolean) => {
			display.matches = matches;
			for (const listener of mediaListeners) listener();
		}
	};
}
function installEvent(outcome: 'accepted' | 'dismissed' = 'dismissed') {
	return Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
		prompt: vi.fn(async () => {}),
		userChoice: Promise.resolve({ outcome })
	});
}

let stop: (() => void) | undefined;
afterEach(() => {
	stop?.();
	stop = undefined;
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

async function clientEnvironment(initiallyStandalone = false, iosStandalone = false) {
	vi.resetModules();
	vi.useFakeTimers();
	vi.stubEnv('PROD', true);
	vi.stubEnv('BASE_URL', './');
	vi.stubGlobal('__APP_BUILD__', current.build);
	const captured = capture(false, initiallyStandalone, iosStandalone);
	const document = Object.assign(new EventTarget(), {
		baseURI: scope,
		visibilityState: 'visible',
		fullscreenElement: null as object | null
	});
	const registration = {
		scope,
		active: null,
		waiting: null,
		installing: null,
		update: vi.fn(async () => {}),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn()
	};
	const navigator = {
		standalone: false,
		serviceWorker: {
			getRegistration: vi.fn(async () => registration),
			register: vi.fn(async () => registration),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		}
	};
	const reload = vi.fn();
	vi.stubGlobal('window', captured.window);
	vi.stubGlobal('document', document);
	vi.stubGlobal('navigator', navigator);
	vi.stubGlobal('addEventListener', captured.window.addEventListener.bind(captured.window));
	vi.stubGlobal('removeEventListener', captured.window.removeEventListener.bind(captured.window));
	vi.stubGlobal('matchMedia', captured.media);
	vi.stubGlobal('location', { reload });
	vi.stubGlobal(
		'fetch',
		vi.fn(
			async () =>
				new Response(JSON.stringify(current), { headers: { 'content-type': 'application/json' } })
		)
	);
	const client = await import('../../src/lib/pwa.ts');
	return {
		...captured,
		client,
		document,
		navigator,
		reload,
		start: () => {
			stop = client.startPwa();
		}
	};
}

describe('early native install capture', () => {
	it('retains an event before observers exist, publishes it immediately, and consumes it only once', () => {
		const { window, bridge } = capture();
		expect(bridge!.installed).toBeUndefined();
		const event = installEvent();
		window.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(bridge!.prompt).toBe(event);
		expect(event.prompt).not.toHaveBeenCalled();
		const observed: (DeferredInstall | undefined)[] = [];
		const off = bridge!.subscribe(() => observed.push(bridge!.prompt));
		expect(observed).toEqual([event]);
		expect(bridge!.take()).toBe(event);
		expect(bridge!.take()).toBeUndefined();
		expect(bridge!.prompt).toBeUndefined();
		off();
		window.dispatchEvent(installEvent());
		expect(observed.every((value) => value === event || value === undefined)).toBe(true);
		expect(observed.at(-1)).toBeUndefined();
	});

	it('retains positive installation before subscribers and accepts a fresh browser offer after uninstall', () => {
		const { window, bridge } = capture();
		window.dispatchEvent(installEvent());
		window.dispatchEvent(new Event('appinstalled'));
		const listener = vi.fn();
		bridge!.subscribe(listener);
		expect(listener).toHaveBeenCalledOnce();
		expect(bridge!.installed).toBe(true);
		expect(bridge!.prompt).toBeUndefined();
		const reinstall = installEvent();
		window.dispatchEvent(reinstall);
		expect(bridge!.installed).toBe(false);
		expect(bridge!.prompt).toBe(reinstall);
		expect(bridge!.take()).toBe(reinstall);
	});

	it('does not erase positive installation evidence for an event without a native prompt function', () => {
		const { window, bridge } = capture();
		window.dispatchEvent(new Event('appinstalled'));
		const invalid = new Event('beforeinstallprompt', { cancelable: true });
		window.dispatchEvent(invalid);
		expect(invalid.defaultPrevented).toBe(false);
		expect(bridge!.installed).toBe(true);
		expect(bridge!.prompt).toBeUndefined();
	});

	it('does not capture or suppress another page’s install flow when framed', () => {
		const { window, bridge } = capture(true);
		const event = installEvent();
		window.dispatchEvent(event);
		expect(bridge).toBeUndefined();
		expect(event.defaultPrevented).toBe(false);
		expect(event.prompt).not.toHaveBeenCalled();
	});
});

describe('native install action state', () => {
	it('consumes an early browser offer before awaiting the prompt and ignores duplicate clicks', async () => {
		const app = await clientEnvironment();
		let choose!: (choice: { outcome: 'dismissed' }) => void;
		const event = installEvent();
		event.userChoice = new Promise((resolve) => {
			choose = resolve;
		});
		app.window.dispatchEvent(event);
		app.start();
		expect(get(app.client.pwa).installable).toBe(true);
		const first = app.client.installApp();
		expect(event.prompt).toHaveBeenCalledOnce();
		expect(app.bridge!.prompt).toBeUndefined();
		expect(get(app.client.pwa).installing).toBe(true);
		expect(await app.client.installApp()).toBe(false);
		expect(event.prompt).toHaveBeenCalledOnce();
		choose({ outcome: 'dismissed' });
		expect(await first).toBe(true);
		expect(get(app.client.pwa)).toMatchObject({
			installable: false,
			installed: false,
			installing: false
		});
		expect(app.reload).not.toHaveBeenCalled();
	});

	it('does not treat acceptance as installation and keeps positive appinstalled evidence latched', async () => {
		const app = await clientEnvironment();
		app.window.dispatchEvent(installEvent('accepted'));
		app.start();
		expect(await app.client.installApp()).toBe(true);
		expect(get(app.client.pwa)).toMatchObject({ installable: false, installed: false });
		app.window.dispatchEvent(new Event('appinstalled'));
		expect(get(app.client.pwa).installed).toBe(true);
		app.standalone(true);
		app.standalone(false);
		expect(get(app.client.pwa)).toMatchObject({ installed: true, installable: false });
		expect(await app.client.installApp()).toBe(false);
	});

	it('uses standalone launch evidence without treating ordinary fullscreen as installation', async () => {
		const app = await clientEnvironment();
		app.start();
		app.document.fullscreenElement = {};
		app.window.dispatchEvent(new Event('fullscreenchange'));
		expect(get(app.client.pwa).installed).toBe(false);
		expect(app.media).toHaveBeenCalledOnce();
		expect(app.media).toHaveBeenCalledWith('(display-mode: standalone)');
		app.standalone(true);
		app.standalone(false);
		expect(get(app.client.pwa).installed).toBe(true);
	});

	it('uses newer standalone and native-offer evidence in order after an offer was dismissed', async () => {
		const app = await clientEnvironment();
		app.start();
		app.window.dispatchEvent(installEvent('dismissed'));
		expect(await app.client.installApp()).toBe(true);
		expect(app.bridge!.installed).toBe(false);
		expect(get(app.client.pwa)).toMatchObject({ installed: false, installable: false });
		app.standalone(true);
		expect(get(app.client.pwa)).toMatchObject({ installed: true, installable: false });
		app.standalone(false);
		expect(get(app.client.pwa).installed).toBe(true);
		app.window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
		expect(get(app.client.pwa)).toMatchObject({ installed: true, installable: false });
		const reinstall = installEvent('accepted');
		app.window.dispatchEvent(reinstall);
		expect(get(app.client.pwa)).toMatchObject({ installed: false, installable: true });
		expect(await app.client.installApp()).toBe(true);
		expect(reinstall.prompt).toHaveBeenCalledOnce();
		expect(get(app.client.pwa)).toMatchObject({ installed: false, installable: false });
		app.window.dispatchEvent(new Event('appinstalled'));
		expect(get(app.client.pwa).installed).toBe(true);
	});

	it.each(['standalone', 'ios'] as const)(
		'projects initial %s launch evidence captured before the client subscribes',
		async (mode) => {
			const app = await clientEnvironment(mode === 'standalone', mode === 'ios');
			expect(app.bridge!.installed).toBe(true);
			app.start();
			expect(get(app.client.pwa)).toMatchObject({ installed: true, installable: false });
			app.standalone(false);
			expect(get(app.client.pwa).installed).toBe(true);
		}
	);

	it('reports native prompt failures separately and accepts a fresh browser offer for recovery', async () => {
		const app = await clientEnvironment();
		const help = vi.fn();
		app.client.setPwaActions(vi.fn(), help);
		app.start();
		const failed = installEvent();
		failed.prompt.mockRejectedValue(new Error('Browser rejected the prompt'));
		app.window.dispatchEvent(failed);
		expect(await app.client.installApp()).toBe(false);
		expect(get(app.client.pwa).installError).toContain('Browser rejected the prompt');
		expect(get(app.client.pwa).error).not.toContain('Browser rejected the prompt');
		expect(get(app.client.pwa)).toMatchObject({
			installed: false,
			installing: false,
			installable: false
		});
		expect(help).toHaveBeenCalledOnce();
		app.window.dispatchEvent(installEvent('dismissed'));
		expect(get(app.client.pwa)).toMatchObject({ installable: true, installError: '' });
		expect(await app.client.installApp()).toBe(true);
		expect(get(app.client.pwa).installed).toBe(false);
	});

	it('offers explicit help when installability is unknown without claiming installation', async () => {
		const app = await clientEnvironment();
		const help = vi.fn();
		app.client.setPwaActions(vi.fn(), help);
		app.start();
		expect(get(app.client.pwa)).toMatchObject({
			installed: false,
			installable: false,
			installError: ''
		});
		app.client.requestInstallHelp();
		expect(help).toHaveBeenCalledOnce();
		expect(await app.client.installApp()).toBe(false);
		expect(help).toHaveBeenCalledTimes(2);
		expect(get(app.client.pwa).installed).toBe(false);
	});
});
