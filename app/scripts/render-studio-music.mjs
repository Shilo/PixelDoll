// SPDX-License-Identifier: MIT
// The original composition and rendered recording are dedicated to the public
// domain under CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
// From app/: node scripts/render-studio-music.mjs (requires FFmpeg on PATH).

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sampleRate = 24_000;
const secondsPerBeat = 60 / 72;
const beatsPerBar = 4;
const barsPerSection = 8;
const fullTurn = 2 * Math.PI;

// Each section is eight bars. Pads specify start bar, length in bars, and
// voicing (low to high). Accents specify beat, pitch, and strength.
const score = [
	{
		pads: [
			[0, 1.85, 'D3 A3 E4 F#4'],
			[2, 1.45, 'B2 F#3 A3 D4'],
			[3.65, 2.2, 'G3 B3 D4 A4'],
			[6.1, 1.55, 'A2 E3 B3 D4']
		],
		accents: [
			[4.75, 'E4', 0.7],
			[7.6, 'A4', 0.57],
			[16.9, 'B4', 0.65],
			[19.4, 'A4', 0.53],
			[24.85, 'E4', 0.44]
		]
	},
	{
		pads: [
			[0, 1.65, 'D3 F#3 A3 C#4'],
			[1.8, 1.8, 'F#3 A3 B3 E4'],
			[3.85, 1.35, 'E3 B3 D4 G4'],
			[5.45, 2.4, 'G3 D4 E4 B4']
		],
		accents: [
			[2.8, 'F#4', 0.53],
			[11.5, 'E5', 0.61],
			[13.15, 'B4', 0.55],
			[22.25, 'G4', 0.7],
			[26.8, 'D5', 0.46]
		]
	},
	{
		pads: [
			[0.35, 2.15, 'E3 G3 B3 F#4'],
			[2.65, 1.2, 'B2 F#3 A3 D4'],
			[4.2, 1.4, 'G3 B3 D4 F#4'],
			[6, 1.55, 'A2 E3 A3 C#4']
		],
		accents: [
			[5.45, 'B4', 0.61],
			[10.7, 'F#4', 0.53],
			[19.8, 'D4', 0.6],
			[21.6, 'F#4', 0.47]
		]
	},
	{
		pads: [
			[0, 2.15, 'G3 A3 D4 B4'],
			[2.15, 1.45, 'D3 A3 C#4 F#4'],
			[3.8, 1.7, 'E3 G3 D4 A4'],
			[5.65, 2.15, 'B2 F#3 C#4 E4']
		],
		accents: [
			[1.65, 'D5', 0.51],
			[6.4, 'B4', 0.65],
			[10.75, 'A4', 0.51],
			[17.2, 'G4', 0.56],
			[26.35, 'C#5', 0.51],
			[28.15, 'E5', 0.39]
		]
	},
	{
		pads: [
			[0, 1.55, 'B2 D3 A3 F#4'],
			[1.8, 1.6, 'A2 E3 B3 D4'],
			[3.7, 2.05, 'G3 A3 B3 D4'],
			[6.05, 1.5, 'D3 F#3 A3 E4']
		],
		accents: [
			[3.85, 'F#4', 0.64],
			[8.45, 'E4', 0.53],
			[11.35, 'D4', 0.43],
			[19.45, 'B4', 0.52],
			[25.8, 'A4', 0.4]
		]
	},
	{
		pads: [
			[0.1, 1.7, 'E3 B3 D4 G4'],
			[2, 1.4, 'G3 B3 E4 A4'],
			[3.7, 1.15, 'A2 E3 B3 D4'],
			// Hold the shared voicing through the loop while the opening pads enter.
			[5.05, 3.25, 'D3 A3 E4 F#4']
		],
		accents: [
			[4.4, 'G4', 0.55],
			[10.55, 'E4', 0.5],
			[18.45, 'A4', 0.41],
			[22.6, 'F#4', 0.32]
		]
	}
];

const chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const mix = new Float32Array(
	Math.round(score.length * barsPerSection * beatsPerBar * secondsPerBeat * sampleRate)
);

function frequency(note) {
	const semitone = (Number(note.at(-1)) + 1) * 12 + chromatic.indexOf(note.slice(0, -1));
	return 440 * 2 ** ((semitone - 69) / 12);
}

