import {
	audioLevel,
	audioPreferenceStore,
	channelAudible,
	defaultAudioPreferences,
	type AudioChannel,
	type AudioPreferences
} from './audioPreferences.ts';
import type { AudioCue } from './audioCues.ts';
import type { AudioPlayback } from './audioPlayback.ts';

let preferences = $state.raw(audioPreferenceStore.read());
let unsaved = false;
let context: AudioContext | undefined;
let playback: AudioPlayback | undefined;
let loading = false;
let unavailable = false;
let effectsUnavailable = false;
let pageOpen = true;
let musicPlaying = $state(false);

export const audioPreferences = () => preferences;
export const isMusicPlaying = () => musicPlaying;

export function audioAtDefaults(): boolean {
	return (
		!unsaved &&
		(Object.keys(defaultAudioPreferences) as (keyof AudioPreferences)[]).every(
			(key) => preferences[key] === defaultAudioPreferences[key]
		)
	);
}

function setPreferences(change: (current: AudioPreferences) => AudioPreferences): boolean {
	const result = audioPreferenceStore.update(change, unsaved ? preferences : undefined);
	preferences = result.preferences;
	unsaved = !result.saved;
	return result.saved;
}

export function setAudioEnabled(enabled: boolean, event: Event, channel?: AudioChannel): boolean {
	const key = channel ? (`${channel}Muted` as const) : 'muted';
	const saved = setPreferences((current) => ({ ...current, [key]: !enabled }));
	if (enabled) activateAudio(event);
	return saved;
}

export function setAudioLevel(channel: AudioChannel, value: number, event: Event): boolean {
	const saved = setPreferences((current) => ({
		...current,
		[channel]: audioLevel(value, current[channel])
	}));
	activateAudio(event);
	return saved;
}

export const resetAudio = () => setPreferences(() => ({ ...defaultAudioPreferences }));

function visible(): boolean {
	return pageOpen && document.visibilityState === 'visible' && document.hasFocus();
}

function updatePlayback() {
	try {
		playback?.update(preferences, visible());
	} catch (error) {
		disableAudio(error);
	}
}

export function syncAudio() {
	// Track preferences before Web Audio exists so settings stay in sync after activation.
	void preferences;
	updatePlayback();
}

function allowedAudio(): boolean {
	return channelAudible(preferences, 'music') || channelAudible(preferences, 'effects');
}

function closeAudio() {
	const closing = context;
	const player = playback;
	context = undefined;
	playback = undefined;
	musicPlaying = false;
	loading = false;
	closing?.removeEventListener('statechange', updatePlayback);
	try {
		player?.dispose();
	} catch (error) {
		console.warn('PixelDoll audio could not release its buffers.', error);
	}
	if (closing && closing.state !== 'closed') {
		void closing.close().catch((error: unknown) => {
			console.warn('PixelDoll audio could not close.', error);
		});
	}
}

/** Audio is optional feedback. Playback errors must never turn a completed Studio action into a failure. */
function disableAudio(error: unknown) {
	unavailable = true;
	console.warn('PixelDoll audio could not play.', error);
	closeAudio();
}

// Keep creation and resume on the trusted gesture stack, before the lazy module load.
function activateAudio(event: Event) {
	if (
		unavailable ||
		!event.isTrusted ||
		navigator.userActivation?.isActive === false ||
		!allowedAudio() ||
		!visible()
	)
		return;

	try {
		if (!context) {
			context = new AudioContext();
			context.addEventListener('statechange', updatePlayback);
		}
		if (context.state !== 'running') {
			const resuming = context;
			void resuming.resume().catch((error: unknown) => {
				if (context === resuming) console.warn('PixelDoll audio could not resume.', error);
			});
		}
	} catch (error) {
		disableAudio(error);
		return;
	}
	if (playback || loading) return;

	const started = context;
	loading = true;
	void import('./audioPlayback.ts')
		.then(({ createAudioPlayback }) => {
			if (context !== started) return;
			playback = createAudioPlayback(started, (playing) => {
				if (context === started) musicPlaying = playing;
			});
			updatePlayback();
		})
		.catch((error: unknown) => {
			if (context === started) disableAudio(error);
		});
}

