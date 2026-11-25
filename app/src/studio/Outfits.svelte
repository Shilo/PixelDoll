<script lang="ts">
	import { t } from 'svelte-whisper';
	// Saved looks (presets) for the customization panel's Outfits tab.
	import {
		store,
		doc,
		applyPreset,
		savePreset,
		deletePreset,
		sameOutfit,
		openRename
	} from './state.svelte.ts';
	import type { Img } from '../lib/image/png.ts';
	import { buildPresentation, southStill } from './experience/presentation.ts';
	import OutfitThumb from './OutfitThumb.svelte';
	import { tick } from 'svelte';
	import { Plus, X } from './icons.ts';
	import SavedActions from './SavedActions.svelte';
	import { downloadOutfitZip } from './download.svelte.ts';
	import ListSearch from './ListSearch.svelte';
	import { createSearchVisibility } from './searchVisibility.svelte.ts';
	import { matchesSearch } from '../lib/search/match.ts';
	const m = $derived(store.project?.manifest);
	let query = $state('');
	let list = $state<HTMLElement>();
	const matched = $derived((m?.presets ?? []).filter((p) => matchesSearch([p.name], query)));
	const visibility = createSearchVisibility({
		element: () => list,
		total: () => m?.presets.length ?? 0,
		query: () => query
	});
	// A query belongs to the character whose looks it filters.
	$effect(() => {
		void doc.id;
		query = '';
	});
	const preview = $derived.by(() => {
		void doc.rev;
		if (!store.project) return null;
		const assets = buildPresentation(store.project);
		const pose = southStill(assets);
		const images = new Map<string, Img>();
		if (pose.clip)
			for (const item of store.project.manifest.items)
				for (const layer of item.layers)
					for (const cells of Object.values(layer.cells?.[pose.clip] ?? {})) {
						const hash = cells?.[pose.cell];
						const image = hash && store.project.images.get(hash);
						if (hash && image) images.set(hash, image);
					}
		return {
			assets: { ...assets, project: { ...store.project, images } },
			pose
		};
	});
	let naming = $state(false);
	let outfitName = $state('');
	let addButton = $state<HTMLButtonElement>();
	// The form leaves with its focused control; hand focus back to the button that opened it.
	async function closeForm() {
		naming = false;
		await tick();
		addButton?.focus();
	}
	function saveOutfit() {
		let n = (m?.presets.length ?? 0) + 1;
		while (m?.presets.some((p) => p.name === `Outfit ${n}`)) n++; // a default name after a deletion stays distinct
		savePreset(outfitName.trim() || `Outfit ${n}`);
		outfitName = '';
		void closeForm();
	}
</script>

{#if m}
	<div class="panel-stack">
		<ListSearch
			bind:value={query}
			label={t('search.outfits')}
			placeholder={t('experience.placeholderSearch')}
			clearLabel={t('search.clear')}
			summary={t('search.results', { count: matched.length, total: m.presets.length })}
			shown={visibility.visible}
		/>
		<div class="equipment-scroll panel-list" bind:this={list}>
			<section class="group outfits" aria-label={t('outfits.outfits')}>
				<ul class="rows">
					{#each matched as p (p.id)}
						<li>
							<SavedActions
								name={p.name}
								kind="outfit"
								onrename={() => openRename(doc.id, { outfitId: p.id })}
								ondownload={() => downloadOutfitZip(p.id)}
								ondelete={() => deletePreset(p.id)}
							>
								<button
									class="row bu-action"
									data-variant="tile"
									aria-pressed={sameOutfit(p)}
									onclick={() => applyPreset(p)}
									>{#if preview}<OutfitThumb {preview} preset={p} />{/if}<span class="row-name"
										>{p.name}</span
									></button
								>
							</SavedActions>
						</li>
					{:else}
						<li class="faint small" style="padding:4px 8px">
							{query
								? t('outfits.noMatchingOutfits')
								: t('outfits.saveALookToSwitchBetweenOutfits')}
						</li>
					{/each}
				</ul>
				{#if naming}
					<form
						class="inline-form"
						data-update-draft
						onsubmit={(e) => {
							e.preventDefault();
							saveOutfit();
						}}
					>
						<!-- svelte-ignore a11y_autofocus -->
						<input
							class="bu-input input"
							bind:value={outfitName}
							placeholder={t('outfits.outfitName')}
							aria-label={t('outfits.outfitName')}
							autofocus
						/>
						<button class="bu-action btn primary" data-variant="primary" type="submit"
							>{t('common.save')}</button
						>
						<button
							class="bu-action btn icon plain"
							data-variant="quiet"
							type="button"
							aria-label={t('common.cancel')}
							onclick={closeForm}><X size={14} /></button
						>
					</form>
				{:else}
					<button
						class="bu-action add-row"
						data-variant="outline"
						bind:this={addButton}
						onclick={() => (naming = true)}><Plus size={16} />{t('outfits.saveCurrentLook')}</button
					>
				{/if}
			</section>
		</div>
	</div>
{/if}

<style>
	.add-row {
		justify-content: flex-start;
		text-align: start;
	}
</style>
