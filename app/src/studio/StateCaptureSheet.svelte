<script lang="ts">
	import { t } from 'svelte-whisper';
	import { cellImg } from '../lib/compose/compose.ts';
	import { errorMessage, type Message } from '../lib/message.ts';
	import { flipH } from '../lib/rig/mirror.ts';
	import { opaqueBox } from '../lib/rig/normalize.ts';
	import { DIRECTIONS } from '../lib/rig/rig.ts';
	import { displayError } from '../lib/i18n.ts';
	import Sheet from './Sheet.svelte';
	import Sprite from './Sprite.svelte';
	import { ChevronLeft, ChevronRight, Pause, Play } from './icons.ts';
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
	let facingIndex = $state(0);
	let rotating = $state(!matchMedia('(prefers-reduced-motion: reduce)').matches);
	let busy = $state(false);
	let stale = $state(false);
	let failure = $state<Message | string>('');
	const project = $derived(store.project);
	const source = $derived(project && stateCaptureSource(project.manifest, moveId));
	const changed = $derived(stale || doc.id !== projectId || source?.version !== initial?.version);
	const sourcePlaceholder = '\uFFFC';
	const [beforeMove, afterMove] = $derived(
		t('stateCapture.source', { move: sourcePlaceholder }).split(sourcePlaceholder)
	);
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
	const preview = $derived(previews[facingIndex]);

	$effect(() => {
		const count = facingCount;
		if (!rotating || count < 2) return;
		const timer = window.setInterval(() => (facingIndex = (facingIndex + 1) % count), 700);
		return () => window.clearInterval(timer);
	});

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

<Sheet
	title={t('stateCapture.title')}
	className="state-capture-sheet"
	cancelDisabled={busy}
	onclose={() => (ui.sheet = null)}
>
	<form id={formId} class="capture-form" onsubmit={save}>
		<span class="sr" role="status">{busy ? t('stateCapture.saving') : ''}</span>
		<p class="muted small capture-source">{beforeMove}<strong>{moveName}</strong>{afterMove}</p>
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
				<div class="capture-preview">
					<div class="capture-sprite" data-facing={preview?.id}>
						<Sprite
							img={preview?.image ?? null}
							k={1}
							fitToBox
							label={t('moves.preview', { move: moveName })}
						/>
					</div>
					{#if facingCount > 1}
						<button
							class="bu-action capture-rotation"
							data-variant="quiet"
							type="button"
							aria-label={t(rotating ? 'common.pause' : 'common.play')}
							onclick={() => (rotating = !rotating)}
						>
							{#if rotating}<Pause size={18} />{:else}<Play size={18} />{/if}
						</button>
					{/if}
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
	{/snippet}
</Sheet>

<style>
	:global(dialog.state-capture-sheet:is(.center, .side)) {
		max-inline-size: 344px;
	}
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
	.capture-preview {
		position: relative;
		display: grid;
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
