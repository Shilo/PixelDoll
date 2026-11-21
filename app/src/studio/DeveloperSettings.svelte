<script lang="ts">
	import SettingsItemToggle from './SettingsItemToggle.svelte';
	import SettingsBackupCopy from './SettingsBackupCopy.svelte';
	import { t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	import { workspaceCopy } from '../lib/store/workspace-mode.ts';
	import ApiPeek from './ApiPeek.svelte';
	import { developerModeEnabled, setDeveloperMode } from './developerMode.svelte.ts';
	import { toast } from './state.svelte.ts';
	import { Wrench } from './icons.ts';
	import { balancePlan, characterActivityExample } from './apiPlans.ts';
	const description = $props.id();
	const exampleJob = 'job-example-0001';

	function changeMode(event: Event & { currentTarget: HTMLInputElement }) {
		if (!setDeveloperMode(event.currentTarget.checked))
			toast(message('developer.notSaved'), { tone: 'warning' });
	}
</script>

<SettingsItemToggle
	setting="developer-mode"
	aria-describedby={description}
	checked={developerModeEnabled()}
	onchange={changeMode}
>
	<Wrench size={18} aria-hidden="true" />
	<span class="row-name">{t('developer.mode')}</span>
</SettingsItemToggle>
<p class="bu-muted settings-description" id={description}>{t('developer.description')}</p>
{#if developerModeEnabled()}
	{#if !workspaceCopy}<ApiPeek all menu />{/if}
	<SettingsBackupCopy />
{/if}
<hr class="bu-separator" />
<figure class="developer-preview">
	<figcaption class="settings-label">{t('developer.preview')}</figcaption>
	<div class="sheet-head has-developer example-sheet">
		<span></span>
		<strong class="sheet-title">{t('developer.exampleActivity')}</strong>
		<ApiPeek
			preview
			targets={[
				{
					scope: 'example-balance',
					label: t('activity.refreshBalance'),
					plan: balancePlan()
				},
				{
					scope: 'example-job',
					label: `${t('apiPeek.plan.createBase')} · ${exampleJob}`,
					plan: characterActivityExample(exampleJob, t('developer.examplePrompt')),
					copyId: exampleJob
				}
			]}
		/>
	</div>
</figure>

<style>
	.developer-preview {
		display: grid;
		gap: 12px;
		min-inline-size: 0;
		margin: 8px 0 0;
	}
	/* The sample tags its real controls with data-step; the markers sit on their corners without moving them. */
	.developer-preview :global([data-step]) {
		position: relative;
		overflow: visible;
	}
	.developer-preview :global([data-step]::after) {
		content: attr(data-step);
		content: attr(data-step) / '';
		position: absolute;
		inset-block-start: -7px;
		inset-inline-end: -7px;
		z-index: 1;
		pointer-events: none;
	}
	.developer-preview :global([data-step]::after) {
		display: grid;
		place-items: center;
		flex: none;
		inline-size: 16px;
		block-size: 16px;
		border-radius: 50%;
		background: var(--bu-accent);
		color: var(--bu-on-accent);
		font: 600 10px/1 var(--font-ui, system-ui);
		font-variant-numeric: tabular-nums;
	}
	.developer-preview :global([data-step='2']::after) {
		inset: 50% auto auto 50%;
		translate: -50% -50%;
	}
	.example-sheet {
		min-inline-size: 0;
		padding: 10px 12px 12px;
		border: 1px solid var(--bu-rim);
		border-radius: var(--bu-radius-panel);
	}
	.example-sheet > :global(.api-peek-trigger) {
		justify-self: end;
	}
	.example-sheet > :global(.api-peek) {
		grid-column: 1 / -1;
		min-inline-size: 0;
		margin-block-start: 10px;
	}
</style>
