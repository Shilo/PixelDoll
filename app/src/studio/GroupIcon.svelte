<script lang="ts">
	// Equipment category icons drawn as the gear's own shape (approved in UI lab round 5), on Lucide's 24px line grid.
	let { group, size = 16 }: { group: string; size?: number } = $props();
	const PATHS: Record<string, string[]> = {
		Head: ['M4 16a8 8 0 0 1 16 0v2H4z', 'M12 8v10', 'M8 13h8'],
		Hair: ['M5 21V12a7 7 0 0 1 14 0v9', 'M5 12c3 0 7-1.5 9-5', 'M14 7c1 2.5 3 4 5 5'],
		Face: [
			'M3 14a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
			'M14 14a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
			'M10 14c1.3-1 2.7-1 4 0'
		],
		Body: [
			'M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z'
		],
		Legs: ['M6 3h12l1.5 18h-5.5L12 11l-2 10H4.5z', 'M6 7h12'],
		Feet: ['M7 3h6v8l5.6 2.6A2.5 2.5 0 0 1 20 15.9V20H7z', 'M7 16h13'],
		Back: ['M8 3h8l4 18H4z', 'M8 3c0 3 1.8 4.5 4 4.5S16 6 16 3'],
		'Main hand': ['M14.5 17.5 3 6V3h3l11.5 11.5', 'm13 19 6-6', 'm16 16 4 4', 'm19 21 2-2'],
		'Off hand': [
			'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'
		]
	};
	const paths = $derived(PATHS[group] ?? PATHS.Body);
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
