<script lang="ts">
	// The one header for sheets and popover panels (docs/design/2026-11-21-app-bars/plan.md): Back only at the start
	// and only inside an inner pane, the centered title, icon tools, then the X at the end.
	import type { Snippet } from 'svelte';
	import BackButton from './BackButton.svelte';
	import CloseButton from './CloseButton.svelte';
	let {
		title,
		titleId,
		heading,
		tools,
		end,
		back,
		backTo,
		onclose,
		locked = false,
		titleElement = $bindable()
	}: {
		title: string;
		titleId: string;
		/** Inline content beside the title, such as a Name field or a page title. */
		heading?: Snippet;
		/** Icon buttons just before the X. */
		tools?: Snippet;
		/** Replaces the X: a full-window screen ends with the app's Full screen and More instead. */
		end?: Snippet;
		back?: () => void;
		backTo?: string;
		onclose?: () => void;
		/** An atomic save is running: Back and the X wait for it. */
		locked?: boolean;
		titleElement?: HTMLHeadingElement;
	} = $props();
</script>

<header class="sheet-head">
	<div class="sheet-start">
		{#if back}<BackButton onclick={back} to={backTo} disabled={locked} />{/if}
	</div>
	<div class="sheet-heading">
		<h2 id={titleId} class="sheet-title" tabindex="-1" bind:this={titleElement}>{title}</h2>
		{#if heading}{@render heading()}{/if}
	</div>
	<div class="sheet-end">
		{#if tools}{@render tools()}{/if}
		{#if end}{@render end()}{:else if onclose}<CloseButton
				onclick={onclose}
				disabled={locked}
			/>{/if}
	</div>
</header>
