<script lang="ts">
	// Equipment category icons drawn as the gear's own silhouette (see slotIcons.ts for why they are filled, not outlined).
	// `group` is a slot key: a built-in draws its profile's icon, a custom slot its own choice when it has one. `icon` draws
	// one choice directly, for the custom-slot picker.
	import type { SlotIcon } from '../lib/store/manifest.ts';
	import { store } from './state.svelte.ts';
	import { iconOf } from './slots.ts';
	import { SLOT_ICON_PATHS } from './slotIcons.ts';
	let {
		group = '',
		size = 16,
		icon
	}: { group?: string; size?: number; icon?: SlotIcon } = $props();
	const d = $derived(
		SLOT_ICON_PATHS[icon ?? iconOf(store.project?.manifest, group)] ?? SLOT_ICON_PATHS.accessory
	);
</script>

<svg
	class="group-icon"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="currentColor"
	aria-hidden="true"><path {d} fill-rule="evenodd" /></svg
>
