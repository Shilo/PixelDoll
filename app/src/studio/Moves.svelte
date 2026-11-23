<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import Sprite from './Sprite.svelte';
	import { moveThumbnails } from './moveThumbnails.ts';
	import {
		ui,
		doc,
		store,
		view,
		isDemo,
		moving,
		blockedByWork,
		openPendingWork,
		openMoveReview,
		openFrames,
		openRename
	} from './state.svelte.ts';
	import { ChevronRight, FolderOpen, Plus } from './icons.ts';
	import { displayMove } from './displayMove.ts';
	import type { MoveSpec } from './create.ts';
	import { displayError } from '../lib/i18n.ts';
	import { STATE_CAPTURE_MODE, setupRedoMoves } from '../lib/rig/setup.ts';
	import { characterBodySize } from './experience/bounds.ts';
	import { buildPresentation } from './experience/presentation.ts';
	import { croppedBacking } from './experience/thumbnails.svelte.ts';
	import SavedActions from './SavedActions.svelte';
	import { downloadMoveZip } from './download.svelte.ts';
	import { moveDeletionBlocked, removeMove } from './moveActions.svelte.ts';
	import { displayDirectionInSentence } from './displayDirection.ts';
	import { playbackClips } from '../lib/runtime/timeline.js';
	import { t } from 'svelte-whisper';
	import { queue } from '../lib/pixellab/queue.ts';
	import { displayMoveJob, moveLabel } from './model.ts';
	import { openStateReview, stateProgress, stateStatusText } from './stateJobs.svelte.ts';
	import type { StateAttempt } from './stateGeneration.ts';
	import type { StateProgress } from './stateRecovery.ts';
	let { kind, onaddstate }: { kind: 'state' | 'move'; onaddstate?: () => void } = $props();
	const m = $derived(store.project?.manifest);
	const playback = $derived(playbackClips(m?.rig.animations ?? []));
	const clips = $derived(playback.filter((entry) => entry.kind === kind));
	const bodySize = $derived(store.project && characterBodySize(store.project));
	const moveRefs = $derived(m?.rig.animations ?? []);
	const nice = (id: string) => displayMove(id, moveRefs);
	// Moves without poses (setup skipped them, or a new move was kept without joints) still play, but items cannot be
	// animated on them until made again.
	const redo = $derived(setupRedoMoves(store.exportRecord));
	const jobName = (spec: MoveSpec) => displayMoveJob(nice(spec.id), spec, m?.items);
	const mine = $derived(!!moving.spec && moving.projectId === doc.id && !moving.done);
	const queued = $derived(moving.queued.filter((q) => q.projectId === doc.id));
	const assets = $derived.by(() => {
		void doc.rev;
		return view.project ? buildPresentation(view.project) : null;
	});
	const thumbnails = $derived(assets && moveThumbnails(assets, view.items));
	const pendingStates = $derived(
		kind === 'state'
			? Object.values(store.stateAttempts).map((attempt) => ({
					attempt,
					progress: stateProgress(attempt, $queue.jobs)
				}))
			: []
	);
</script>

