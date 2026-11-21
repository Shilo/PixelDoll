<script lang="ts">
	import { t } from 'svelte-whisper';
	import type { WhisperKey } from 'svelte-whisper';
	import { workspaceInfo } from '../lib/store/workspace-mode.ts';
	import { displayDate } from '../lib/i18n.ts';
	import { ui } from './state.svelte.ts';
	import Sheet from './Sheet.svelte';

	const OUTCOMES = {
		failed: 'activity.state.failed',
		lost: 'activity.state.lost',
		running: 'activity.state.running',
		queued: 'activity.state.queued',
		submitting: 'activity.state.submitting'
	} satisfies Record<string, WhisperKey>;

	const close = () => (ui.sheet = null);
</script>

<Sheet title={t('workspace.activityTitle')} cancel="common.done" onclose={close}>
	<p class="muted">{t('workspace.activityIntro', { build: workspaceInfo?.build ?? '' })}</p>
	{#if workspaceInfo?.missing.length}
		<p class="notice warn">
			{t('workspace.missing', { count: workspaceInfo.missing.length })}
		</p>
	{/if}
	{#if workspaceInfo?.omitted}
		<ul class="notice warn">
			{#if workspaceInfo.omitted.characters}
				<li>{t('workspace.skippedCharacters', { count: workspaceInfo.omitted.characters })}</li>
			{/if}
			{#if workspaceInfo.omitted.demoOutfit}<li>
					{t('workspace.demoOutfit')}
				</li>{/if}
			{#if workspaceInfo.omitted.exportSettings}<li>
					{t('workspace.exportSettings')}
				</li>{/if}
		</ul>
	{/if}
	{#if workspaceInfo?.diagnostics}
		<p>
			{t('workspace.tier', {
				tier: workspaceInfo.diagnostics.tier ?? t('common.notRecorded')
			})}
		</p>
		{#if workspaceInfo.diagnostics.errors.length}
			<ul class="reports">
				{#each workspaceInfo.diagnostics.errors as entry, index (index)}
					<li>
						{t('workspace.errorLine', {
							date: displayDate(entry.at, {
								year: 'numeric',
								month: '2-digit',
								day: '2-digit',
								hour: 'numeric',
								minute: '2-digit',
								second: '2-digit'
							}),
							tool: entry.tool,
							outcome: t(OUTCOMES[entry.outcome]),
							http: entry.http ? t('workspace.errorLineHttp', { status: entry.http }) : '',
							code:
								entry.code === undefined ? '' : t('workspace.errorLineCode', { code: entry.code })
						})}
						{entry.message ? ` · ${entry.message}` : ''}
					</li>
				{/each}
			</ul>
		{:else}<p>{t('workspace.noErrors')}</p>{/if}
	{:else}<p>{t('workspace.noRecent')}</p>{/if}
</Sheet>

<style>
	.reports {
		display: grid;
		gap: 8px;
		overflow-wrap: anywhere; /* an error's own words can be one long unbroken run */
	}
</style>
