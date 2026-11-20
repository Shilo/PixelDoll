<script lang="ts">
	import { t, type WhisperKey } from 'svelte-whisper';
	import { PRESETS, type DirectionPreset } from './characterConfig.ts';
	const labels: Record<string, WhisperKey> = {
		eight: 'create.form.presets.eight',
		four: 'create.form.presets.four',
		diagonal: 'create.form.presets.diagonal',
		side: 'create.form.presets.side',
		unique: 'create.form.presets.unique'
	};

	let {
		active,
		disabled = false,
		available = () => true,
		onselect
	}: {
		active?: string;
		disabled?: boolean;
		available?: (preset: DirectionPreset) => boolean;
		onselect: (preset: DirectionPreset) => void;
	} = $props();
</script>

<div class="direction-presets" role="group" aria-label={t('create.form.directionPresets')}>
	{#each PRESETS as preset (preset.id)}
		<button
			type="button"
			class="bu-action btn"
			data-variant="outline"
			aria-pressed={active === preset.id}
			disabled={disabled || !available(preset)}
			onclick={() => onselect(preset)}>{t(labels[preset.id])}</button
		>
	{/each}
</div>

<style>
	.direction-presets {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 5px;
	}
	.btn {
		grid-column: span 2;
		padding-inline: 3px;
		font-size: var(--fs-sm);
		white-space: normal;
	}
	.btn:nth-child(-n + 2) {
		grid-column: span 3;
	}
	@media (pointer: coarse), (max-width: 599px), (max-height: 499px) {
		.btn {
			min-height: 44px;
		}
	}
</style>
