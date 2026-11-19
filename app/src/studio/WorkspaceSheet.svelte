<script lang="ts">
	import { get } from 'svelte/store';
	import { app } from '../lib/app.svelte.ts';
	import { apiActivity } from '../lib/pixellab/activity.ts';
	import { accountTier } from '../lib/pixellab/plans.ts';
	import { readSavedKey } from '../lib/shared-auth.ts';
	import { exportWorkspace, type WorkspaceView } from '../lib/store/workspace.ts';
	import { workspaceInfo } from '../lib/store/workspace-mode.ts';
	import { doc, prepareWorkspaceExport, toast, ui } from './state.svelte.ts';
	import { experience } from './experience/state.svelte.ts';
	import { saveZip } from './download.svelte.ts';
	import { Download } from './icons.ts';
	import Sheet from './Sheet.svelte';

	let { report = false }: { report?: boolean } = $props();
	let includeErrors = $state(false);
	let busy = $state(false);
	let error = $state('');
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
			if (hasOmissions)
				toast('Workspace exported with omissions. Open the copy and check Activity for details.', {
					tone: 'warning'
				});
			else toast('Workspace exported.', { tone: 'success' });
		} catch (cause) {
			error = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

{#if report}
	<Sheet title="Workspace activity" cancel="Done" onclose={close}>
		<p class="muted">
			Saved with the workspace from PixelDoll {workspaceInfo?.build}. PixelLab is off and nothing
			will restart.
		</p>
		{#if workspaceInfo?.missing.length}
			<p class="notice warn">
				{workspaceInfo.missing.length} artwork files were missing or unreadable.
			</p>
		{/if}
		{#if workspaceInfo?.omitted}
			<ul class="notice warn">
				{#if workspaceInfo.omitted.characters}
					<li>Saved characters skipped: {workspaceInfo.omitted.characters}.</li>
				{/if}
				{#if workspaceInfo.omitted.demoOutfit}<li>
						The demo uses its default outfit settings.
					</li>{/if}
				{#if workspaceInfo.omitted.exportSettings}<li>
						The copy uses default export settings.
					</li>{/if}
			</ul>
		{/if}
		{#if workspaceInfo?.diagnostics}
			<p>PixelLab tier: {workspaceInfo.diagnostics.tier ?? 'Not recorded'}</p>
			{#if workspaceInfo.diagnostics.errors.length}
				<ul class="reports">
					{#each workspaceInfo.diagnostics.errors as entry, index (index)}
						<li>
							{new Date(entry.at).toLocaleString()} · {entry.tool} · {entry.outcome}{entry.http
								? ` · HTTP ${entry.http}`
								: ''}{entry.code === undefined ? '' : ` · Code ${entry.code}`}{entry.message
								? ` · ${entry.message}`
								: ''}
						</li>
					{/each}
				</ul>
			{:else}<p>No recent errors or unfinished jobs were recorded.</p>{/if}
		{:else}<p>Recent errors were not included.</p>{/if}
	</Sheet>
{:else}
	<Sheet title="Export my workspace" onclose={close} cancelDisabled={busy}>
		<p>
			Download one ZIP with all your saved characters, items, moves, outfits, and workspace
			settings.
		</p>
		<p class="muted">
			The file includes artwork and saved prompts, but not your PixelLab key or unfinished drafts.
			Share it only with someone you trust.
		</p>
		<label class="check"
			><input type="checkbox" bind:checked={includeErrors} disabled={busy} />Include recent errors</label
		>
		{#if includeErrors}<p class="muted small">
				Adds your PixelLab tier, recent request outcomes and the error text they returned, shortened
				and filtered to remove links and likely credentials.
			</p>{/if}
		{#if error}<p class="notice warn" role="alert">{error}</p>{/if}
		{#snippet footer()}
			<button
				class="btn primary bu-action"
				data-variant="primary"
				disabled={busy}
				onclick={download}><Download size={16} />{busy ? 'Preparing…' : 'Download ZIP'}</button
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
		overflow-wrap: anywhere; /* an error's own words can be one long unbroken run */
	}
</style>
