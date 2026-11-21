<script lang="ts">
	import { t, type WhisperKey } from 'svelte-whisper';
	import { cellImg } from '../lib/compose/compose.ts';
	import { errorMessage, type Message } from '../lib/message.ts';
	import { flipH } from '../lib/rig/mirror.ts';
	import { opaqueBox } from '../lib/rig/normalize.ts';
	import { DIRECTIONS } from '../lib/rig/rig.ts';
	import { displayError } from '../lib/i18n.ts';
	import NewStatePanel from './NewStatePanel.svelte';
	import Sheet from './Sheet.svelte';
	import Sprite from './Sprite.svelte';
	import { ChevronLeft, ChevronRight, Pause, Play } from './icons.ts';
	import { displayMove } from './displayMove.ts';
	import { moveLabel } from './model.ts';
	import {
		captureState,
		stateCaptureId,
		stateCaptureMoves,
		stateCaptureNameIssue,
		stateCaptureSource
	} from './moveActions.svelte.ts';
	import { doc, openProject, store, ui } from './state.svelte.ts';

	type Tab = 'new' | 'move';
	const formId = $props.id();
	const projectId = doc.id;
	// Contextual "Create State from..." names its Move; "Add a state" clears it and starts on New.
	const initialTab: Tab = ui.stateCaptureMove ? 'move' : 'new';
	let tab = $state(initialTab);
	// Panels mount on first visit and then stay mounted (hidden), so switching tabs keeps both drafts.
	let newMounted = $state(initialTab === 'new');
	let newBusy = $state(false);
	const tabs = [
		{ id: 'new', label: 'common.new' },
		{ id: 'move', label: 'stateCapture.fromMove' }
	] as const satisfies readonly { id: Tab; label: WhisperKey }[];
	const initialSource =
		ui.stateCaptureMove || stateCaptureMoves(store.project?.manifest)[0]?.id || '';
	const initialSnapshot =
		store.project && stateCaptureSource(store.project.manifest, initialSource);
	let moveId = $state(initialSource);
	let initial = $state.raw(initialSnapshot);
	const clipIds = $derived(store.project?.manifest.rig.animations.map(({ id }) => id) ?? []);
	const moveName = $derived(displayMove(moveId, clipIds));
	const selectable = $derived(stateCaptureMoves(store.project?.manifest));
	const noMoves = $derived(!selectable.length);
	function suggestedName(sourceId: string) {
		const manifest = store.project?.manifest;
		const root = stateCaptureId(sourceId).slice(0, 48) || 'pose';
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
	let name = $state(suggestedName(initialSource));
	let index = $state(Math.max(0, (initialSnapshot?.move.frames.length ?? 1) - 1));
	let facingIndex = $state(0);
	let rotating = $state(!matchMedia('(prefers-reduced-motion: reduce)').matches);
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
			.sort((left, right) => DIRECTIONS.indexOf(left.id) - DIRECTIONS.indexOf(right.id))
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
	const facingCount = $derived(previews.length);
	const canRotate = $derived(total > 1 && facingCount > 1);
	const preview = $derived(previews[facingIndex]);

	$effect(() => {
		const count = facingCount;
		if (!rotating || !canRotate || tab !== 'move') return;
		const timer = window.setInterval(() => (facingIndex = (facingIndex + 1) % count), 700);
		return () => window.clearInterval(timer);
	});

	function step(delta: number) {
		index = Math.max(0, Math.min(total - 1, index + delta));
		failure = '';
	}

	function chooseSource(id: string) {
		if (!project || busy || doc.id !== projectId) return;
		moveId = id;
		initial = stateCaptureSource(project.manifest, id);
		index = Math.max(0, (initial?.move.frames.length ?? 1) - 1);
		facingIndex = 0;
		name = suggestedName(id);
		stale = false;
		failure = '';
	}

	const locked = $derived(busy || newBusy);

	function choose(next: Tab) {
		if (locked) return;
		tab = next;
		if (next === 'new') newMounted = true;
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

<Sheet
	title={t('stateCapture.title')}
	className="state-capture-sheet"
	cancelDisabled={locked}
	onclose={() => (ui.sheet = null)}
	footer={tab === 'move' ? moveFooter : undefined}
>
	<div class="capture-tabs bu-tabs" role="tablist" aria-labelledby="sheet-title">
		{#each tabs as { id, label } (id)}
			<button
				type="button"
				role="tab"
				id="{formId}-tab-{id}"
				aria-controls="{formId}-panel-{id}"
				aria-selected={tab === id}
				tabindex={tab === id ? 0 : -1}
				disabled={locked && tab !== id}
				onclick={() => choose(id)}>{t(label)}</button
			>
		{/each}
	</div>
	{#if newMounted}
		<div
			id="{formId}-panel-new"
			role="tabpanel"
			aria-labelledby="{formId}-tab-new"
			hidden={tab !== 'new'}
		>
			<NewStatePanel onclose={() => (ui.sheet = null)} onbusy={(value) => (newBusy = value)} />
		</div>
	{/if}
	<div
		id="{formId}-panel-move"
		role="tabpanel"
		aria-labelledby="{formId}-tab-move"
		hidden={tab !== 'move'}
	>
		<form id={formId} class="capture-form" onsubmit={save}>
			<span class="sr" role="status">{busy ? t('stateCapture.saving') : ''}</span>
			{#if !noMoves}
				<label class="field">
					<span class="label">{t('moveSheet.startFrom.label')}</span>
					<select
						class="bu-input input"
						value={moveId}
						disabled={busy}
						onchange={(event) => chooseSource(event.currentTarget.value)}
					>
						{#if !selectable.some(({ id }) => id === moveId)}
							<option value={moveId} disabled>{moveName || t('common.unavailable')}</option>
						{/if}
						{#each selectable as { id } (id)}
							<option value={id}>{displayMove(id, clipIds)}</option>
						{/each}
					</select>
				</label>
			{/if}
			{#if !changed && total}
				{#if total > 1}
					<div class="capture-nav">
						<button
							class="bu-action"
							data-variant="quiet"
							type="button"
							aria-label={t('stage.previousFrame')}
							disabled={busy || index === 0}
							onclick={() => step(-1)}><ChevronLeft size={20} /></button
						>
						<strong aria-live="polite"
							>{t('stage.framePosition', { frame: index + 1, total })}</strong
						>
						<button
							class="bu-action"
							data-variant="quiet"
							type="button"
							aria-label={t('stage.nextFrame')}
							disabled={busy || index >= total - 1}
							onclick={() => step(1)}><ChevronRight size={20} /></button
						>
					</div>
				{/if}
				{#if previews.length}
					{#snippet sprite()}
						<span class="capture-sprite" data-facing={preview?.id}>
							<Sprite
								img={preview?.image ?? null}
								k={1}
								fitToBox
								label={t('moves.preview', { move: moveName })}
							/>
						</span>
					{/snippet}
					{#if canRotate}
						<button
							class="bu-btn capture-preview"
							type="button"
							aria-label={t(rotating ? 'common.pause' : 'common.play')}
							onclick={() => (rotating = !rotating)}
						>
							{@render sprite()}
							<span class="capture-rotation" aria-hidden="true">
								{#if rotating}<Pause size={18} />{:else}<Play size={18} />{/if}
							</span>
						</button>
					{:else}
						<div class="capture-preview">{@render sprite()}</div>
					{/if}
				{/if}
			{/if}
			{#if !noMoves}<label class="field">
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
				</label>{/if}
			{#if noMoves}
				<p class="muted small">{t('stateCapture.noMoves')}</p>
			{:else if changed || !ready || nameIssue || failure}
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
	</div>
</Sheet>

{#snippet moveFooter()}
	{#if !noMoves}
		<div class="capture-footer">
			<p class="muted small">
				<span>{t('stateCapture.noEquipment')}</span>
				<span>{t('stateCapture.noCredits')}</span>
			</p>
			<button
				class="bu-btn"
				data-variant="primary"
				type="submit"
				form={formId}
				disabled={busy || changed || !ready || !!nameIssue}
				>{t(busy ? 'stateCapture.saving' : 'stateCapture.title')}</button
			>
		</div>
	{/if}
{/snippet}

<style>
	:global(dialog.state-capture-sheet:is(.center, .side)) {
		max-inline-size: 344px;
	}
	.capture-tabs {
		justify-content: center;
	}
	.capture-form {
		display: grid;
		gap: 12px;
	}
	.capture-form p,
	.capture-footer p {
		margin: 0;
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
	.capture-preview {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		place-items: center;
		padding: 8px 24px;
		background: var(--stage);
		border: 1px solid var(--bu-line);
		border-radius: var(--r-ctl);
	}
	.capture-sprite {
		inline-size: min(100%, 208px, 32dvh);
		aspect-ratio: 1;
	}
	.capture-rotation {
		position: absolute;
		inset-inline-end: 0;
		inset-block-end: 0;
		min-inline-size: 44px;
		min-block-size: 44px;
		display: grid;
		place-items: center;
	}
	.capture-footer {
		flex: 1;
		min-inline-size: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 8px;
	}
	.capture-footer span {
		display: block;
		overflow-wrap: anywhere;
	}
</style>
