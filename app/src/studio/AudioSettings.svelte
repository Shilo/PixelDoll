<script lang="ts">
	import { formatPercent, t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	import { audioPreferences, setAudioEnabled, setAudioLevel } from './audio.svelte.ts';
	import { Music2, Volume2, Waves } from './icons.ts';
	import SettingsItemSlider from './SettingsItemSlider.svelte';
	import SettingsItemToggle from './SettingsItemToggle.svelte';
	import { toast } from './state.svelte.ts';

	const preferences = $derived(audioPreferences());
	const channels = [
		{
			key: 'music',
			label: 'settings.audio.music',
			level: 'settings.audio.musicVolume',
			icon: Music2
		},
		{
			key: 'effects',
			label: 'settings.audio.effects',
			level: 'settings.audio.effectsVolume',
			icon: Waves
		}
	] as const;

	function reportSave(saved: boolean) {
		if (!saved) toast(message('settings.audio.notSaved'), { tone: 'warning' });
	}
</script>

<div data-audio-controls>
	<SettingsItemToggle
		setting="audio-enabled"
		checked={!preferences.muted}
		onchange={(event) => reportSave(setAudioEnabled(event.currentTarget.checked, event))}
	>
		<Volume2 size={18} aria-hidden="true" />
		<span class="row-name">{t('settings.audio.play')}</span>
	</SettingsItemToggle>
	{#each channels as { key, label, level, icon: Icon } (key)}
		<SettingsItemToggle
			setting="audio-{key}"
			checked={!preferences[`${key}Muted`]}
			onchange={(event) => reportSave(setAudioEnabled(event.currentTarget.checked, event, key))}
		>
			<Icon size={18} aria-hidden="true" />
			<span class="row-name">{t(label)}</span>
		</SettingsItemToggle>
		<SettingsItemSlider
			setting="audio-{key}-volume"
			label={t(level)}
			value={preferences[key]}
			valueText={formatPercent(preferences[key] / 100)}
			onchange={(event) => reportSave(setAudioLevel(key, event.currentTarget.valueAsNumber, event))}
		/>
	{/each}
</div>
