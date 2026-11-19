<script lang="ts">
	import { get } from 'svelte/store';
	import { t } from 'svelte-whisper';
	import type { WhisperKey } from 'svelte-whisper';
	import { app } from '../lib/app.svelte.ts';
	import { apiActivity } from '../lib/pixellab/activity.ts';
	import { accountTier } from '../lib/pixellab/plans.ts';
	import { readSavedKey } from '../lib/shared-auth.ts';
	import { exportWorkspace, type WorkspaceView } from '../lib/store/workspace.ts';
	import { workspaceInfo } from '../lib/store/workspace-mode.ts';
	import { displayDate, displayMessage, errorMessage } from '../lib/i18n.ts';
	import { message, type Message } from '../lib/message.ts';
	import { doc, prepareWorkspaceExport, toast, ui } from './state.svelte.ts';
	import { experience } from './experience/state.svelte.ts';
	import { saveZip } from './download.svelte.ts';
	import { Download } from './icons.ts';
	import Sheet from './Sheet.svelte';

	const OUTCOMES = {
		failed: 'activity.state.failed',
		lost: 'activity.state.lost',
		running: 'activity.state.running',
		queued: 'activity.state.queued',
		submitting: 'activity.state.submitting'
	} satisfies Record<string, WhisperKey>;

	let { report = false }: { report?: boolean } = $props();
	let includeErrors = $state(false);
	let busy = $state(false);
	let error = $state<Message | string>('');
	const close = () => (ui.sheet = null);

	async function download() {
		if (busy) return;
		busy = true;
		error = '';
		const view: WorkspaceView = {
			project: doc.id,
			item: ui.selected,
			move: ui.anim,
			direction: ui.dir,
			frame: ui.frame,
			screen: experience.screen,
			mode: experience.mode,
			tab: ui.tab,
			theme: ui.theme
		};
		try {
			await prepareWorkspaceExport();
			const { bytes, hasOmissions } = await exportWorkspace(
				view,
				includeErrors ? { tier: accountTier(app.balance), calls: get(apiActivity) } : undefined,
				[app.key, readSavedKey()]
			);
			saveZip(bytes, `pixeldoll-${new Date().toISOString().slice(0, 10)}.workspace.zip`);
			close();
			if (hasOmissions) toast(message('workspace.exportedOmissions'), { tone: 'warning' });
			else toast(message('workspace.exported'), { tone: 'success' });
		} catch (cause) {
			error = errorMessage(cause);
		} finally {
			busy = false;
		}
	}
</script>

{#if report}
	<Sheet title={t('workspace.activityTitle')} cancel="Done" onclose={close}>
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
						</li>
					{/each}
				</ul>
			{:else}<p>{t('workspace.noErrors')}</p>{/if}
		{:else}<p>{t('workspace.noRecent')}</p>{/if}
	</Sheet>
{:else}
	<Sheet title={t('workspace.exportTitle')} onclose={close} cancelDisabled={busy}>
		<p>{t('workspace.intro')}</p>
		<p class="muted">{t('workspace.privacy')}</p>
		<label class="check"
			><input type="checkbox" bind:checked={includeErrors} disabled={busy} />{t(
				'workspace.includeErrors'
			)}</label
		>
		{#if includeErrors}<p class="muted small">
				{t('workspace.includeErrorsHint')}
			</p>{/if}
		{#if error}<p class="notice warn" role="alert">{displayMessage(error)}</p>{/if}
		{#snippet footer()}
			<button
				class="btn primary bu-action"
				data-variant="primary"
				disabled={busy}
				onclick={download}
				><Download size={16} />{busy ? t('common.preparing') : t('common.downloadZip')}</button
			>
		{/snippet}
	</Sheet>
{/if}

<style>
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.reports {
		display: grid;
		gap: 8px;
	}
</style>
