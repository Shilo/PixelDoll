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
		openFrames
	} from './state.svelte.ts';
	import { ChevronRight, Plus } from './icons.ts';
	import { displayMove } from './displayMove.ts';
	import { displayError } from '../lib/i18n.ts';
	import { STATE_CAPTURE_MODE } from '../lib/rig/setup.ts';
	import { characterBodySize } from './experience/bounds.ts';
	import { buildPresentation } from './experience/presentation.ts';
	import { croppedBacking } from './experience/thumbnails.svelte.ts';
	import SavedActions from './SavedActions.svelte';
	import { downloadMoveZip } from './download.svelte.ts';
	import { moveDeletionBlocked, removeMove } from './moveActions.svelte.ts';
	import { displayDirectionInSentence } from './displayDirection.ts';
	import { playbackClips } from '../lib/runtime/timeline.js';
	import { t } from 'svelte-whisper';
	let { kind, onaddstate }: { kind: 'state' | 'move'; onaddstate?: () => void } = $props();
	const m = $derived(store.project?.manifest);
	const playback = $derived(playbackClips(m?.rig.animations ?? []));
	const clips = $derived(playback.filter((entry) => entry.kind === kind));
	const bodySize = $derived(store.project && characterBodySize(store.project));
	const moveIds = $derived(m?.rig.animations.map((a) => a.id) ?? []);
	const nice = (id: string) => displayMove(id, moveIds);
	const mine = $derived(!!moving.spec && moving.projectId === doc.id && !moving.done);
	const queued = $derived(moving.queued.filter((q) => q.projectId === doc.id));
	const assets = $derived.by(() => {
		void doc.rev;
		return view.project ? buildPresentation(view.project) : null;
	});
	const thumbnails = $derived(assets && moveThumbnails(assets, view.items));
</script>

<div class="colors">
	{#if m && view.project && thumbnails}
		<div class="move-list">
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
					ondownload={() => downloadMoveZip(a.id)}
					onfixframes={() => openFrames('', a.id)}
					oncapture={kind === 'move' && !isDemo()
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
							></span
						>
					</button>
				</SavedActions>
			{/each}
			{#if kind === 'move'}
				{#if mine && moving.spec}
					<button class="move-row bu-action" data-variant="tile" onclick={() => (ui.sheet = 'move')}
						><span
							class="bu-ring ring"
							class:spin={!moving.error && !moving.repairReview}
							aria-hidden="true"
						></span><span class="move-text"
							><b>{nice(moving.spec.id)}</b><span class="muted small"
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
							><b>{nice(q.spec.id)}</b><span class="muted small"
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
		{#if kind === 'move' && !isDemo()}<button
				class="bu-action add-row cta"
				data-variant="outline"
				onclick={() => (ui.sheet = 'move')}
				><Plus size={16} />{openerLabel(t('moves.add'))}<SurfaceChevron /></button
			>{:else if kind === 'state' && onaddstate}<button
				class="bu-action add-row cta"
				data-variant="outline"
				onclick={onaddstate}
				><Plus size={16} />{openerLabel(t('moves.addState'))}<SurfaceChevron /></button
			>{/if}
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
	/* The list gap already separates the CTA from the rows above it. */
	.cta {
		margin-top: 0;
	}
</style>
