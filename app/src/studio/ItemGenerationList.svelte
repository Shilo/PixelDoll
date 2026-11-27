<script lang="ts" module>
	import type { Item } from '../lib/store/manifest.ts';
	import type { clipItemOffer } from './itemGeneration.ts';
	export type ItemGenerationRow = {
		item: Item;
		offer: ReturnType<typeof clipItemOffer>;
		/** Why the row cannot be picked, in place of its price. */
		note?: string;
	};
</script>

<script lang="ts">
	import { formatNumber, t } from 'svelte-whisper';
	import Sprite from './Sprite.svelte';
	import { Shirt } from './icons.ts';
	import { thumbCell } from './model.ts';
	import { croppedBacking, croppedThumbnail } from './experience/thumbnails.svelte.ts';
	import { ui } from './state.svelte.ts';
	import type { Project } from '../lib/store/manifest.ts';

	// The pickable equipment for one move or State: tap rows to choose them, each with its estimate.
	let {
		project,
		rows,
		selected = $bindable([]),
		disabled = false,
		label,
		list = $bindable()
	}: {
		project: Project;
		rows: ItemGenerationRow[];
		selected?: string[];
		disabled?: boolean;
		label: string;
		list?: HTMLDivElement;
	} = $props();
	const images = $derived(
		new Map(
			rows.map(({ item }) => {
				const thumb = thumbCell(project, item);
				return [item.id, thumb && croppedThumbnail(thumb)];
			})
		)
	);
</script>

<div class="checkpoint-items" bind:this={list} role="group" aria-label={label}>
	{#each rows as { item, offer, note } (item.id)}
		{@const image = images.get(item.id)}
		<button
			class="bu-action checkpoint-item"
			data-variant="tile"
			disabled={disabled || !offer?.specs.length}
			aria-pressed={selected.includes(item.id)}
			data-trail="itemGeneration.toggleItem"
			onclick={() =>
				(selected = selected.includes(item.id)
					? selected.filter((value) => value !== item.id)
					: [...selected, item.id])}
		>
			<span class="checkpoint-thumb" aria-hidden="true">
				{#if image}<Sprite
						img={image}
						k={croppedBacking(42, image, ui.dpr)}
						fitToBox={image.w > 42 || image.h > 42}
						label=""
					/>{:else}<Shirt size={20} />{/if}
			</span>
			<span class="checkpoint-name"
				><b>{item.name}</b>{#if selected.includes(item.id)}<span class="small" aria-hidden="true"
						>{t('moveSheet.checkpoint.selected')}</span
					>{/if}</span
			>
			<span class="muted small checkpoint-price"
				>{note
					? note
					: offer?.gens != null
						? t('generationDetails.gens', { value: formatNumber(offer.gens) })
						: t('moveSheet.checkpoint.unavailable')}</span
			>
		</button>
	{/each}
</div>

<style>
	.checkpoint-items {
		display: grid;
		gap: 6px;
	}
	.checkpoint-item {
		display: grid;
		grid-template-columns: 42px minmax(0, 1fr) auto;
		align-items: center;
		text-align: start;
		gap: 10px;
		min-height: 54px;
		padding: 5px 10px 5px 7px;
		width: 100%;
	}
	.checkpoint-thumb {
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
	}
	.checkpoint-name {
		display: grid;
		overflow-wrap: anywhere;
	}
	.checkpoint-price {
		text-align: end;
		max-inline-size: 9ch;
		overflow-wrap: anywhere;
		font-variant-numeric: tabular-nums;
	}
</style>
