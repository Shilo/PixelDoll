<script lang="ts">
	// A component whose code loads the first time it shows (sheets, the generation card), not at startup. A failed chunk load
	// says so and, for a sheet, closes it instead of leaving an invisible sheet open.
	import type { Component } from 'svelte';
	import { ui, toast } from './state.svelte.ts';
	import { lazy } from '../lib/lazy.ts';
	import { errorMessage } from '../lib/message.ts';
	import { currentArea } from './problemCapture.svelte.ts';
	type AnyComponent = Component<any>; // each component has its own props
	let {
		load,
		sheet = true,
		onLoadError,
		...props
	}: {
		load: () => Promise<{ default: AnyComponent }>;
		sheet?: boolean;
		onLoadError?: () => void;
		[prop: string]: unknown;
	} = $props();
	let Loaded = $state.raw<AnyComponent>();
	$effect(() => {
		let live = true;
		lazy(load).then(
			(m) => {
				if (live) Loaded = m.default;
			},
			(error: unknown) => {
				if (!live) return;
				// The sheet closes before the notice shows: name the area it was opening.
				const area = sheet ? currentArea() : undefined;
				if (onLoadError) onLoadError();
				else if (sheet) ui.sheet = null;
				toast(errorMessage(error), { tone: 'danger', error, area });
			}
		);
		return () => {
			live = false;
		};
	});
</script>

{#if Loaded}<Loaded {...props} />{/if}
