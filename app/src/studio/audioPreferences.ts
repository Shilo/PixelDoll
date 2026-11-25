import { parseObject, preferenceStore } from './experience/preferenceStore.ts';

export interface AudioPreferences {
	muted: boolean;
	music: number;
	effects: number;
}

export const defaultAudioPreferences: AudioPreferences = { muted: true, music: 20, effects: 35 };

export function audioLevel(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.min(100, Math.max(0, Math.round(value)))
		: fallback;
}

export function parseAudioPreferences(text: string | null): AudioPreferences {
	const { muted, music, effects } = parseObject(text);
	return {
		muted: typeof muted === 'boolean' ? muted : defaultAudioPreferences.muted,
		music: audioLevel(music, defaultAudioPreferences.music),
		effects: audioLevel(effects, defaultAudioPreferences.effects)
	};
}

export const audioPreferenceStore = preferenceStore('pixeldoll.audio', parseAudioPreferences);
