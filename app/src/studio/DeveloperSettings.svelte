<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	import { workspaceCopy } from '../lib/store/workspace-mode.ts';
	import ApiPeek from './ApiPeek.svelte';
	import {
		developerModeEnabled,
		localDeveloperToolsEnabled,
		setDeveloperMode
	} from './developerMode.svelte.ts';
	import { toast } from './state.svelte.ts';
	import { Wrench } from './icons.ts';
	import { balancePlan } from './apiPlans.ts';
	const localTools = import.meta.env.DEV ? () => import('./LocalDeveloperTools.svelte') : undefined;
	const description = $props.id();
	const exampleJob = 'job-example-0001';

	let {
		tools
	}: {
		/** Additional Developer rows, such as the backup-copy opener, rendered only while enabled. */
		tools?: Snippet;
	} = $props();

	function changeMode(event: Event & { currentTarget: HTMLInputElement }) {
		if (!setDeveloperMode(event.currentTarget.checked))
			toast(message('developer.notSaved'), { tone: 'warning' });
	}
</script>

<label class="row bu-check" data-setting="developer-mode">
	<Wrench size={18} aria-hidden="true" />
	<span class="row-name">{t('developer.mode')}</span>
	<input
		class="bu-switch"
		type="checkbox"
		role="switch"
		aria-describedby={description}
		checked={developerModeEnabled()}
		onchange={changeMode}
	/>
</label>
<p class="bu-muted settings-description" id={description}>{t('developer.description')}</p>
{#if developerModeEnabled()}
	{#if !workspaceCopy}<ApiPeek all menu />{/if}
	{@render tools?.()}
	{#if localTools && localDeveloperToolsEnabled()}
		{#await localTools() then { default: LocalDeveloperTools }}
			<LocalDeveloperTools />
		{/await}
	{/if}
{/if}
<figure class="developer-preview">
	<figcaption class="settings-label">{t('developer.practice')}</figcaption>
	<ol class="bu-steps practice-steps">
		<li><span class="step-number" aria-hidden="true">1</span>{t('developer.stepFind')}</li>
		<li><span class="step-number" aria-hidden="true">2</span>{t('developer.stepChoose')}</li>
		<li>
			<span class="step-number" aria-hidden="true">3</span>{t('developer.stepCopy', {
				copyId: t('developer.copyId')
			})}
		</li>
	</ol>
	<div class="example-sheet">
		<strong>{t('activity.title')}</strong>
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
					label: `${t('activity.ledger.job')} · ${exampleJob}`,
					plan: [
						{
							method: 'GET',
							path: `/background-jobs/${exampleJob}`,
							label: t('apiPeek.plan.checkProgress')
						}
					],
					copyId: exampleJob
				}
			]}
		/>
	</div>
	<p class="bu-muted bu-small practice-note">{t('developer.practiceNote')}</p>
</figure>

<style>
	.developer-preview {
		display: grid;
		gap: 12px;
		min-inline-size: 0;
		margin: 8px 0 0;
	}
	.practice-steps {
		gap: 8px;
	}
	.practice-steps li {
		gap: 10px;
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
	.step-number,
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
	/* A sheet header in miniature: the title with its inspector beside it, the inspector docked below. */
	.example-sheet {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 4px 8px;
		min-inline-size: 0;
		padding: 10px 12px 12px;
		border: 1px solid var(--bu-rim);
		border-radius: var(--bu-radius-panel);
	}
	.example-sheet > :global(.api-peek) {
		flex: 1 0 100%;
		min-inline-size: 0;
		margin-block-start: 10px;
	}
	.practice-note {
		margin: 0;
	}
</style>