{#snippet stateRow(attempt: StateAttempt, progress: StateProgress)}
	<button
		class="move-row bu-action"
		data-variant="tile"
		onclick={() => openStateReview(attempt.token)}
	>
		{#if progress.status !== 'ready'}<span
				class="bu-ring ring"
				class:spin={progress.status === 'generating'}
				aria-hidden="true"
			></span>{/if}
		<span class="move-text"
			><b>{moveLabel(attempt.id)}</b><span class="muted small">{stateStatusText(progress)}</span
			></span
		>
		{#if progress.status !== 'generating'}<ChevronRight size={16} />{/if}
	</button>
{/snippet}

<div class="colors">
	{#if m && view.project && thumbnails}
		<div class="move-list">
			{#each pendingStates.filter(({ progress }) => progress.status !== 'generating') as { attempt, progress } (attempt.token)}
				{@render stateRow(attempt, progress)}
			{/each}
			{#each kind === 'move' ? Object.values(store.moveReviews) : [] as candidate (candidate.spec.id)}
				<button
					class="move-row bu-action"
					data-variant="tile"
					onclick={() => openMoveReview(candidate.spec.id)}
				>
					<span class="move-text"
						><b>{nice(candidate.spec.id)}</b><span class="muted small"
							>{t('moveSheet.checkpoint.review')}</span
						></span
					>
					<ChevronRight size={16} />
				</button>
			{/each}
			{#each clips as { clip: a } (a.id)}
				{@const image = thumbnails(a.id, ui.dir, ui.frame)}
				{@const base = m.items.find((i) => i.id === m.rig.baseItem)}
				{@const dirs = m.rig.directions.filter(
					(d) => !d.mirrorOf && base?.layers[0].cells?.[a.id]?.[d.id]?.some(Boolean)
				)}
				{@const nDirs =
					dirs.length +
					m.rig.directions.filter((d) => d.mirrorOf && dirs.some((x) => x.id === d.mirrorOf))
						.length}
				{@const lock = moveDeletionBlocked(a.id)}
				<SavedActions
					name={nice(a.id)}
					{kind}
					locked={displayError(lock)}
					onlocked={blockedByWork(lock)
						? () =>
								void openPendingWork({
									projectId: doc.id,
									flows: !!lock && lock.translation.key !== 'moveRemoval.resolveDrafts'
								})
						: undefined}
					onrename={isDemo() ? undefined : () => openRename(doc.id, { moveId: a.id })}
					ondownload={() => downloadMoveZip(a.id)}
					onredraw={kind === 'move' && !isDemo()
						? () => {
								ui.redrawMove = a.id;
								ui.sheet = 'move';
							}
						: undefined}
					onfixframes={() => openFrames('', a.id)}
					oncapture={!isDemo()
						? () => {
								ui.stateCaptureMove = a.id;
								ui.sheet = 'stateCapture';
							}
						: undefined}
					ondelete={() => removeMove(a.id)}
				>
					<button
						class="move-row bu-action"
						data-variant="tile"
						aria-pressed={ui.anim === a.id}
						onclick={() => {
							ui.anim = a.id;
							ui.frame = 0;
						}}
					>
						<span class="move-thumb"
							><Sprite
								img={image}
								k={image ? croppedBacking(56, image, ui.dpr) : 1}
								fitToBox={!!image && (image.w > 56 || image.h > 56)}
								label={t('moves.preview', { move: nice(a.id) })}
							/></span
						>
						<span class="move-text"
							><b>{nice(a.id)}</b><span class="muted small"
								>{t('moves.frames', { count: a.cells })} · {nDirs === 1
									? dirs[0]
										? t('moves.onlyDirection', {
												direction: displayDirectionInSentence(dirs[0].id)
											})
										: t('moves.oneDirection')
									: t('export.count.directions', { count: nDirs })}</span
							>{#if redo.includes(a.id) && !a.sources}<span class="small redo"
									>{t('moves.needsRedo')}</span
								>{/if}</span
						>
					</button>
				</SavedActions>
			{/each}
			<!-- Running States sit below the saved ones, like a Move being added. -->
			{#each pendingStates.filter(({ progress }) => progress.status === 'generating') as { attempt, progress } (attempt.token)}
				{@render stateRow(attempt, progress)}
			{/each}
			{#if kind === 'move'}
				{#if mine && moving.spec}
					<button class="move-row bu-action" data-variant="tile" onclick={() => (ui.sheet = 'move')}
						><span
							class="bu-ring ring"
							class:spin={!moving.error && !moving.repairReview}
							aria-hidden="true"
						></span><span class="move-text"
							><b>{jobName(moving.spec)}</b><span class="muted small"
								>{moving.repairReview
									? moving.spec?.redrawItem
										? t('moveSheet.review.redrawTitle')
										: t('moveSheet.review.repairTitle')
									: moving.error
										? t('moves.failed')
										: t('moves.adding', {
												done: moving.progress?.done ?? 0,
												total: moving.progress?.total ?? '?'
											})}</span
							></span
						></button
					>
				{/if}
				{#each queued as q, i (i)}
					<button class="move-row bu-action" data-variant="tile" onclick={() => (ui.sheet = 'move')}
						><span class="bu-ring ring" aria-hidden="true"></span><span class="move-text"
							><b>{jobName(q.spec)}</b><span class="muted small"
								>{moving.repairReview
									? t('moves.waitingForRepairReview')
									: moving.error
										? t('moves.waitingForFailed')
										: t('generation.status.queued')}</span
							></span
						></button
					>
				{/each}
			{/if}
		</div>
		{#if (kind === 'move' && !isDemo()) || (kind === 'state' && onaddstate)}
			{@const importLabel = openerLabel(
				t(kind === 'move' ? 'moveImport.importMoves' : 'moveImport.importStates')
			)}
			<div class="add-line">
				{#if kind === 'move'}<button
						class="bu-action add-row cta"
						data-variant="outline"
						onclick={() => (ui.sheet = 'move')}
						><Plus size={16} />{openerLabel(t('moves.add'))}<SurfaceChevron /></button
					>{:else}<button class="bu-action add-row cta" data-variant="outline" onclick={onaddstate}
						><Plus size={16} />{openerLabel(t('moves.addState'))}<SurfaceChevron /></button
					>{/if}{#if !isDemo()}<button
						class="bu-action add-row cta import"
						data-variant="outline"
						aria-label={importLabel}
						title={importLabel}
						onclick={() => (ui.sheet = 'importMoves')}><FolderOpen size={16} /></button
					>{/if}
			</div>
		{/if}
		<details class="disclosure">
			<summary><ChevronRight size={14} />{t('common.details')}</summary>
			<div>
				<dl class="kv">
					{#if bodySize}
						<dt>{t('generationDetails.settings.body')}</dt>
						<dd>{t('moves.bodySize', { w: bodySize.w, h: bodySize.h })}</dd>
					{/if}
					<dt>{t('generationDetails.settings.frame')}</dt>
					<dd>
						{t('moves.frameSize', {
							w: m.rig.cell.w,
							h: m.rig.cell.h,
							x: m.rig.pivot.x,
							y: m.rig.pivot.y
						})}
					</dd>
					{#each clips as { clip: a } (a.id)}
						{@const src = Object.values(a.sources ?? {})[0]}
						{@const sourceDetails =
							a.source?.mode === STATE_CAPTURE_MODE
								? ''
								: src
									? ` · ${src.route}, ${src.motion}`
									: a.source?.mode
										? ` · ${a.source.mode}`
										: ''}
						<dt>{nice(a.id)}</dt>
						<dd>
							{a.frames.map((f) => `${f.cell}:${f.ms}ms`).join(' ')}{sourceDetails}
						</dd>
					{/each}
					<dt>{t('common.directions')}</dt>
					<dd>
						{m.rig.directions
							.map((d) =>
								d.mirrorOf
									? t('moves.mirrorOf', {
											direction: displayDirectionInSentence(d.id),
											source: displayDirectionInSentence(d.mirrorOf)
										})
									: displayDirectionInSentence(d.id)
							)
							.join(', ')}
					</dd>
				</dl>
			</div>
		</details>
	{/if}
</div>

<style>
	/* A move setup skipped: still shown, marked to make again. */
	.redo {
		color: var(--warn);
	}
	/* The list gap already separates the CTA from the rows above it. */
	.cta {
		margin-top: 0;
	}
	.add-line {
		display: flex;
		gap: 8px;
	}
	.add-line > .cta:first-child {
		flex: 1 1 auto;
		min-width: 0;
	}
	.import {
		flex: none;
		width: 44px;
		padding: 0;
	}
</style>
