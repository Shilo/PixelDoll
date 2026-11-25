import { parseObject, preferenceStore } from './experience/preferenceStore.ts';

export interface AudioPreferences {
	muted: boolean;
	musicMuted: boolean;
	effectsMuted: boolean;
	music: number;
	effects: number;
}

export type AudioChannel = 'music' | 'effects';

export const defaultAudioPreferences: AudioPreferences = {
	muted: false,
	musicMuted: false,
	effectsMuted: false,
	music: 20,
	effects: 35
};

export const channelAudible = (settings: AudioPreferences, channel: AudioChannel) =>
	!settings.muted && !settings[`${channel}Muted`] && settings[channel] > 0;

export function audioLevel(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.min(100, Math.max(0, Math.round(value)))
		: fallback;
}

export function parseAudioPreferences(text: string | null): AudioPreferences {
	const { muted, musicMuted, effectsMuted, music, effects } = parseObject(text);
	return {
		muted: typeof muted === 'boolean' ? muted : defaultAudioPreferences.muted,
		musicMuted: musicMuted === true,
		effectsMuted: effectsMuted === true,
		music: audioLevel(music, defaultAudioPreferences.music),
		effects: audioLevel(effects, defaultAudioPreferences.effects)
	};
}

export const audioPreferenceStore = preferenceStore('pixeldoll.audio', parseAudioPreferences);
