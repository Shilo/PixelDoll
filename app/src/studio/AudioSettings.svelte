<script lang="ts">
	import { formatPercent, t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	import { audioPreferences, setAudioLevel, setAudioMuted } from './audio.svelte.ts';
	import SettingsItemToggle from './SettingsItemToggle.svelte';
	import { toast } from './state.svelte.ts';

	const preferences = $derived(audioPreferences());
	const channels = ['music', 'effects'] as const;
	const labels = { music: 'settings.audio.music', effects: 'settings.audio.effects' } as const;

	function reportSave(saved: boolean) {
		if (!saved) toast(message('settings.audio.notSaved'), { tone: 'warning' });
	}
</script>

<div data-audio-controls>
	<SettingsItemToggle
		setting="audio-mute"
		checked={preferences.muted}
		onchange={(event) => reportSave(setAudioMuted(event.currentTarget.checked, event))}
	>
		<span>{t('settings.audio.mute')}</span>
	</SettingsItemToggle>
	{#each channels as channel (channel)}
		{@const percentage = formatPercent(preferences[channel] / 100)}
		<label class="volume" data-setting="audio-{channel}">
			<span>{t(labels[channel])}</span>
			<span aria-hidden="true">{percentage}</span>
			<input
				type="range"
				min="0"
				max="100"
				step="1"
				value={preferences[channel]}
				aria-valuetext={percentage}
				onchange={(event) =>
					reportSave(setAudioLevel(channel, event.currentTarget.valueAsNumber, event))}
			/>
		</label>
	{/each}
</div>

<style>
	.volume {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		column-gap: 12px;
		padding-block-start: 8px;
	}
	input {
		grid-column: 1 / -1;
		inline-size: 100%;
		min-block-size: 44px;
		margin: 0;
	}
</style>
