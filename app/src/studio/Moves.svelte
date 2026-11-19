<script lang="ts">
	import Sprite from './Sprite.svelte';
	import { moveThumbnails } from './moveThumbnails.ts';
	import { ui, doc, store, view, isDemo, moving } from './state.svelte.ts';
	import { ChevronRight, Plus } from './icons.ts';
	import { moveLabel, pixelSize } from './model.ts';
	import { characterBodySize } from './experience/bounds.ts';
	import { buildPresentation } from './experience/presentation.ts';
	import { croppedBacking } from './experience/thumbnails.svelte.ts';
	import SavedActions from './SavedActions.svelte';
	import { downloadMoveZip } from './download.svelte.ts';
	import { moveDeletionBlocked, removeMove } from './moveActions.svelte.ts';
	const m = $derived(store.project?.manifest);
	const bodySize = $derived(store.project && characterBodySize(store.project));
	const moveIds = $derived(m?.rig.animations.map((a) => a.id) ?? []);
	const nice = (id: string) => moveLabel(id, moveIds);
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
			{#each m.rig.animations as a (a.id)}
				{@const image = thumbnails(a.id, ui.dir, ui.frame)}
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
								img={image}
								k={image ? croppedBacking(56, image, ui.dpr) : 1}
								fitToBox={!!image && (image.w > 56 || image.h > 56)}
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
					{#if bodySize}
						<dt>Body</dt>
						<dd>{pixelSize(bodySize)}</dd>
					{/if}
					<dt>Frame</dt>
					<dd>{pixelSize(m.rig.cell)}, pivot {m.rig.pivot.x},{m.rig.pivot.y}</dd>
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
				><span
					class="bu-ring ring"
					class:spin={!moving.error && !moving.repairReview}
					aria-hidden="true"
				></span><span class="move-text"
					><b>{nice(moving.spec.id)}</b><span class="muted small"
						>{moving.repairReview
							? moving.spec?.redrawItem
								? 'Review item redraw'
								: 'Review item repair'
							: moving.error
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
						>{moving.repairReview
							? 'Waiting for repair review'
							: moving.error
								? 'Waiting for the failed move'
								: 'Queued'}</span
					></span
				></button
			>
		{/each}
		{#if !isDemo()}<button
				class="bu-action add-row"
				data-variant="outline"
				onclick={() => (ui.sheet = 'move')}><Plus size={16} />Add a move</button
			>{/if}
	{/if}
</div>
