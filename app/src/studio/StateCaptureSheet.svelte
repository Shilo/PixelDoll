<script lang="ts">
	import { t } from 'svelte-whisper';
	import { cellImg } from '../lib/compose/compose.ts';
	import { errorMessage, type Message } from '../lib/message.ts';
	import { flipH } from '../lib/rig/mirror.ts';
	import { opaqueBox } from '../lib/rig/normalize.ts';
	import { displayError } from '../lib/i18n.ts';
	import Sheet from './Sheet.svelte';
	import Sprite from './Sprite.svelte';
	import { ChevronLeft, ChevronRight } from './icons.ts';
	import { displayDirection, displayDirectionShort } from './displayDirection.ts';
	import { displayMove } from './displayMove.ts';
	import { moveLabel } from './model.ts';
	import {
		captureState,
		stateCaptureId,
		stateCaptureNameIssue,
		stateCaptureSource
	} from './moveActions.svelte.ts';
	import { doc, openProject, store, ui } from './state.svelte.ts';

	const formId = $props.id();
	const projectId = doc.id;
	const moveId = ui.stateCaptureMove;
	const initial = store.project && stateCaptureSource(store.project.manifest, moveId);
	const moveName = displayMove(
		moveId,
		store.project?.manifest.rig.animations.map(({ id }) => id)
	);
	function suggestedName() {
		const manifest = store.project?.manifest;
		const root = stateCaptureId(moveId).slice(0, 48) || 'pose';
		let candidate = root + '-pose';
		for (
			let suffix = 2;
			manifest &&
			(stateCaptureNameIssue(manifest, candidate) || Object.hasOwn(store.moveReviews, candidate));
			suffix++
		)
			candidate = root + '-pose-' + suffix;
		return moveLabel(candidate);
	}
	let name = $state(suggestedName());
	let index = $state(Math.max(0, (initial?.move.frames.length ?? 1) - 1));
	let busy = $state(false);
	let stale = $state(false);
	let failure = $state<Message | string>('');
	const project = $derived(store.project);
	const source = $derived(project && stateCaptureSource(project.manifest, moveId));
	const changed = $derived(stale || doc.id !== projectId || source?.version !== initial?.version);
	const total = $derived(source?.move.frames.length ?? 0);
	const cell = $derived(source?.move.frames[index]?.cell);
	const id = $derived(stateCaptureId(name));
	const nameIssue = $derived(
		project &&
			(stateCaptureNameIssue(project.manifest, id) ??
				(Object.hasOwn(store.moveReviews, id) ? 'stateCapture.takenName' : undefined))
	);
	const previews = $derived.by(() => {
		if (!project || !source || cell === undefined || changed) return [];
		const drawn = new Set(source.drawn.map(({ id }) => id));
		return project.manifest.rig.directions
			.filter(({ id, mirrorOf }) => drawn.has(mirrorOf ?? id))
			.map(({ id, mirrorOf }) => {
				const base = cellImg(project, source.body, moveId, mirrorOf ?? id, cell);
				const image =
					mirrorOf && base
						? source.cells[id]?.[cell]
							? cellImg(project, source.body, moveId, id, cell)
							: flipH(base)
						: base;
				return { id, image: image && opaqueBox(image) ? image : null };
			});
	});
	const ready = $derived(previews.length > 0 && previews.every(({ image }) => !!image));

	function step(delta: number) {
		index = Math.max(0, Math.min(total - 1, index + delta));
		failure = '';
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || changed || !ready || nameIssue || !source) return;
		busy = true;
		failure = '';
		try {
			await captureState(projectId, moveId, index, id, source.version);
			if (ui.sheet === 'stateCapture') ui.sheet = null;
		} catch (error) {
			failure = errorMessage(error);
			if (typeof failure !== 'string' && failure.key === 'stateCapture.concurrentEdit') {
				stale = true;
				if (doc.id === projectId) await openProject(projectId, { quiet: true });
			}
		} finally {
			busy = false;
		}
	}
