<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import Sprite from './Sprite.svelte';
	import { lookThumbnails } from './moveThumbnails.ts';
	import {
		ui,
		doc,
		store,
		view,
		isDemo,
		moving,
		openMoveReview,
		characterItemJobs,
		elsewhereMove,
		mirrorElsewhereMove,
		workRunsInAnotherTab
	} from './state.svelte.ts';
	import { onMount } from 'svelte';
	import { inFlight } from './itemJobs.ts';
	import { ChevronRight, Plus } from './icons.ts';
	import { displayMove } from './displayMove.ts';
	import type { MoveSpec } from './create.ts';
	import type { RigAnimation } from '../lib/rig/rig.ts';
	import { STATE_CAPTURE_MODE, setupRedoMoves, unposedView } from '../lib/rig/setup.ts';
	import { clipItemCoverage } from './itemGeneration.ts';
	import { characterBodySize } from './experience/bounds.ts';
	import { croppedBacking } from './experience/thumbnails.svelte.ts';
	import ClipActions from './ClipActions.svelte';
	import ListSearch from './ListSearch.svelte';
	import { createSearchVisibility } from './searchVisibility.svelte.ts';
	import { matchesSearch } from '../lib/search/match.ts';
	import { displayDirectionInSentence } from './displayDirection.ts';
	import { playbackClips } from '../lib/runtime/timeline.js';
	import { formatNumber, formatPercent, t } from 'svelte-whisper';
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
	// Moves with views without poses (setup skipped them, or views were kept without joints) still play, but items cannot be
	// animated there until those views are made again.
	const redo = $derived(setupRedoMoves(store.exportRecord));
	const needsRedo = (a: RigAnimation) =>
		!!m?.rig.directions.some((d) => !d.mirrorOf && unposedView(redo, a, d.id));
	const jobName = (spec: MoveSpec) => displayMoveJob(nice(spec.id), spec, m?.items);
	const saved = (spec: MoveSpec) => playback.find((entry) => entry.clip.id === spec.id);
	// The tab a job's row belongs in: its saved clip's, or Moves for a move still being made.
	const inThisTab = (spec: MoveSpec) => (saved(spec)?.kind ?? 'move') === kind;
	// Items drawn on a saved move or State show on its own row and on their Wardrobe tiles, not as rows of their own,
	// unless the job needs attention (failed, or waiting for its frame review) or its clip is gone: that row opens it.
	const ownRow = (spec: MoveSpec) => !spec.itemsOnly || !saved(spec);
	const mine = $derived(
		!!moving.spec &&
			moving.projectId === doc.id &&
			!moving.done &&
			inThisTab(moving.spec) &&
			(ownRow(moving.spec) || !!moving.error || !!moving.repairReview)
	);
	const queued = $derived(
		moving.queued.filter((q) => q.projectId === doc.id && ownRow(q.spec) && inThisTab(q.spec))
	);
	const drawing = $derived(characterItemJobs(doc.id, $queue.jobs));
	// Another tab's stored move, mirrored here read-only: our own moving state stays empty in a follower.
	const elsewhere = $derived(
		kind === 'move' && workRunsInAnotherTab() && elsewhereMove.current?.projectId === doc.id
			? elsewhereMove.current
			: null
	);
	const elsewhereRunning = $derived(
		elsewhere?.spec && ownRow(elsewhere.spec) && inThisTab(elsewhere.spec) ? elsewhere.spec : null
	);
	const elsewhereQueued = $derived(
		elsewhere?.queued.filter(
			(q) => q.projectId === doc.id && ownRow(q.spec) && inThisTab(q.spec)
		) ?? []
	);
	// The record changes only in the leading tab: keep the mirror current while this list is open.
	onMount(() => {
		void mirrorElsewhereMove();
		const timer = setInterval(() => void mirrorElsewhereMove(), 2000);
		return () => clearInterval(timer);
	});
	const itemName = (id: string) => m?.items.find((item) => item.id === id)?.name ?? '';
	// A running move reports finished calls in progress.done; the queued call in flight adds its own partial progress.
	const movePercent = $derived.by(() => {
		const progress = moving.progress;
		if (!progress?.total) return 0;
		return Math.min(
			100,
			Math.round(
				((progress.done + inFlight(moving.spec?.activityScope, $queue.jobs)) / progress.total) * 100
			)
		);
	});
	const thumbnails = $derived(view.project && lookThumbnails(view.project, view.items));
	const pendingStates = $derived(
		kind === 'state'
			? Object.values(store.stateAttempts).map((attempt) => ({
					attempt,
					progress: stateProgress(attempt, $queue.jobs)
				}))
			: []
	);
	let query = $state('');
	let list = $state<HTMLElement>();
	const reviewRows = $derived(kind === 'move' ? Object.values(store.moveReviews) : []);
	// Every named row's own label is its search field; the semantic order stays the same.
	const matchedClips = $derived(clips.filter(({ clip }) => matchesSearch([nice(clip.id)], query)));
	const matchedPending = $derived(
		pendingStates.filter(({ attempt }) => matchesSearch([moveLabel(attempt.id)], query))
	);
	const matchedReviews = $derived(
		reviewRows.filter((candidate) => matchesSearch([nice(candidate.spec.id)], query))
	);
	const matchedMine = $derived(
		mine && moving.spec ? matchesSearch([jobName(moving.spec)], query) : false
	);
	const matchedQueued = $derived(queued.filter((q) => matchesSearch([jobName(q.spec)], query)));
	const matchedElsewhereRunning = $derived(
		!!elsewhereRunning && matchesSearch([jobName(elsewhereRunning)], query)
	);
	const matchedElsewhereQueued = $derived(
		elsewhereQueued.filter((q) => matchesSearch([jobName(q.spec)], query))
	);
	const rowTotal = $derived(
		clips.length +
			pendingStates.length +
			reviewRows.length +
			(mine && moving.spec ? 1 : 0) +
			queued.length +
			(elsewhereRunning ? 1 : 0) +
			elsewhereQueued.length
	);
	const rowMatches = $derived(
		matchedClips.length +
			matchedPending.length +
			matchedReviews.length +
			(matchedMine ? 1 : 0) +
			matchedQueued.length +
			(matchedElsewhereRunning ? 1 : 0) +
			matchedElsewhereQueued.length
	);
	const visibility = createSearchVisibility({
		element: () => list,
		total: () => rowTotal,
		query: () => query
	});
	// A query belongs to the character and tab whose rows it filters.
	$effect(() => {
		void doc.id;
		void kind;
		query = '';
	});
