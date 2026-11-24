<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { LocalizedError, errorMessage, message, type Message } from '../lib/message.ts';
	import { formatNumber, t } from 'svelte-whisper';
	import ReportButton from './ReportButton.svelte';
	import { displayError } from '../lib/i18n.ts';
	import Sheet from './Sheet.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import DirectionCompass from './DirectionCompass.svelte';
	import {
		availableDirectionViews,
		configureDirections,
		directionProblemError,
		editDirectionChoice
	} from '../lib/rig/directions.ts';
	import { displayDirectionList, displayDirectionProblem } from './displayDirectionProblem.ts';
	import type { DirectionName, RigDirection } from '../lib/rig/rig.ts';
	import * as db from '../lib/store/db.ts';
	import { loadProject, pngBlobs } from '../lib/store/project.ts';
	import { downloadCharacterZip } from './download.svelte.ts';
	import {
		blockedByWork,
		directionEditsBlocked,
		flushSave,
		openPendingWork,
		prepareArtworkStep,
		recordArtworkStep,
		refreshCharacterDirections,
		splitBeforeEdit,
		toast,
		ui
	} from './state.svelte.ts';
	import { Download } from './icons.ts';

	let { id }: { id: string } = $props();
	let loaded = $state.raw<Awaited<ReturnType<typeof loadProject>>>();
	const record = $derived(loaded?.rec);
	const original = $derived(record?.manifest.rig.directions ?? []);
	const originalIds = $derived(original.map(({ id }) => id));
	let choices = $state.raw<RigDirection[] | null>(null);
	let confirm = $state(false);
	let busy = $state(false);
	let error = $state<string | Message>('');
	const retained = $derived(choices ?? original);
	const selected = $derived(retained.map(({ id }) => id));
	const excluded = $derived(originalIds.filter((id) => !selected.includes(id)));
	const replaced = $derived(
		original.flatMap(({ id, mirrorOf }) =>
			!mirrorOf && retained.some((view) => view.id === id && view.mirrorOf) ? [id] : []
		)
	);
	const changed = $derived(
		retained.length !== original.length ||
			retained.some(
				({ id, mirrorOf }) => !original.some((view) => view.id === id && view.mirrorOf === mirrorOf)
			)
	);
	const removalOnly = $derived(
		excluded.length > 0 &&
			retained.every(({ id, mirrorOf }) =>
				original.some((view) => view.id === id && view.mirrorOf === mirrorOf)
			)
	);
	const blocked = $derived(directionEditsBlocked(id));
	const problem = $derived(
		loaded && changed ? directionProblemError(loaded.project, retained) : undefined
	);
	const losesCardinal = $derived(excluded.some((dir) => !dir.includes('-')));
	$effect(() => {
		const projectId = id;
		const controller = new AbortController();
		void (async () => {
			try {
				await flushSave();
				await splitBeforeEdit(projectId);
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

	function toggle(direction: DirectionName, control: 'direction' | 'mirror') {
		error = '';
		choices = editDirectionChoice(original, retained, direction, control);
	}
	async function save() {
		if (!loaded || !record || !changed || problem || blocked || busy) return;
		busy = true;
		error = '';
		let step: Awaited<ReturnType<typeof prepareArtworkStep>>;
		try {
			const { record: next, newImages } = await configureDirections(
				record,
				retained,
				loaded.project.images
			);
			const blobs = await pngBlobs(newImages);
			const reason = directionEditsBlocked(id);
			if (reason) throw reason;
			next.savedAt = new Date().toISOString();
			step = await prepareArtworkStep(
				{
					projectId: id,
					label: message('history.changeDirections'),
					before: record,
					after: next,
					action: 'change directions for'
				},
				blobs
			);
			await db.saveIdleCharacter(record, next, blobs, 'change directions for');
			recordArtworkStep(id, step);
		} catch (failure) {
			error = errorMessage(failure);
			busy = false;
			return;
		}
		try {
			// Without a step, the notice that it was saved but cannot be undone stays unless a reload is needed.
			if (await refreshCharacterDirections(id)) {
				if (step)
					toast(
						removalOnly
							? message('directionsSheet.removed', { count: excluded.length })
							: message('directionsSheet.saved')
					);
			} else
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

<Sheet
	title={t('common.directions')}
	locked={busy}
	dirty={changed}
	onclose={() => (ui.sheet = null)}
>
	{#if record}
		<p class="muted">
			{t('directionsSheet.chooseWhichDirectionsToKeepForName', { name: record.manifest.name })}.
		</p>
		{#if originalIds.some((dir) => dir.includes('east') || dir.includes('west'))}
			<p class="muted small">{t('directionsSheet.mirrorEditHint')}</p>
		{/if}
		<DirectionCompass
			label={t('directionsSheet.labelDirectionsToKeep')}
			available={availableDirectionViews(original)}
			{selected}
			mirrors={Object.fromEntries(retained.map(({ id, mirrorOf }) => [id, mirrorOf]))}
			mirrorSources={originalIds}
			mirrorTargets={availableDirectionViews(original)}
			disabled={busy}
			ontoggle={(dir) => toggle(dir, 'direction')}
			onmirror={(dir) => toggle(dir, 'mirror')}
		/>
		{#if problem || blocked}<p class="notice warn small" role="status">
				{problem ? displayDirectionProblem(problem.translation) : displayError(blocked)}
			</p>{/if}
		{#if !problem && blockedByWork(blocked)}{@render viewPending()}{/if}
		{#if error && !confirm}<p class="notice bad small" role="alert">
				{displayDirectionProblem(error)}<ReportButton {error} />
			</p>{/if}
	{:else if error}<p class="notice bad small" role="alert">
			{displayDirectionProblem(error)}<ReportButton {error} />
		</p>
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
			disabled={!changed || !!problem || !!blocked || busy}
			onclick={() => {
				error = '';
				if (excluded.length || replaced.length) confirm = true;
				else void save();
			}}
			>{#if excluded.length || replaced.length}
				{openerLabel(
					t(removalOnly ? 'directionsSheet.reviewRemoval' : 'directionsSheet.reviewChanges')
				)}<SurfaceChevron />
			{:else}{t('common.save')}{/if}</button
		>
	{/snippet}
</Sheet>

{#snippet viewPending()}
	<button
		class="bu-btn"
		onclick={() => {
			confirm = false;
			void openPendingWork({
				projectId: id,
				flows: !!blocked && blocked.translation.key !== 'directionsSheet.resolveDrafts'
			});
		}}>{openerLabel(t('deleteSheet.viewPendingWork'))}<SurfaceChevron /></button
	>
{/snippet}
{#if confirm}
	<ConfirmDialog
		title={removalOnly
			? t('directionsSheet.removeTitle', {
					count: excluded.length,
					n: formatNumber(excluded.length)
				})
			: t('directionsSheet.changeTitle')}
		action={t(removalOnly ? 'directionsSheet.remove' : 'common.save')}
		busyAction={t(removalOnly ? 'directionsSheet.removing' : 'directionsSheet.saving')}
		{busy}
		problem={error ? displayDirectionProblem(error) : displayError(blocked)}
		problemAction={!error && blockedByWork(blocked) ? viewPending : undefined}
		blocked={!!blocked}
		oncancel={() => (confirm = false)}
		onconfirm={() => void save()}
	>
		{#if excluded.length}<p>
				{t(removalOnly ? 'directionsSheet.confirmRemoval' : 'directionsSheet.confirmMixedRemoval', {
					directions: displayDirectionList(excluded)
				})}
			</p>{/if}
		{#if replaced.length}<p>
				{t('directionsSheet.confirmReplace', { directions: displayDirectionList(replaced) })}
			</p>{/if}
		{#if losesCardinal}<p>{t('directionsSheet.rPGMakerExportNeedsAllFourCardinal')}</p>{/if}
	</ConfirmDialog>
{/if}
