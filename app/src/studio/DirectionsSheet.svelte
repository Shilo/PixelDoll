<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { LocalizedError, errorMessage, message, type Message } from '../lib/message.ts';
	import { formatNumber, t } from 'svelte-whisper';
	import { displayError } from '../lib/i18n.ts';
	import Sheet from './Sheet.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import DirectionCompass from './DirectionCompass.svelte';
	import { directionProblemError, retainCharacterDirections } from '../lib/rig/directions.ts';
	import { displayDirectionList, displayDirectionProblem } from './displayDirectionProblem.ts';
	import type { DirectionName } from '../lib/rig/rig.ts';
	import * as db from '../lib/store/db.ts';
	import { loadProject } from '../lib/store/project.ts';
	import { downloadCharacterZip } from './download.svelte.ts';
	import {
		directionEditsBlocked,
		flushSave,
		refreshCharacterDirections,
		toast,
		ui
	} from './state.svelte.ts';
	import { Download } from './icons.ts';

	let { id }: { id: string } = $props();
	let loaded = $state.raw<Awaited<ReturnType<typeof loadProject>>>();
	const record = $derived(loaded?.rec);
	let excluded = $state.raw<DirectionName[]>([]);
	let confirm = $state(false);
	let busy = $state(false);
	let error = $state<string | Message>('');
	const retained = $derived(
		record?.manifest.rig.directions.filter(({ id }) => !excluded.includes(id)) ?? []
	);
	const blocked = $derived(directionEditsBlocked(id));
	const problem = $derived(
		loaded && excluded.length ? directionProblemError(loaded.project, retained, 'saved') : undefined
	);
	const losesCardinal = $derived(excluded.some((dir) => !dir.includes('-')));
	$effect(() => {
		const projectId = id;
		const controller = new AbortController();
		void (async () => {
			try {
				await flushSave();
				const saved = await loadProject(projectId, controller.signal);
				if (saved.rec.origin !== 'studio')
					throw new LocalizedError(
						'This saved character is no longer available.',
						'directionsSheet.characterUnavailable'
					);
				if (!controller.signal.aborted) loaded = saved;
			} catch (failure) {
				if (!controller.signal.aborted) error = errorMessage(failure);
			}
		})();
		return () => controller.abort();
	});

	function toggle(direction: DirectionName) {
		excluded = excluded.includes(direction)
			? excluded.filter((dir) => dir !== direction)
			: [...excluded, direction];
	}
	async function remove() {
		if (!loaded || !record || !excluded.length || problem || blocked || busy) return;
		busy = true;
		error = '';
		try {
			const next = await retainCharacterDirections(record, retained, loaded.project.images);
			const reason = directionEditsBlocked(id);
			if (reason) throw reason;
			next.savedAt = new Date().toISOString();
			await db.saveCharacterDirections(record, next);
		} catch (failure) {
			error = errorMessage(failure);
			busy = false;
			return;
		}
		try {
			if (await refreshCharacterDirections(id))
				toast(message('directionsSheet.removed', { count: excluded.length }));
			else
				toast(message('directionsSheet.directionsWereSavedReloadToRefreshThe'), {
					tone: 'warning'
				});
		} catch (failure) {
			toast(
				message('directionsSheet.directionsWereSavedReloadToRefreshThe2', {
					reason: errorMessage(failure)
				}),
				{ tone: 'warning' }
			);
		} finally {
			ui.sheet = null;
		}
	}
</script>

<Sheet title={t('common.directions')} cancelDisabled={busy} onclose={() => (ui.sheet = null)}>
	{#if record}
		<p class="muted">
			{t('directionsSheet.chooseWhichDirectionsToKeepForName', { name: record.manifest.name })}.
		</p>
		<DirectionCompass
			label={t('directionsSheet.labelDirectionsToKeep')}
			available={record.manifest.rig.directions.map(({ id }) => id)}
			selected={retained.map(({ id }) => id)}
			mirrors={Object.fromEntries(
				record.manifest.rig.directions.map(({ id, mirrorOf }) => [id, mirrorOf])
			)}
			disabled={busy}
			ontoggle={toggle}
		/>
		{#if problem || blocked}<p class="notice warn small" role="status">
				{problem ? displayDirectionProblem(problem.translation) : displayError(blocked)}
			</p>{/if}
	{:else if error}<p class="notice bad small" role="alert">{displayDirectionProblem(error)}</p>
	{:else}<p class="muted" role="status">{t('directionsSheet.loadingDirections')}</p>{/if}
	{#snippet footer()}
		{#if record}
			<button
				class="bu-action btn plain"
				data-variant="quiet"
				disabled={busy}
				onclick={() => void downloadCharacterZip(id)}
				><Download size={16} />{t('directionsSheet.downloadBackup')}</button
			>
		{/if}
		<button
			class="bu-action btn primary"
			data-variant="primary"
			disabled={!excluded.length || !!problem || !!blocked || busy}
			onclick={() => {
				error = '';
				confirm = true;
			}}>{openerLabel(t('directionsSheet.reviewRemoval'))}<SurfaceChevron /></button
		>
	{/snippet}
</Sheet>

{#if confirm}
	<ConfirmDialog
		title={t('directionsSheet.removeTitle', {
			count: excluded.length,
			n: formatNumber(excluded.length)
		})}
		action={t('directionsSheet.removePermanently')}
		busyAction={t('directionsSheet.removing')}
		{busy}
		problem={error ? displayDirectionProblem(error) : displayError(blocked)}
		blocked={!!blocked}
		oncancel={() => (confirm = false)}
		onconfirm={() => void remove()}
	>
		<p>
			{t('directionsSheet.confirmRemoval', { directions: displayDirectionList(excluded) })}
		</p>
		{#if losesCardinal}<p>{t('directionsSheet.rPGMakerExportNeedsAllFourCardinal')}</p>{/if}
	</ConfirmDialog>
{/if}
