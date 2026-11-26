<script lang="ts">
	// Equipment category icons drawn as the gear's own silhouette (see slotIcons.ts for why they are filled, not outlined).
	// `group` is a slot key: a built-in draws its profile's icon, a custom slot its own choice when it has one. `icon` draws
	// one choice directly, for the custom-slot picker. `surface` is the only place a size comes from, and `data-icon` names
	// the drawing so a format swap (paths today, raster masks later) is asserted by key instead of by markup.
	import type { SlotIcon } from '../lib/store/manifest.ts';
	import { store } from './state.svelte.ts';
	import { iconOf } from './slots.ts';
	import {
		SLOT_ICON_PATHS,
		SLOT_ICON_SIZES,
		SLOT_ICON_VIEW_BOX,
		type SlotIconSurface
	} from './slotIcons.ts';
	let {
		group = '',
		surface,
		icon
	}: { group?: string; surface: SlotIconSurface; icon?: SlotIcon } = $props();
	const key = $derived(icon ?? iconOf(store.project?.manifest, group));
	const d = $derived(SLOT_ICON_PATHS[key] ?? SLOT_ICON_PATHS.accessory);
	const size = $derived(SLOT_ICON_SIZES[surface]);
</script>

<svg
	class="group-icon"
	data-icon={key}
	width={size}
	height={size}
	viewBox={`0 0 ${SLOT_ICON_VIEW_BOX} ${SLOT_ICON_VIEW_BOX}`}
	fill="currentColor"
	aria-hidden="true"><path {d} fill-rule="evenodd" /></svg
>
