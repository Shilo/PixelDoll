export type AudioCue =
	'hover' | 'press' | 'equip' | 'unequip' | 'recolor' | 'item' | 'success' | 'failure' | 'export';

type World = 'dark' | 'light';
type AudioSettings = { muted: boolean; music: number; effects: number };

export interface AudioPlayback {
	update(settings: AudioSettings, world: World, visible: boolean): void;
	play(cue: AudioCue): void;
	dispose(): void;
}

type Voice = 'pad' | 'pluck' | 'bell';
type Note = readonly [start: number, pitch: number, duration: number, strength: number];
type Score = {
	secondsPerBeat: number;
	melodyVoice: Voice;
	bars: readonly { chord: readonly number[]; melody: readonly Note[] }[];
};

const sampleRate = 24000;
const fadeSeconds = 0.035;
const beatsPerBar = 4;
const maxConcurrentCues = 4;

const scores: Record<World, Score> = {
	dark: {
		secondsPerBeat: 0.78,
		melodyVoice: 'bell',
		bars: [
			{
				chord: [38, 53, 57, 60],
				melody: [
					[0.5, 62, 1.65, 0.33],
					[2.5, 69, 1.3, 0.21]
				]
			},
			{
				chord: [34, 50, 53, 57],
				melody: [
					[0.75, 65, 1.7, 0.28],
					[2.75, 60, 1.15, 0.18]
				]
			},
			{
				chord: [43, 53, 58, 62],
				melody: [
					[0.25, 62, 1.6, 0.27],
					[2, 67, 1.7, 0.24]
				]
			},
			{
				chord: [45, 52, 55, 61],
				melody: [
					[1, 64, 1.35, 0.23],
					[2.5, 61, 1.4, 0.17]
				]
			}
		]
	},
	light: {
		secondsPerBeat: 0.65,
		melodyVoice: 'pluck',
		bars: [
			{
				chord: [43, 55, 59, 62],
				melody: [
					[0.25, 67, 1.1, 0.32],
					[1.5, 71, 0.85, 0.25],
					[2.25, 74, 1.4, 0.27]
				]
			},
			{
				chord: [40, 55, 59, 62],
				melody: [
					[0.5, 71, 1, 0.25],
					[1.75, 69, 0.8, 0.22],
					[2.5, 67, 1.15, 0.25]
				]
			},
			{
				chord: [36, 52, 55, 59],
				melody: [
					[0.25, 64, 0.95, 0.28],
					[1.5, 67, 0.95, 0.24],
					[2.5, 71, 1.3, 0.27]
				]
			},
			{
				chord: [38, 50, 55, 57],
				melody: [
					[0.5, 69, 1.2, 0.26],
					[2, 66, 1.15, 0.22],
					[3, 62, 0.9, 0.2]
				]
			}
		]
	}
};

const cues: Record<AudioCue, readonly Note[]> = {
	hover: [[0, 79, 0.045, 0.22]],
	press: [[0, 65, 0.074, 0.44]],
	equip: [
		[0, 64, 0.105, 0.54],
		[0.064, 71, 0.16, 0.5]
	],
	unequip: [
		[0, 71, 0.095, 0.42],
		[0.057, 64, 0.15, 0.43]
	],
	recolor: [
		[0, 72, 0.095, 0.34],
		[0.042, 76, 0.1, 0.32],
		[0.09, 79, 0.135, 0.34]
	],
	item: [
		[0, 60, 0.15, 0.43],
		[0.084, 64, 0.16, 0.4],
		[0.168, 67, 0.22, 0.37]
	],
	success: [
		[0, 67, 0.15, 0.44],
		[0.072, 71, 0.15, 0.42],
		[0.144, 74, 0.18, 0.4],
		[0.225, 79, 0.23, 0.36]
	],
	failure: [
		[0, 63, 0.155, 0.5],
		[0.107, 60, 0.24, 0.46]
	],
	export: [
		[0, 67, 0.2, 0.42],
		[0, 74, 0.18, 0.29],
		[0.115, 79, 0.24, 0.35]
	]
};

