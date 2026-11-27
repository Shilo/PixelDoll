<script lang="ts">
	// The Import page of New item (itemImporter.svelte.ts holds its state): the ZIP's items with how each comes to this
	// character. The sheet renders the footer (ImportFoot).
	import ReportButton from './ReportButton.svelte';
	import SharedThumb from './SharedThumb.svelte';
	import ZipDrop from './ZipDrop.svelte';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { t } from 'svelte-whisper';
	import { displayMessage, displayNestedMessage } from '../lib/i18n.ts';
	import { freeItemName } from '../lib/equipment/copy.ts';
	import type { SharedItem } from '../lib/equipment/shared.ts';
	import { slotLabelMessage } from './slots.ts';
	import type { ItemImporter } from './itemImporter.svelte.ts';
	import { store } from './state.svelte.ts';

	let {
		importer,
		onmake
	}: {
		importer: ItemImporter;
		/** Make an item of another body new for this character: the New item form, filled in from it. */
		onmake: (entry: SharedItem) => void;
	} = $props();
	const review = $derived(importer.review);
	const busy = $derived(importer.busy);
	const FIT = {
		copy: 'itemImport.row.copy',
		refit: 'itemImport.row.refit',
		unfitted: 'itemImport.row.unfitted',
		remake: 'itemImport.row.remake'
	} as const;
	const kept = (entry: SharedItem) => {
		const name = freeItemName(entry.item.name, review?.own ?? []);
		return name === entry.item.name ? '' : name;
	};
</script>

<div
	class="import-page"
	role="presentation"
	ondragenter={importer.drop.enter}
	ondragleave={importer.drop.leave}
	ondragover={importer.drop.over}
	ondrop={importer.drop.drop}
>
	<ZipDrop
		{busy}
		dragging={importer.dragging}
		intro={t('itemImport.intro')}
		compact={!!review}
		onfiles={(files) => void importer.read(files)}
	/>
	{#if review}
		{#if !review.entries.length && !review.present.length}<p class="muted">
				{t('itemImport.empty')}
			</p>{/if}
		<ul class="rows">
			{#each review.entries as entry (entry.item.id)}
				{@const free = entry.fit !== 'remake'}
				{@const renamed = free ? kept(entry) : ''}
				<li class="row">
					<span class="thumb"><SharedThumb {entry} /></span>
					<span class="text">
						{#if free}
							<label class="check"
								><input
									type="checkbox"
									checked={importer.chosen.includes(entry.item.id)}
									disabled={busy}
									onchange={(e) => importer.toggle(entry.item.id, e.currentTarget.checked)}
								/><b>{entry.item.name}</b></label
							>
						{:else}<b>{entry.item.name}</b>{/if}
						<span class="muted small"
							>{displayMessage(slotLabelMessage(entry.source, entry.item.slot))}</span
						>
						<span class="small">{t(FIT[entry.fit])}</span>
						{#if renamed}<span class="muted small"
								>{t('moveImport.row.copy', { name: renamed })}</span
							>{/if}
						{#if !free}<button
								class="bu-action btn make"
								data-variant="outline"
								disabled={busy}
								onclick={() => onmake(entry)}>{t('itemMenu.remake')}<SurfaceChevron /></button
							>{/if}
					</span>
				</li>
			{/each}
			{#each review.present as item (item.id)}
				<li class="row">
					<span class="thumb"
						><SharedThumb
							entry={{
								sourceId: review.source.id,
								sourceName: review.source.manifest.name,
								source: review.source.manifest,
								savedAt: '',
								item,
								variants: review.source.variants,
								at: '',
								fit: 'copy',
								cells: [],
								images: review.source.images
							}}
						/></span
					>
					<span class="text">
						<b>{item.name}</b>
						<span class="muted small"
							>{displayMessage(slotLabelMessage(review.source.manifest, item.slot))}</span
						>
						<span class="small">{t('moveImport.row.present')}</span>
					</span>
				</li>
			{/each}
		</ul>
		{#if review.skipped}<p class="bu-notice" data-size="compact" data-tone="warning" role="status">
				{t('itemImport.skipped', { count: review.skipped })}
			</p>{/if}
	{/if}
	{#if importer.error}<p class="bu-notice" data-size="compact" data-tone="danger" role="alert">
			{displayNestedMessage(importer.error)}{#if importer.cause}<ReportButton
					error={importer.cause}
				/>{/if}
		</p>{/if}
</div>

<style>
	.import-page {
		display: grid;
		gap: 12px;
		min-width: 0;
	}
	.rows {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		min-width: 0;
	}
	.thumb {
		flex: none;
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
	}
	.text {
		display: grid;
		gap: 2px;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.check {
		align-items: center;
	}
	.make {
		justify-self: start;
		margin-top: 6px;
		min-height: 44px;
		gap: 6px;
	}
</style>
