<script lang="ts">
	import Sheet from './Sheet.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import DirectionCompass from './DirectionCompass.svelte';
	import {
		directionLabel,
		directionProblem,
		retainCharacterDirections
	} from '../lib/rig/directions.ts';
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
	let error = $state('');
	const retained = $derived(
		record?.manifest.rig.directions.filter(({ id }) => !excluded.includes(id)) ?? []
	);
	const blocked = $derived(directionEditsBlocked(id));
	const problem = $derived(
		loaded && excluded.length ? directionProblem(loaded.project, retained, 'saved') : ''
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
					throw new Error('This saved character is no longer available.');
				if (!controller.signal.aborted) loaded = saved;
			} catch (failure) {
				if (!controller.signal.aborted) error = (failure as Error).message;
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
			if (reason) throw new Error(reason);
			next.savedAt = new Date().toISOString();
			await db.saveCharacterDirections(record, next);
		} catch (failure) {
			error = (failure as Error).message;
			busy = false;
			return;
		}
		try {
			if (await refreshCharacterDirections(id))
				toast(`Removed ${excluded.length} ${excluded.length === 1 ? 'direction' : 'directions'}`);
			else toast('Directions were saved. Reload to refresh the character.', { tone: 'warning' });
		} catch (failure) {
			toast(
				`Directions were saved. Reload to refresh the character: ${(failure as Error).message}`,
				{ tone: 'warning' }
			);
		} finally {
			ui.sheet = null;
		}
	}
</script>

<Sheet title="Directions" cancelDisabled={busy} onclose={() => (ui.sheet = null)}>
	{#if record}
		<p class="muted">Choose which directions to keep for {record.manifest.name}.</p>
		<DirectionCompass
			label="Directions to keep"
			available={record.manifest.rig.directions.map(({ id }) => id)}
			selected={retained.map(({ id }) => id)}
			mirrors={Object.fromEntries(
				record.manifest.rig.directions.map(({ id, mirrorOf }) => [id, mirrorOf])
			)}
			disabled={busy}
			ontoggle={toggle}
		/>
		{#if problem || blocked}<p class="notice warn small" role="status">{problem || blocked}</p>{/if}
	{:else if error}<p class="notice bad small" role="alert">{error}</p>
	{:else}<p class="muted" role="status">Loading directions…</p>{/if}
	{#snippet footer()}
		{#if record}
			<button
				class="bu-action btn plain"
				data-variant="quiet"
				disabled={busy}
				onclick={() => void downloadCharacterZip(id)}><Download size={16} />Download backup</button
			>
		{/if}
		<button
			class="bu-action btn primary"
			data-variant="primary"
			disabled={!excluded.length || !!problem || !!blocked || busy}
			onclick={() => {
				error = '';
				confirm = true;
			}}>Review removal</button
		>
	{/snippet}
</Sheet>

{#if confirm}
	<ConfirmDialog
		title="Remove {excluded.length === 1 ? 'direction' : `${excluded.length} directions`}?"
		action="Remove permanently"
		busyAction="Removing…"
		{busy}
		problem={error || blocked}
		blocked={!!blocked}
		oncancel={() => (confirm = false)}
		onconfirm={() => void remove()}
	>
		<p>
			{excluded.map(directionLabel).join(', ')} will be removed from this character’s moves and equipment.
			The other directions stay unchanged. This can’t be undone.
		</p>
		{#if losesCardinal}<p>RPG Maker export needs all four cardinal directions.</p>{/if}
	</ConfirmDialog>
{/if}
