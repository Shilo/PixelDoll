<script lang="ts">
	import Sprite from './Sprite.svelte';
	import { moveThumbnails } from './moveThumbnails.ts';
	import { ui, doc, store, view, isDemo, moving } from './state.svelte.ts';
	import Lazy from './Lazy.svelte';
	import { ChevronRight, Plus } from './icons.ts';
	import { moveLabel } from './model.ts';
	import SavedActions from './SavedActions.svelte';
	import { downloadMoveZip } from './download.svelte.ts';
	import { moveDeletionBlocked, removeMove } from './moveActions.svelte.ts';
	const m = $derived(store.project?.manifest);
	const moveIds = $derived(m?.rig.animations.map((a) => a.id) ?? []);
	const nice = (id: string) => moveLabel(id, moveIds);
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
					locked={moveDeletionBlocked(a.id)}
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
								label="{nice(a.id)} preview"
							/></span
						>
						<span class="move-text"
							><b>{nice(a.id)}</b><span class="muted small"
								>{a.cells}
								{a.cells === 1 ? 'frame' : 'frames'} · {nDirs === 1
									? `${dirs[0]?.id ?? 'one'} only`
									: `${nDirs} directions`}</span
							></span
						>
					</button>
				</SavedActions>
			{/each}
		</div>
		<details class="disclosure">
			<summary><ChevronRight size={14} />Details</summary>
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
					<dt>Cell</dt>
					<dd>{m.rig.cell.w}×{m.rig.cell.h}, pivot {m.rig.pivot.x},{m.rig.pivot.y}</dd>
					<dt>Directions</dt>
					<dd>
						{m.rig.directions
							.map((d) => d.id + (d.mirrorOf ? ` (mirror of ${d.mirrorOf})` : ''))
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
							? 'Failed: tap for details'
							: `Adding… ${moving.progress?.done ?? 0}/${moving.progress?.total ?? '?'}`}</span
					></span
				></button
			>
		{/if}
		{#each queued as q, i (i)}
			<button class="move-row bu-action" data-variant="tile" onclick={() => (ui.sheet = 'move')}
				><span class="bu-ring ring" aria-hidden="true"></span><span class="move-text"
					><b>{nice(q.spec.id)}</b><span class="muted small"
						>{moving.error ? 'Waiting for the failed move' : 'Queued'}</span
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
				onclick={() => (ui.sheet = 'move')}><Plus size={16} />Add a move</button
			>{/if}
	{/if}
</div>
