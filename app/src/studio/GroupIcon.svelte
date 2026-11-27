<script lang="ts">
	// Equipment category icons in Lucide's style (see slotIcons.ts). `group` is a slot key: a built-in draws its profile's
	// icon, a custom slot its own choice when it has one. `icon` draws one choice directly, for the custom-slot picker.
	// `surface` is the only place a size comes from, and `data-icon` names the drawing so tests assert by key, not markup.
	// Core icons render as Lucide components; drawings render here with the same stroke attributes Lucide uses.
	import type { LucideIcon } from '@lucide/svelte';
	import type { SlotIcon } from '../lib/store/manifest.ts';
	import { store } from './state.svelte.ts';
	import { iconOf } from './slots.ts';
	import {
		Backpack,
		Crown,
		Gem,
		Glasses,
		Hand,
		PersonStanding,
		Scissors,
		Shield,
		Shirt,
		Star,
		Sword,
		Tag
	} from './icons.ts';
	import {
		SLOT_ICONS,
		SLOT_ICON_SIZES,
		SLOT_ICON_VIEW_BOX,
		type LucideSlotIcon,
		type SlotIconSurface
	} from './slotIcons.ts';
	const LUCIDE: Record<LucideSlotIcon, LucideIcon> = {
		'person-standing': PersonStanding,
		crown: Crown,
		scissors: Scissors,
		glasses: Glasses,
		shirt: Shirt,
		hand: Hand,
		backpack: Backpack,
		sword: Sword,
		shield: Shield,
		tag: Tag,
		star: Star,
		gem: Gem
	};
	let {
		group = '',
		surface,
		icon
	}: { group?: string; surface: SlotIconSurface; icon?: SlotIcon } = $props();
	const key = $derived(icon ?? iconOf(store.project?.manifest, group));
	const art = $derived(SLOT_ICONS[key] ?? SLOT_ICONS.accessory);
	const Core = $derived(typeof art === 'string' ? LUCIDE[art] : undefined);
	const size = $derived(SLOT_ICON_SIZES[surface]);
</script>

{#if Core}
	<Core class="group-icon" data-icon={key} {size} aria-hidden="true" />
{:else if typeof art !== 'string'}
	<svg
		class="group-icon"
		data-icon={key}
		width={size}
		height={size}
		viewBox={`0 0 ${SLOT_ICON_VIEW_BOX} ${SLOT_ICON_VIEW_BOX}`}
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		>{#each art as el, i (i)}{#if el[0] === 'circle'}<circle {...el[1]} />{:else}<path
					{...el[1]}
				/>{/if}{/each}</svg
	>
{/if}