let cueRevision = 0;

export function playAudioCue(cue: AudioCue): void {
	if (
		effectsUnavailable ||
		!playback ||
		context?.state !== 'running' ||
		!channelAudible(preferences, 'effects')
	)
		return;
	if (!visible()) return;
	cueRevision++;
	try {
		playback.play(cue);
	} catch (error) {
		effectsUnavailable = true;
		console.warn('PixelDoll sound effects could not play.', error);
	}
}

const controlSelector =
	'button, a[href], summary, select, input[type="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], [role="button"], [role="menuitem"], [role="tab"], label.bu-check';

function control(target: EventTarget | null): Element | undefined {
	if (!(target instanceof Element)) return;
	const candidate = target.closest(controlSelector);
	if (
		candidate &&
		!candidate.closest(':disabled, [aria-disabled="true"], [inert], [data-audio-controls]') &&
		!candidate.querySelector('input:disabled')
	)
		return candidate;
}

export function watchAudio() {
	pageOpen = true;
	const listeners = new AbortController();
	const { signal } = listeners;
	const stopWatching = audioPreferenceStore.watch(() => {
		preferences = audioPreferenceStore.read();
		unsaved = false;
	});
	let lastHover = -Infinity;
	let lastPress = -Infinity;
	addEventListener(
		'pointerover',
		(event) => {
			if (!event.isTrusted || event.pointerType !== 'mouse' || event.buttons || !playback) return;
			const entered = control(event.target);
			if (!entered || entered === control(event.relatedTarget)) return;
			const now = performance.now();
			if (now - lastHover < 400 || now - lastPress < 250) return;
			lastHover = now;
			playAudioCue('hover');
		},
		{ signal, passive: true }
	);
	addEventListener(
		'keydown',
		(event) => {
			if (!event.repeat && !event.ctrlKey && !event.metaKey && event.key !== 'Tab')
				activateAudio(event);
		},
		{ signal, capture: true }
	);
	// Live views also accept pointer gestures that never produce a native click.
	addEventListener(
		'pointerdown',
		(event) => {
			if (event.pointerType === 'mouse') activateAudio(event);
		},
		{ signal, capture: true, passive: true }
	);
	addEventListener(
		'pointerup',
		(event) => {
			if (event.pointerType !== 'mouse') activateAudio(event);
		},
		{ signal, capture: true, passive: true }
	);
	addEventListener(
		'click',
		(event) => {
			if (!event.isTrusted) return;
			activateAudio(event);
			if (!control(event.target)) return;
			const now = performance.now();
			if (now - lastPress < 80) return;
			lastPress = now;
			const before = cueRevision;
			// Wait for event handlers. A cue microtask from capture can run before the target handler.
			setTimeout(() => {
				if (!signal.aborted && cueRevision === before) playAudioCue('press');
			}, 0);
		},
		{ signal, capture: true }
	);
	document.addEventListener('visibilitychange', updatePlayback, { signal });
	addEventListener('focus', updatePlayback, { signal });
	addEventListener('blur', updatePlayback, { signal });
	addEventListener(
		'online',
		() => {
			try {
				playback?.retryMusic();
			} catch (error) {
				disableAudio(error);
			}
		},
		{ signal }
	);
	addEventListener(
		'pagehide',
		() => {
			pageOpen = false;
			updatePlayback();
		},
		{ signal }
	);
	addEventListener(
		'pageshow',
		() => {
			pageOpen = true;
			updatePlayback();
		},
		{ signal }
	);
	return () => {
		listeners.abort();
		stopWatching();
		closeAudio();
	};
}
