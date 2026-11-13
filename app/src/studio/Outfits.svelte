<script lang="ts">
	// Saved looks (presets) for the customization panel's Outfits tab.
	import { store, doc, applyPreset, savePreset, deletePreset, sameOutfit } from './state.svelte.ts';
	import type { Img } from '../lib/image/png.ts';
	import { buildPresentation, southStill } from './experience/presentation.ts';
	import OutfitThumb from './OutfitThumb.svelte';
	import { tick } from 'svelte';
	import { Plus, X } from './icons.ts';
	import SavedActions from './SavedActions.svelte';
	import { downloadOutfitZip } from './download.svelte.ts';
	const m = $derived(store.project?.manifest);
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
	<section class="group outfits" aria-label="Outfits">
		<ul class="rows">
			{#each m.presets as p (p.id)}
				<li>
					<SavedActions
						name={p.name}
						kind="outfit"
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
					Save a look to switch between outfits in your game.
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
					placeholder="Outfit name"
					aria-label="Outfit name"
					autofocus
				/>
				<button class="bu-action btn primary" data-variant="primary" type="submit">Save</button>
				<button
					class="bu-action btn icon plain"
					data-variant="quiet"
					type="button"
					aria-label="Cancel"
					onclick={closeForm}><X size={14} /></button
				>
			</form>
		{:else}
			<button
				class="bu-action add-row"
				data-variant="outline"
				bind:this={addButton}
				onclick={() => (naming = true)}><Plus size={16} />Save current look</button
			>
		{/if}
	</section>
{/if}
