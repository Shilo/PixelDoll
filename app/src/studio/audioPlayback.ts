import musicUrl from './audio/studio-ambient.mp3?url&no-inline';
import { renderCue, type AudioCue } from './audioCues.ts';
import { channelAudible, type AudioPreferences } from './audioPreferences.ts';

export interface AudioPlayback {
	update(settings: AudioPreferences, visible: boolean): void;
	retryMusic(): void;
	play(cue: AudioCue): void;
	dispose(): void;
}

const maxConcurrentCues = 4;
const musicFade = 0.65;
const isControlCue = (cue: AudioCue) => cue === 'hover' || cue === 'press';

type ActiveCue = {
	cue: AudioCue;
	source: AudioBufferSourceNode;
	gain: GainNode;
};

function volume(level: number, ceiling: number): number {
	return ceiling * (Math.max(0, Math.min(100, level)) / 100) ** 1.35;
}

export function createAudioPlayback(
	context: AudioContext,
	onMusicPlaying: (playing: boolean) => void
): AudioPlayback {
	const musicGain = context.createGain();
	const effectsGain = context.createGain();
	for (const gain of [musicGain, effectsGain]) {
		gain.gain.value = 0;
		gain.connect(context.destination);
	}

	const lifetime = new AbortController();
	const cueBuffers = new Map<AudioCue, AudioBuffer>();
	const activeCues = new Set<ActiveCue>();
	let musicBuffer: AudioBuffer | undefined;
	let musicBytes: ArrayBuffer | undefined;
	let music: { source: AudioBufferSourceNode; envelope: GainNode; startedAt: number } | undefined;
	let musicLoading = false;
	let musicFailed = false;
	let musicOffset = 0;
	let musicLevel = 0;
	let effectsLevel = 0;
	let playingAllowed = false;
	let disposed = false;

	function stopMusic() {
		onMusicPlaying(false);
		if (!music) return;
		const { source, envelope, startedAt } = music;
		music = undefined;
		musicOffset =
			(musicOffset + Math.max(0, context.currentTime - startedAt)) % musicBuffer!.duration;
		source.disconnect();
		envelope.disconnect();
		source.stop();
	}

	async function loadMusic() {
		musicLoading = true;
		try {
			if (!musicBytes) {
				const response = await fetch(musicUrl, { signal: lifetime.signal });
				if (!response.ok) throw new Error(`Music request failed (${response.status}).`);
				const bytes = await response.arrayBuffer();
				if (disposed) return;
				musicBytes = bytes;
			}
			if (!playingAllowed || !musicLevel || context.state !== 'running') return;
			const bytes = musicBytes;
			musicBytes = undefined;
			const buffer = await context.decodeAudioData(bytes);
			if (disposed) return;
			musicBuffer = buffer;
			syncMusic();
		} catch (error) {
			// Music can be unavailable on an offline first visit. Interface cues remain available from the synth.
			if (!disposed) {
				musicFailed = true;
				console.warn('PixelDoll music could not play.', error);
			}
		} finally {
			musicLoading = false;
		}
	}

	function syncMusic() {
		if (!playingAllowed || !musicLevel || disposed || context.state === 'closed') {
			stopMusic();
			return;
		}
		if (context.state !== 'running') {
			onMusicPlaying(false);
			return;
		}
		if (music) {
			onMusicPlaying(true);
			return;
		}
		if (musicFailed) return;
		if (!musicBuffer) {
			if (!musicLoading) void loadMusic();
			return;
		}
		const source = context.createBufferSource();
		const envelope = context.createGain();
		const startedAt = context.currentTime;
		source.buffer = musicBuffer;
		source.loop = true;
		source.connect(envelope);
		envelope.connect(musicGain);
		envelope.gain.setValueAtTime(0, startedAt);
		envelope.gain.linearRampToValueAtTime(1, startedAt + musicFade);
		try {
			source.start(startedAt, musicOffset);
		} catch (error) {
			source.disconnect();
			envelope.disconnect();
			throw error;
		}
		music = { source, envelope, startedAt };
		onMusicPlaying(true);
	}

	function disconnectCue(voice: ActiveCue) {
		voice.source.onended = null;
		voice.source.disconnect();
		voice.gain.disconnect();
		activeCues.delete(voice);
	}

	function stopCue(voice: ActiveCue) {
		disconnectCue(voice);
		voice.source.stop();
	}

	function stopCues() {
		for (const voice of activeCues) stopCue(voice);
	}

	return {
		update(settings, visible) {
			if (disposed || context.state === 'closed') return;
			playingAllowed = visible && !settings.muted;
			const nextMusicLevel = channelAudible(settings, 'music') ? volume(settings.music, 0.16) : 0;
			const nextEffectsLevel = channelAudible(settings, 'effects')
				? volume(settings.effects, 0.18)
				: 0;
			if (nextMusicLevel !== musicLevel) {
				if (!musicLevel) musicFailed = false;
				musicGain.gain.setTargetAtTime(nextMusicLevel, context.currentTime, 0.015);
				musicLevel = nextMusicLevel;
			}
			if (nextEffectsLevel !== effectsLevel) {
				effectsGain.gain.setTargetAtTime(nextEffectsLevel, context.currentTime, 0.015);
				effectsLevel = nextEffectsLevel;
			}
			if (!playingAllowed || !effectsLevel) stopCues();
			syncMusic();
		},
		retryMusic() {
			musicFailed = false;
			syncMusic();
		},
		play(cue) {
			if (disposed || !playingAllowed || !effectsLevel || context.state !== 'running') return;
			const frequent = isControlCue(cue);
			if (activeCues.size >= maxConcurrentCues) {
				if (frequent) return;
				const oldestControl = [...activeCues].find((voice) => isControlCue(voice.cue));
				const evicted = oldestControl ?? activeCues.values().next().value;
				if (evicted) stopCue(evicted);
			}
			let buffer = cueBuffers.get(cue);
			if (!buffer) {
				buffer = renderCue(context, cue);
				cueBuffers.set(cue, buffer);
			}
			const source = context.createBufferSource();
			const gain = context.createGain();
			const cents = frequent ? 24 : 12;
			const variation = frequent ? 0.14 : 0.06;
			// Apply one bounded pitch and gain change per play. The buffer and its note intervals are shared.
			source.detune.value = (2 * Math.random() - 1) * cents;
			gain.gain.value = (1 - Math.random() * variation) * (cue === 'hover' ? 0.7 : 1);
			const voice = { cue, source, gain };
			source.buffer = buffer;
			source.connect(gain);
			gain.connect(effectsGain);
			activeCues.add(voice);
			source.onended = () => disconnectCue(voice);
			try {
				source.start();
			} catch (error) {
				disconnectCue(voice);
				throw error;
			}
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			lifetime.abort();
			stopMusic();
			stopCues();
			musicGain.disconnect();
			effectsGain.disconnect();
			musicBuffer = undefined;
			musicBytes = undefined;
			cueBuffers.clear();
		}
	};
}
