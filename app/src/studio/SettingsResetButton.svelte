<script lang="ts">
	import { t } from 'svelte-whisper';
	import { RotateCcw } from './icons.ts';
	import type { ResetScope } from './resetSettings.ts';
	import { settingsAtDefaults } from './settingsDefaults.svelte.ts';
	import { app } from '../lib/app.svelte.ts';
	import { openerLabel } from './openerLabel.ts';
	let {
		scope,
		disabled,
		labeled = false,
		onclick
	}: {
		scope: ResetScope | 'pixellab';
		disabled: boolean;
		labeled?: boolean;
		onclick: () => void;
	} = $props();
	const label = $derived(
		scope === 'pixellab'
			? t('connectSheet.forgetKey')
			: t(
					scope === 'all'
						? labeled
							? 'settings.reset.allAction'
							: 'settings.reset.action'
						: 'settings.reset.pageAction'
				)
	);
</script>

<button
	type="button"
	class={labeled ? 'bu-action reset-row' : 'bu-action btn icon plain'}
	data-variant="quiet"
	disabled={disabled || (scope === 'pixellab' ? !app.key : settingsAtDefaults(scope))}
	{onclick}
	aria-label={labeled ? undefined : label}
	title={labeled ? undefined : label}
>
	<RotateCcw size={18} aria-hidden="true" />
	{#if labeled}<span>{openerLabel(label)}</span>{/if}
</button>

<style>
	.reset-row {
		width: 100%;
		min-height: 44px;
		justify-content: flex-start;
		text-align: start;
		white-space: normal;
	}
	.reset-row :global(svg) {
		flex: none;
	}
</style>