const voices = {
	pad: { attack: 0.23, release: 0.42, decay: 0, second: 0.15, third: 0.06 },
	pluck: { attack: 0.012, release: 0.15, decay: 3.6, second: 0.27, third: 0.11 },
	bell: { attack: 0.018, release: 0.31, decay: 2.1, second: 0.09, third: 0.16 }
};

function mixNote(samples: Float32Array, [start, pitch, duration, strength]: Note, voice: Voice) {
	const startSample = Math.round(start * sampleRate);
	const length = Math.min(samples.length - startSample, Math.round(duration * sampleRate));
	const step = (2 * Math.PI * 440 * 2 ** ((pitch - 69) / 12)) / sampleRate;
	const { attack, release, decay, second, third } = voices[voice];
	const attackSamples = Math.min(attack * sampleRate, length * 0.25);
	const releaseSamples = Math.min(release * sampleRate, length * 0.55);
	const decayPerSample = Math.exp(-decay / sampleRate);
	let amplitude = strength;

	for (let index = 0; index < length; index++) {
		const edge = Math.min(1, index / attackSamples, (length - 1 - index) / releaseSamples);
		const envelope = edge * edge * (3 - 2 * edge);
		const phase = index * step;
		const harmonic = Math.sin(phase);
		const waveform =
			harmonic * (1 + third * (3 - 4 * harmonic * harmonic)) + second * Math.sin(2 * phase);
		samples[startSample + index] += amplitude * envelope * waveform;
		amplitude *= decayPerSample;
	}
}

function renderMusic(context: AudioContext, world: World): AudioBuffer {
	const { secondsPerBeat, melodyVoice, bars } = scores[world];
	const frames = Math.round(bars.length * beatsPerBar * secondsPerBeat * sampleRate);
	const buffer = context.createBuffer(1, frames, sampleRate);
	const samples = buffer.getChannelData(0);

	for (const [index, bar] of bars.entries()) {
		const barStart = index * beatsPerBar * secondsPerBeat;
		for (const pitch of bar.chord) {
			mixNote(samples, [barStart, pitch, 3.98 * secondsPerBeat, 0.12], 'pad');
		}
		for (const [start, pitch, duration, strength] of bar.melody) {
			mixNote(
				samples,
				[barStart + start * secondsPerBeat, pitch, duration * secondsPerBeat, strength],
				melodyVoice
			);
		}
	}
	return buffer;
}

function renderCue(context: AudioContext, cue: AudioCue): AudioBuffer {
	const notes = cues[cue];
	const duration = Math.max(...notes.map(([start, , length]) => start + length));
	const buffer = context.createBuffer(1, Math.ceil(duration * sampleRate), sampleRate);
	const samples = buffer.getChannelData(0);
	for (const note of notes) mixNote(samples, note, 'bell');
	return buffer;
}

type MusicPlayback = {
	source: AudioBufferSourceNode;
	envelope: GainNode;
	world: World;
	startedAt: number;
	offset: number;
	duration: number;
	fading: boolean;
};

function volume(level: number, ceiling: number): number {
	return ceiling * (Math.max(0, Math.min(100, level)) / 100) ** 1.35;
}

