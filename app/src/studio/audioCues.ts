export type AudioCue =
	'press' | 'equip' | 'unequip' | 'recolor' | 'item' | 'success' | 'failure' | 'export';

type Note = readonly [start: number, pitch: number, duration: number, strength: number];
const sampleRate = 24000;

// These original cues are dedicated under CC0 1.0 Universal.
const cues: Record<AudioCue, readonly Note[]> = {
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

function mixNote(samples: Float32Array, [start, pitch, duration, strength]: Note) {
	const startSample = Math.round(start * sampleRate);
	const length = Math.min(samples.length - startSample, Math.round(duration * sampleRate));
	const step = (2 * Math.PI * 440 * 2 ** ((pitch - 69) / 12)) / sampleRate;
	const { attack, release, decay, second, third } = {
		attack: 0.018,
		release: 0.31,
		decay: 2.1,
		second: 0.09,
		third: 0.16
	};
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

export function renderCue(context: AudioContext, cue: AudioCue): AudioBuffer {
	const notes = cues[cue];
	const duration = Math.max(...notes.map(([start, , length]) => start + length));
	const buffer = context.createBuffer(1, Math.ceil(duration * sampleRate), sampleRate);
	const samples = buffer.getChannelData(0);
	for (const note of notes) mixNote(samples, note);
	return buffer;
}