</script>

<Sheet title={t('stateCapture.title')} cancelDisabled={busy} onclose={() => (ui.sheet = null)}>
	<form id={formId} class="capture-form" onsubmit={save}>
		<span class="sr" role="status">{busy ? t('stateCapture.saving') : ''}</span>
		<p class="muted small capture-source">{t('stateCapture.source', { move: moveName })}</p>
		{#if !changed && total}
			<div class="capture-nav">
				<button
					class="bu-action"
					data-variant="quiet"
					type="button"
					aria-label={t('stage.previousFrame')}
					disabled={busy || index === 0}
					onclick={() => step(-1)}><ChevronLeft size={20} /></button
				>
				<strong aria-live="polite">{t('stage.framePosition', { frame: index + 1, total })}</strong>
				<button
					class="bu-action"
					data-variant="quiet"
					type="button"
					aria-label={t('stage.nextFrame')}
					disabled={busy || index >= total - 1}
					onclick={() => step(1)}><ChevronRight size={20} /></button
				>
			</div>
			{#if previews.length}
				<div class="capture-views" style:--capture-columns={Math.min(previews.length, 4)}>
					{#each previews as { id: direction, image } (direction)}
						<div class="capture-view">
							<span class="capture-sprite">
								{#if image}<Sprite
										img={image}
										k={1}
										fitToBox
										label={displayDirection(direction)}
									/>{/if}
							</span>
							<span class="muted small" aria-hidden="true">{displayDirectionShort(direction)}</span>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
		<label class="field">
			<span class="label">{t('stateCapture.name')}</span>
			<input
				class="bu-input input"
				type="text"
				bind:value={name}
				disabled={busy}
				maxlength="64"
				aria-invalid={!!nameIssue}
				onfocus={(event) => event.currentTarget.select()}
				oninput={() => (failure = '')}
			/>
		</label>
		{#if changed || !ready || nameIssue || failure}
			<p class="notice bad small" role={nameIssue && !changed && ready ? undefined : 'status'}>
				{changed
					? t('stateCapture.concurrentEdit')
					: !ready
						? t('stateCapture.unavailable')
						: nameIssue
							? t(nameIssue)
							: displayError(failure)}
			</p>
		{:else if name.trim() !== moveLabel(id)}
			<p class="muted small">{t('stateCapture.savedAs', { name: moveLabel(id) })}</p>
		{/if}
	</form>
	{#snippet footer()}
		<div class="capture-footer">
			<p class="muted small">{t('stateCapture.bodyOnly')}</p>
			<button
				class="bu-btn"
				data-variant="primary"
				type="submit"
				form={formId}
				disabled={busy || changed || !ready || !!nameIssue}
				>{t(busy ? 'stateCapture.saving' : 'stateCapture.title')}</button
			>
		</div>
	{/snippet}
</Sheet>

<style>
	.capture-form {
		display: grid;
		gap: 12px;
	}
	.capture-form p,
	.capture-footer p {
		margin: 0;
	}
	.capture-source {
		text-align: center;
		overflow-wrap: anywhere;
	}
	.capture-nav {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr) 44px;
		align-items: center;
		text-align: center;
		justify-self: center;
		width: min(100%, 248px);
		gap: 8px;
	}
	.capture-nav button {
		min-block-size: 44px;
		display: grid;
		place-items: center;
	}
	.capture-nav strong {
		font-variant-numeric: tabular-nums;
	}
	.capture-views {
		display: grid;
		grid-template-columns: repeat(var(--capture-columns), minmax(0, 1fr));
		justify-items: center;
		gap: 10px 4px;
	}
	.capture-view {
		min-inline-size: 0;
		width: 100%;
		display: grid;
		justify-items: center;
		gap: 4px;
	}
	.capture-sprite {
		display: grid;
		place-items: center;
		inline-size: min(100%, 96px);
		aspect-ratio: 1;
	}
	.capture-footer {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px 12px;
	}
</style>