export function createAudioPlayback(context: AudioContext): AudioPlayback {
	const musicGain = context.createGain();
	const effectsGain = context.createGain();
	for (const gain of [musicGain, effectsGain]) {
		gain.gain.value = 0;
		gain.connect(context.destination);
	}

	const musicBuffers = new Map<World, AudioBuffer>();
	const cueBuffers = new Map<AudioCue, AudioBuffer>();
	const activeCues = new Set<AudioBufferSourceNode>();
	let music: MusicPlayback | undefined;
	let musicOffset = 0;
	let world: World = 'dark';
	let musicLevel = 0;
	let effectsLevel = 0;
	let playingAllowed = false;
	let disposed = false;

	function disconnectMusic(track: MusicPlayback) {
		track.source.onended = null;
		track.source.disconnect();
		track.envelope.disconnect();
		music = undefined;
	}

	function stopMusic() {
		if (!music) return;
		const track = music;
		if (track.world === world && !track.fading) {
			musicOffset = (track.offset + context.currentTime - track.startedAt) % track.duration;
		}
		disconnectMusic(track);
		track.source.stop();
	}

	function syncMusic() {
		if (!playingAllowed || musicLevel === 0 || disposed || context.state === 'closed') {
			stopMusic();
			return;
		}
		if (context.state !== 'running') return;
		const now = context.currentTime;
		if (music) {
			if (music.world === world || music.fading) return;
			const gain = music.envelope.gain;
			gain.cancelScheduledValues(now);
			gain.setValueAtTime(Math.min(1, (now - music.startedAt) / fadeSeconds), now);
			gain.linearRampToValueAtTime(0, now + fadeSeconds);
			music.fading = true;
			// Start the next loop on ended so rapid theme changes cannot stack tracks.
			music.source.stop(now + fadeSeconds);
			return;
		}

		let buffer = musicBuffers.get(world);
		if (!buffer) {
			buffer = renderMusic(context, world);
			musicBuffers.set(world, buffer);
		}
		// Rendering a new score can take longer than an audio render quantum.
		const startedAt = context.currentTime;
		const source = context.createBufferSource();
		const envelope = context.createGain();
		source.buffer = buffer;
		source.loop = true;
		source.connect(envelope);
		envelope.connect(musicGain);
		envelope.gain.setValueAtTime(0, startedAt);
		envelope.gain.linearRampToValueAtTime(1, startedAt + fadeSeconds);
		const track: MusicPlayback = {
			source,
			envelope,
			world,
			startedAt,
			offset: musicOffset,
			duration: buffer.duration,
			fading: false
		};
		music = track;
		source.onended = () => {
			if (music !== track) return;
			disconnectMusic(track);
			syncMusic();
		};
		source.start(startedAt, musicOffset);
	}

	function disconnectCue(source: AudioBufferSourceNode) {
		source.onended = null;
		source.disconnect();
		activeCues.delete(source);
	}

	function stopCues() {
		for (const source of activeCues) {
			disconnectCue(source);
			source.stop();
		}
	}

	return {
		update(settings, nextWorld, visible) {
			if (disposed || context.state === 'closed') return;
			if (world !== nextWorld) {
				world = nextWorld;
				musicOffset = 0;
			}
			playingAllowed = visible && !settings.muted;
			const nextMusicLevel = volume(settings.music, 0.19);
			const nextEffectsLevel = volume(settings.effects, 0.18);
			if (nextMusicLevel !== musicLevel) {
				musicGain.gain.setTargetAtTime(nextMusicLevel, context.currentTime, 0.015);
				musicLevel = nextMusicLevel;
			}
			if (nextEffectsLevel !== effectsLevel) {
				effectsGain.gain.setTargetAtTime(nextEffectsLevel, context.currentTime, 0.015);
				effectsLevel = nextEffectsLevel;
			}
			if (!playingAllowed || effectsLevel === 0) stopCues();
			syncMusic();
		},
		play(cue) {
			if (disposed || !playingAllowed || effectsLevel === 0 || context.state !== 'running') return;
			if (activeCues.size >= maxConcurrentCues) {
				if (cue === 'hover') return;
				const oldest = activeCues.values().next().value;
				if (oldest) {
					disconnectCue(oldest);
					oldest.stop();
				}
			}
			let buffer = cueBuffers.get(cue);
			if (!buffer) {
				buffer = renderCue(context, cue);
				cueBuffers.set(cue, buffer);
			}
			const source = context.createBufferSource();
			source.buffer = buffer;
			source.connect(effectsGain);
			activeCues.add(source);
			source.onended = () => disconnectCue(source);
			source.start();
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			stopMusic();
			stopCues();
			musicGain.disconnect();
			effectsGain.disconnect();
			musicBuffers.clear();
			cueBuffers.clear();
		}
	};
}
