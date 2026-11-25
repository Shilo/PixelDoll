import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DEVELOPER_MODE_KEY } from '../../src/lib/debug/flags.ts';
import { audioPreferenceStore } from '../../src/studio/audioPreferences.ts';

const player = vi.hoisted(() => ({
	update: vi.fn(),
	play: vi.fn(),
	dispose: vi.fn()
}));
vi.mock('../../src/studio/audioPlayback.ts', () => ({ createAudioPlayback: () => player }));

const savedAudio = '{"music":75,"effects":30,"muted":false}';
const storage = new Map<string, string>();
const audioKey = audioPreferenceStore.key;
const close = vi.fn().mockResolvedValue(undefined);
const createContext = vi.fn();

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	storage.clear();
	storage.set(audioKey, savedAudio);
	const identity = <T>(value: T) => value;
	vi.stubGlobal('$state', Object.assign(identity, { raw: identity }));
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => storage.set(key, value),
		removeItem: (key: string) => storage.delete(key)
	});
	const events = new EventTarget();
	vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
	vi.stubGlobal('removeEventListener', events.removeEventListener.bind(events));
	vi.stubGlobal('dispatchEvent', events.dispatchEvent.bind(events));
	vi.stubGlobal(
		'document',
		Object.assign(new EventTarget(), {
			visibilityState: 'visible',
			hasFocus: () => true
		})
	);
	vi.stubGlobal(
		'AudioContext',
		class extends EventTarget {
			state = 'running';
			close = close;
			constructor() {
				super();
				createContext();
			}
		}
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

function gesture() {
	const event = new Event('keydown');
	Object.defineProperty(event, 'isTrusted', { value: true });
	dispatchEvent(event);
}

test.each([
	{ mode: 'agent', developer: false, dev: true, muted: true },
	{ mode: 'development', developer: true, dev: true, muted: true },
	{ mode: 'production', developer: true, dev: false, muted: false }
])('playback in $mode with Developer mode $developer', async ({ mode, developer, dev, muted }) => {
	vi.stubEnv('MODE', mode);
	vi.stubEnv('DEV', dev);
	if (developer) storage.set(DEVELOPER_MODE_KEY, '1');
	const audio = await import('../../src/studio/audio.svelte.ts');
	const stop = audio.watchAudio();
	try {
		audio.syncAudio();
		gesture();
		await vi.dynamicImportSettled();
		audio.playAudioCue('press');
		expect(createContext).toHaveBeenCalledTimes(muted ? 0 : 1);
		expect(player.update).toHaveBeenCalledTimes(muted ? 0 : 1);
		expect(player.play).toHaveBeenCalledTimes(muted ? 0 : 1);
		expect(audio.hasEnabledAudio()).toBe(true);
		expect(storage.get(audioKey)).toBe(savedAudio);
	} finally {
		stop();
	}
});

test('Developer mode stops existing playback and allows it again after disabling the mode', async () => {
	vi.stubEnv('MODE', 'development');
	vi.stubEnv('DEV', true);
	const audio = await import('../../src/studio/audio.svelte.ts');
	const { setDeveloperMode } = await import('../../src/studio/developerMode.svelte.ts');
	const stop = audio.watchAudio();
	try {
		gesture();
		await vi.dynamicImportSettled();
		expect(player.update).toHaveBeenCalledOnce();

		setDeveloperMode(true);
		audio.syncAudio();
		gesture();
		audio.playAudioCue('press');
		expect(player.dispose).toHaveBeenCalledOnce();
		expect(close).toHaveBeenCalledOnce();
		expect(createContext).toHaveBeenCalledOnce();
		expect(player.play).not.toHaveBeenCalled();

		setDeveloperMode(false);
		audio.syncAudio();
		gesture();
		await vi.dynamicImportSettled();
		audio.playAudioCue('press');
		expect(createContext).toHaveBeenCalledTimes(2);
		expect(player.play).toHaveBeenCalledExactlyOnceWith('press');
		expect(storage.get(audioKey)).toBe(savedAudio);
	} finally {
		stop();
	}
});
