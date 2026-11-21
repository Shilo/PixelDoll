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
	<figcaption class="settings-label">{t('import.preview')}</figcaption>
	<!-- A sheet header in miniature: the same ApiPeek button, on a free example plan, where users meet it. -->
	<div class="example-sheet">
		<div class="example-head">
			<strong>{t('activity.title')}</strong>
			<ApiPeek
				preview
				targets={[
					{
						scope: 'example',
						label: t('activity.refreshBalance'),
						plan: balancePlan(),
						copyId: 'job-example-0001'
					}
				]}
			/>
		</div>
		<p class="bu-muted bu-small">{t('developer.previewHint')}</p>
	</div>
</figure>

<style>
	.developer-preview {
		display: grid;
		gap: 8px;
		margin: 8px 0 0;
	}
	.example-sheet {
		border: 1px solid var(--bu-rim);
		border-radius: var(--bu-radius-panel);
		overflow: hidden;
	}
	.example-head {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		min-block-size: 52px;
		padding-inline: 12px;
		border-block-end: 1px solid var(--bu-line);
	}
	.example-sheet p {
		margin: 0;
		padding: 12px;
	}
</style>