function smoothRamp(fraction) {
	const t = Math.min(1, Math.max(0, fraction));
	return t * t * (3 - 2 * t);
}

function addPad(start, duration, note, voice, phrase) {
	const first = Math.round(start * sampleRate);
	const last = first + Math.round(duration * sampleRate);
	const angularFrequency = fullTurn * frequency(note);
	const attack = 0.95 + ((voice * 3 + phrase) % 6) * 0.19;
	const release = 1.55 + voice * 0.24;
	const level = [0.17, 0.132, 0.106, 0.085][voice];
	const driftSpeed = fullTurn * (0.14 + voice * 0.037);

	for (let frame = first; frame < last; frame++) {
		const age = (frame - first) / sampleRate;
		const drift = Math.sin(driftSpeed * age + phrase + voice * 0.9);
		const phase = angularFrequency * age + 0.34 * drift;
		const tone =
			0.7 * Math.sin(phase) +
			0.14 * Math.sin(phase * 1.0018 + 1.2) +
			(0.1 + 0.032 * drift) * Math.sin(2 * phase + 0.45) +
			0.037 * Math.sin(3 * phase);
		const envelope = smoothRamp(age / attack) * smoothRamp((duration - age) / release);
		mix[frame % mix.length] += level * envelope * tone * (0.92 + 0.08 * drift);
	}
}

function addAccent(start, note, strength, phrase) {
	const angularFrequency = fullTurn * frequency(note);
	// A few quiet, slightly uneven reflections soften the rounded lead tone.
	const reflections = [
		[0, 1],
		[0.17, 0.19],
		[0.31, 0.12],
		[0.51, 0.07]
	];
	const duration = 2.8;

	for (const [delay, gain] of reflections) {
		const first = Math.round((start + delay) * sampleRate);
		const last = first + Math.round(duration * sampleRate);
		for (let frame = first; frame < last; frame++) {
			const age = (frame - first) / sampleRate;
			const phase = angularFrequency * age + 0.18 * Math.sin(age * 4.1 + phrase);
			const tone = Math.sin(phase) + 0.21 * Math.exp(-age * 1.6) * Math.sin(phase * 2);
			const envelope =
				smoothRamp(age / 0.18) * Math.exp(-age * 1.52) * smoothRamp((duration - age) / 0.65);
			mix[frame % mix.length] += 0.17 * strength * gain * envelope * tone;
		}
	}
}

for (const [phrase, { pads, accents }] of score.entries()) {
	const firstBeat = phrase * barsPerSection * beatsPerBar;
	for (const [bar, length, voicing] of pads) {
		for (const [voice, note] of voicing.split(' ').entries()) {
			const stagger = voice * 0.13 + ((phrase + voice) % 3) * 0.09;
			const start = (firstBeat + bar * beatsPerBar) * secondsPerBeat + stagger;
			const duration = length * beatsPerBar * secondsPerBeat + 1.05 - stagger;
			addPad(start, duration, note, voice, phrase);
		}
	}
	for (const [beat, note, strength] of accents) {
		addAccent((firstBeat + beat) * secondsPerBeat, note, strength, phrase);
	}
}

const pcm = Buffer.alloc(mix.length * Float32Array.BYTES_PER_ELEMENT);
for (let frame = 0; frame < mix.length; frame++) {
	pcm.writeFloatLE(mix[frame], frame * Float32Array.BYTES_PER_ELEMENT);
}

const outputDirectory = new URL('../src/studio/audio/', import.meta.url);
mkdirSync(outputDirectory, { recursive: true });
const outputPath = fileURLToPath(new URL('studio-ambient.flac', outputDirectory));
const result = spawnSync(
	'ffmpeg',
	[
		'-hide_banner',
		'-loglevel',
		'error',
		'-y',
		'-f',
		'f32le',
		'-ar',
		String(sampleRate),
		'-ac',
		'1',
		'-i',
		'pipe:0',
		'-c:a',
		'flac',
		'-sample_fmt',
		's16',
		'-metadata',
		'title=PixelDoll Studio Ambient',
		'-metadata',
		'copyright=CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/)',
		outputPath
	],
	{ input: pcm, stdio: ['pipe', 'inherit', 'inherit'] }
);

if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`FFmpeg failed (${result.signal ?? result.status})`);
