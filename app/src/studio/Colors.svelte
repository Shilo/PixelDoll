<script lang="ts">
	import { t } from 'svelte-whisper';
	import { onDestroy } from 'svelte';
	// Material swatches: each option is the REAL variant ramp (lib/dress exact index swap), drawn as its color steps.
	import { SWATCHES, variantOf, variantRampOf } from '../lib/dress/dress.ts';
	import type { Hex, Material } from '../lib/store/manifest.ts';
	import { doc, store, setVariant, previewVariant, clearVariantPreview } from './state.svelte.ts';
	import { displaySwatch } from './displaySwatch.ts';
	import { Plus } from './icons.ts';
	import { itemMaterialNames } from './materialNames.ts';
	// One item's materials; ColorSections gives each worn item its own section and header.
	let { only }: { only: string } = $props();

	const m = $derived(store.project?.manifest);
	const it = $derived(m?.items.find((i) => i.id === only));
	const matsOf = (id: string) => (m ? m.materials.filter((x) => x.owner === id) : []);
	const chosen = (mat: Material) => (m ? variantOf(m, doc.variants, mat.id) : undefined);
	const nameOf = (id?: string) => {
		const mat = m?.materials.find((x) => x.id === id),
			it = m?.items.find((i) => i.id === mat?.owner);
		return mat && it
			? `${it.name} ${itemMaterialNames(it, matsOf(it.id), m ?? [])[matsOf(it.id).indexOf(mat)].toLowerCase()}`
			: mat?.label;
	};
	// the picker opens on the color in use (T1 P3), not a fixed gray
	const custom = (mat: Material) => {
		const v = chosen(mat);
		return v?.startsWith('#')
			? v
			: (variantRampOf(mat, v ?? '') ?? mat.ramp)[Math.floor(mat.ramp.length / 2)];
	};
	// The "+" well shows the color while it is dragged, before the picker commits it.
	const shownPick = (mat: Material) => {
		const preview = doc.colorPreview?.id === mat.id ? doc.colorPreview.value : '';
		const used = chosen(mat);
		return preview || (used?.startsWith('#') ? used : '');
	};
	// One undo step and one save when the picker closes, never one per dragged pixel.
	const commitPick = (mat: Material, value: string) => {
		const was = custom(mat);
		clearVariantPreview();
		if (value !== was) setVariant(mat.id, value);
	};
	// A section that goes away takes its uncommitted preview with it.
	onDestroy(clearVariantPreview);
	// A picker that closes without a change (cancelled) can leave its last previewed color behind; the next click outside the
	// well ends it. Clicks inside the well keep it so the picker can be reopened.
	$effect(() => {
		if (!doc.colorPreview) return;
		const end = (e: PointerEvent) => {
			if ((e.target as Element | null)?.closest?.('.swatch.pick')) return;
			clearVariantPreview();
		};
		window.addEventListener('pointerdown', end, true);
		return () => window.removeEventListener('pointerdown', end, true);
	});
</script>

<div class="colors">
	{#if it}
		{@const mats = matsOf(it.id)}
		{@const names = itemMaterialNames(it, mats, m ?? [])}
		{#each mats as mat, mi (mat.id)}
			<div class="mat">
				<span class="muted small">{names[mi]}</span>
				{#if mat.linkTo}
					<span class="faint small">{t('colors.follows', { name: nameOf(mat.linkTo) })}</span>
				{:else}
					<div
						class="swatches"
						role="radiogroup"
						aria-label={t('colors.miColor', { mi: names[mi] })}
					>
						<button
							class="swatch"
							role="radio"
							aria-checked={!doc.variants[mat.id]}
							tabindex={!doc.variants[mat.id] || doc.variants[mat.id]?.startsWith('#') ? 0 : -1}
							title={mat.defaultVariant ? t('colors.titleSavedColor') : t('colors.titleOriginal')}
							aria-label={mat.defaultVariant
								? t('colors.titleSavedColor')
								: t('colors.titleOriginal')}
							onclick={() => setVariant(mat.id, null)}
						>
							{#each mat.defaultVariant ? (variantRampOf(mat, mat.defaultVariant) ?? mat.ramp) : mat.ramp as c, i (i)}<i
									style:background={c}
								></i>{/each}
						</button>
						{#each Object.keys(SWATCHES) as name (name)}
							{@const r = variantRampOf(mat, name)}
							{#if r}
								{@const label = displaySwatch(name)}
								<button
									class="swatch"
									role="radio"
									aria-checked={doc.variants[mat.id] === name}
									tabindex={doc.variants[mat.id] === name ? 0 : -1}
									title={label}
									aria-label={label}
									onclick={() => setVariant(mat.id, name)}
								>
									{#each r as c, i (i)}<i style:background={c}></i>{/each}
								</button>
							{/if}
						{/each}
						<label
							class="swatch pick"
							title={t('colors.titlePickAnyColor')}
							style:background={shownPick(mat)}
						>
							{#if !shownPick(mat)}<Plus size={14} />{/if}
							<span class="sr">{t('colors.titlePickAnyColor')}</span>
							<input
								type="color"
								value={custom(mat)}
								oninput={(e) => previewVariant(mat.id, e.currentTarget.value)}
								onchange={(e) => commitPick(mat, e.currentTarget.value)}
								onblur={clearVariantPreview}
							/>
						</label>
					</div>
				{/if}
			</div>
		{/each}
	{/if}
</div>