</script>

{#snippet stateRow(attempt: StateAttempt, progress: StateProgress)}
	<button
		class="move-row bu-action"
		data-variant="tile"
		data-trail="moves.reviewState"
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

<div class="panel-stack">
	<ListSearch
		bind:value={query}
		label={t(kind === 'state' ? 'search.states' : 'search.moves')}
		placeholder={t('experience.placeholderSearch')}
		clearLabel={t('search.clear')}
		summary={t('search.results', { count: rowMatches, total: rowTotal })}
		shown={visibility.visible}
	/>
	<div class="equipment-scroll panel-list" bind:this={list}>
		<div class="colors">
			{#if m && view.project && thumbnails}
				<div class="move-list" data-rows>
					{#if query && rowMatches === 0}
						<p class="faint small no-match">
							{t(kind === 'state' ? 'moves.noMatchingStates' : 'moves.noMatchingMoves')}
						</p>
					{/if}
					{#each matchedPending.filter(({ progress }) => progress.status !== 'generating') as { attempt, progress } (attempt.token)}
						{@render stateRow(attempt, progress)}
					{/each}
					{#each matchedReviews as candidate (candidate.spec.id)}
						<button
							class="move-row bu-action"
							data-variant="tile"
							data-trail="moves.reviewMove"
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
					{#each matchedClips as { clip: a } (a.id)}
						{@const image = thumbnails(a.id, ui.dir, ui.frame)}
						{@const base = m.items.find((i) => i.id === m.rig.baseItem)}
						{@const dirs = m.rig.directions.filter(
							(d) => !d.mirrorOf && base?.layers[0].cells?.[a.id]?.[d.id]?.some(Boolean)
						)}
						{@const nDirs =
							dirs.length +
							m.rig.directions.filter((d) => d.mirrorOf && dirs.some((x) => x.id === d.mirrorOf))
								.length}
						{@const items = clipItemCoverage(m, a.id)}
						{@const jobs = drawing.filter((job) => job.clip === a.id)}
						{@const now = jobs.find((job) => job.status === 'drawing')}
						<ClipActions id={a.id} {kind} name={nice(a.id)}>
							<button
								class="move-row bu-action"
								data-variant="tile"
								aria-pressed={ui.anim === a.id}
								data-trail="moves.pick"
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
									>{#if now}<span class="muted small item-jobs"
											><span class="bu-ring ring spin" aria-hidden="true"></span><span
												>{[
													formatPercent(now.percent / 100),
													t('moves.drawingItem', { item: itemName(now.item) }),
													jobs.length > 1 &&
														t('moves.moreQueued', {
															count: jobs.length - 1,
															n: formatNumber(jobs.length - 1)
														})
												]
													.filter(Boolean)
													.join(' · ')}</span
											></span
										>{:else if jobs.length}<span class="muted small item-jobs"
											><span class="bu-ring ring" aria-hidden="true"></span><span
												>{moving.repairReview
													? t('moves.waitingForRepairReview')
													: moving.error
														? t('moves.waitingForFailed')
														: t('moves.itemsQueued', {
																count: jobs.length,
																n: formatNumber(jobs.length)
															})}</span
											></span
										>{:else if items?.total}<span class="muted small"
											>{t('moves.itemsDrawn', {
												count: items.total,
												drawn: formatNumber(items.drawn),
												n: formatNumber(items.total)
											})}</span
										>{/if}{#if needsRedo(a)}<span class="small redo">{t('moves.needsRedo')}</span
										>{/if}</span
								>
							</button>
						</ClipActions>
					{/each}
					<!-- Running States sit below the saved ones, like a Move being added. -->
					{#each matchedPending.filter(({ progress }) => progress.status === 'generating') as { attempt, progress } (attempt.token)}
						{@render stateRow(attempt, progress)}
					{/each}
					{#if matchedMine && moving.spec}
						<button
							class="move-row bu-action"
							data-variant="tile"
							data-trail="moves.openRunning"
							onclick={() => (ui.sheet = 'move')}
							><span class="move-thumb"
								><span
									class="bu-ring ring"
									class:spin={!moving.error && !moving.repairReview}
									aria-hidden="true"
								></span></span
							><span class="move-text"
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
								>{#if !moving.error && !moving.repairReview && moving.progress}<span
										class="muted small num">{formatPercent(movePercent / 100)}</span
									>{/if}</span
							></button
						>
					{/if}
					{#each matchedQueued as q, i (i)}
						<button
							class="move-row bu-action"
							data-variant="tile"
							data-trail="moves.openQueued"
							onclick={() => (ui.sheet = 'move')}
							><span class="move-thumb"><span class="bu-ring ring" aria-hidden="true"></span></span
							><span class="move-text"
								><b>{jobName(q.spec)}</b><span class="muted small"
									>{moving.repairReview
										? t('moves.waitingForRepairReview')
										: moving.error
											? t('moves.waitingForFailed')
											: t('generation.status.queued')}</span
								>{#if !moving.error && !moving.repairReview}<span class="muted small num"
										>{formatPercent(0)}</span
									>{/if}</span
							></button
						>
					{/each}
					<!-- Another tab's move and its queue: the same rows, informative and never clickable here. -->
					{#if elsewhereRunning && matchedElsewhereRunning}
						<div class="move-row bu-action elsewhere" data-variant="tile">
							<span class="move-thumb"
								><span class="bu-ring ring spin" aria-hidden="true"></span></span
							>
							<span class="move-text"
								><b>{jobName(elsewhereRunning)}</b><span class="muted small"
									>{t('moves.inAnotherTab')}</span
								></span
							>
						</div>
					{/if}
					{#each matchedElsewhereQueued as q, i (i)}
						<div class="move-row bu-action elsewhere" data-variant="tile">
							<span class="move-thumb"><span class="bu-ring ring" aria-hidden="true"></span></span>
							<span class="move-text"
								><b>{jobName(q.spec)}</b><span class="muted small"
									>{t('moves.queuedInAnotherTab')}</span
								></span
							>
						</div>
					{/each}
				</div>
				{#if kind === 'move' && !isDemo()}<button
						class="bu-action add-row cta"
						data-variant="outline"
						data-tip-anchor="add-move"
						data-trail="moves.add"
						onclick={() => (ui.sheet = 'move')}
						><Plus size={16} />{openerLabel(t('moves.add'))}<SurfaceChevron /></button
					>{:else if kind === 'state' && onaddstate}<button
						class="bu-action add-row cta"
						data-variant="outline"
						data-tip-anchor="add-state"
						data-trail="moves.addState"
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
	</div>
</div>

<style>
	/* A move setup skipped: still shown, marked to make again. */
	.redo {
		color: var(--warn);
	}
	/* Items being drawn on this move: a small ring, then the share done and the status, in place of the drawn count. */
	.item-jobs {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.item-jobs .ring {
		width: 12px;
		height: 12px;
	}
	.item-jobs > :not(.ring) {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* The list gap already separates the CTA from the rows above it. */
	.cta {
		margin-top: 0;
	}

	/* Another tab's rows are informative: no hover, click or pointer, so they cannot start or queue anything here. */
	.elsewhere {
		pointer-events: none;
	}

	.no-match {
		padding: 4px 8px;
		margin: 0;
	}
</style>
