<script lang="ts">
	// Equipment category icons drawn as the gear's own shape (approved in UI lab round 5), on Lucide's 24px line grid. `group`
	// is a slot key: a category without its own drawing uses its behavior's (a custom copy of Back looks like Back).
	import { store } from './state.svelte.ts';
	import { iconOf } from './slots.ts';
	let { group, size = 16 }: { group: string; size?: number } = $props();
	const PATHS: Record<string, string[]> = {
		head: ['M4 16a8 8 0 0 1 16 0v2H4z', 'M12 8v10', 'M8 13h8'],
		hair: ['M5 21V12a7 7 0 0 1 14 0v9', 'M5 12c3 0 7-1.5 9-5', 'M14 7c1 2.5 3 4 5 5'],
		face: [
			'M3 14a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
			'M14 14a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
			'M10 14c1.3-1 2.7-1 4 0'
		],
		body: [
			'M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z'
		],
		hands: [
			'M18 11V6a2 2 0 0 0-4 0v4',
			'M14 10V4a2 2 0 0 0-4 0v2',
			'M10 10.5V6a2 2 0 0 0-4 0v8',
			'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'
		],
		legs: ['M6 3h12l1.5 18h-5.5L12 11l-2 10H4.5z', 'M6 7h12'],
		feet: ['M7 3h6v8l5.6 2.6A2.5 2.5 0 0 1 20 15.9V20H7z', 'M7 16h13'],
		back: ['M8 3h8l4 18H4z', 'M8 3c0 3 1.8 4.5 4 4.5S16 6 16 3'],
		main_hand: ['M14.5 17.5 3 6V3h3l11.5 11.5', 'm13 19 6-6', 'm16 16 4 4', 'm19 21 2-2'],
		off_hand: [
			'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'
		],
		accessory: [
			'M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z',
			'M7.5 7.5h.01'
		]
	};
	const paths = $derived(PATHS[iconOf(store.project?.manifest, group)] ?? PATHS.accessory);
</script>

<svg
	class="group-icon"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	>{#each paths as d (d)}<path {d} />{/each}</svg
>
