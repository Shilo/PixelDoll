<script lang="ts">
	import Sprite from './Sprite.svelte';
	import { moveThumbnails } from './moveThumbnails.ts';
	import { ui, doc, store, view, isDemo, moving } from './state.svelte.ts';
	import Lazy from './Lazy.svelte';
	import { ChevronRight, Plus } from './icons.ts';
	import { displayMove } from './displayMove.ts';
	import { displayError } from '../lib/i18n.ts';
	import SavedActions from './SavedActions.svelte';
	import { downloadMoveZip } from './download.svelte.ts';
	import { moveDeletionBlocked, removeMove } from './moveActions.svelte.ts';
	import { displayDirectionInSentence } from './displayDirection.ts';
	import { t } from 'svelte-whisper';
	const m = $derived(store.project?.manifest);
	const moveIds = $derived(m?.rig.animations.map((a) => a.id) ?? []);
	const nice = (id: string) => displayMove(id, moveIds);
	const k = $derived(Math.max(1, Math.floor(ui.dpr)));
	const mine = $derived(!!moving.spec && moving.projectId === doc.id && !moving.done);
	const queued = $derived(moving.queued.filter((q) => q.projectId === doc.id));
	// Created characters start with Default only; the one-tap offer (and its pipeline code) loads only while idle or walk is missing.
	const baseMissing = $derived(
		!!m && ['idle', 'walk'].some((id) => !m!.rig.animations.some((a) => a.id === id))
	);
	const thumbnails = $derived.by(() => {
		void doc.rev;
		return view.project ? moveThumbnails(view.project, $state.snapshot(doc.items)) : null;
	});
</script>

<div class="colors">
	{#if m && view.project && thumbnails}
		<div class="move-list">
			{#each m.rig.animations as a (a.id)}
				{@const base = m.items.find((i) => i.id === m.rig.baseItem)}
				{@const dirs = m.rig.directions.filter(
					(d) => !d.mirrorOf && base?.layers[0].cells?.[a.id]?.[d.id]?.some(Boolean)
				)}
				{@const nDirs =
					dirs.length +
					m.rig.directions.filter((d) => d.mirrorOf && dirs.some((x) => x.id === d.mirrorOf))
						.length}
				<SavedActions
					name={nice(a.id)}
					kind="move"
					locked={displayError(moveDeletionBlocked(a.id))}
					ondownload={() => downloadMoveZip(a.id)}
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
								img={thumbnails(
									a.id,
									dirs[0]?.id ?? 'south',
									a.frames[ui.frame % a.frames.length].cell
								)}
								{k}
								limit={56}
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
									: t('moves.directions', { count: nDirs })}</span
							></span
						>
					</button>
				</SavedActions>
			{/each}
		</div>
		<details class="disclosure">
			<summary><ChevronRight size={14} />{t('common.details')}</summary>
			<div>
				<dl class="kv">
					{#each m.rig.animations as a (a.id)}
						{@const src = Object.values(a.sources ?? {})[0]}
						<dt>{nice(a.id)}</dt>
						<dd>
							{a.frames.map((f) => `${f.cell}:${f.ms}ms`).join(' ')}{src
								? ` · ${src.route}, ${src.motion}`
								: a.source?.mode
									? ` · ${a.source.mode}`
									: ''}
						</dd>
					{/each}
					<dt>{t('moves.cell')}</dt>
					<dd>
						{t('moves.cellSize', {
							w: m.rig.cell.w,
							h: m.rig.cell.h,
							x: m.rig.pivot.x,
							y: m.rig.pivot.y
						})}
					</dd>
					<dt>{t('common.directions')}</dt>
					<dd>
						{m.rig.directions
							.map((d) =>
								d.mirrorOf ? t('moves.mirrorOf', { direction: d.id, source: d.mirrorOf }) : d.id
							)
							.join(', ')}
					</dd>
				</dl>
			</div>
		</details>
		{#if mine && moving.spec}
			<button class="move-row bu-action" data-variant="tile" onclick={() => (ui.sheet = 'move')}
				><span class="bu-ring ring" class:spin={!moving.error} aria-hidden="true"></span><span
					class="move-text"
					><b>{nice(moving.spec.id)}</b><span class="muted small"
						>{moving.error
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
						>{moving.error ? t('moves.waitingForFailed') : t('generation.status.queued')}</span
					></span
				></button
			>
		{/each}
		{#if !isDemo() && baseMissing}<Lazy
				load={() => import('./BaseMoves.svelte')}
				sheet={false}
				projectId={doc.id}
				manifest={m}
			/>{/if}
		{#if !isDemo()}<button
				class="bu-action add-row"
				data-variant="outline"
				onclick={() => (ui.sheet = 'move')}><Plus size={16} />{t('moves.add')}</button
			>{/if}
	{/if}
</div>
