<script lang="ts">
	// The one header for sheets and popover panels (docs/design/2026-11-21-app-bars/plan.md): Back only at the start
	// and only inside an inner pane, the centered title, icon tools, then the X at the end.
	import type { Component, Snippet } from 'svelte';
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
		opener,
		titleAtStart = false,
		exitNote,
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
		/** A sibling page the sheet can open (Export's Settings); Back takes its place inside that page. `iconOnly` shows just
		 *  the icon, named by its label and tooltip (Import, an infrequent page of New item, New move and New State), after Back
		 *  when the sheet also has one (New move queued over a running move). */
		opener?: { label: string; icon: Component; onclick: () => void; iconOnly?: boolean };
		/** A full-window screen names itself beside Back, as the top bar names the open character. */
		titleAtStart?: boolean;
		/** The id of a note about what leaving does, read with the exit control (Back on a screen, else the X). */
		exitNote?: string;
		onclose?: () => void;
		/** An atomic save is running: Back and the X wait for it. */
		locked?: boolean;
		titleElement?: HTMLHeadingElement;
	} = $props();
</script>

{#snippet titleHeading()}
	<h2 id={titleId} class="sheet-title" tabindex="-1" bind:this={titleElement}>{title}</h2>
{/snippet}

<header class="sheet-head">
	<div class="sheet-start">
		{#if back}<BackButton
				onclick={back}
				to={backTo}
				disabled={locked}
				describedBy={end ? exitNote : undefined}
			/>
		{/if}
		{#if opener?.iconOnly}<button
				type="button"
				class="bu-action btn plain icon surface-opener"
				data-variant="quiet"
				aria-label={opener.label}
				title={opener.label}
				disabled={locked}
				onclick={opener.onclick}><opener.icon size={20} aria-hidden="true" /></button
			>{:else if opener && !back}<button
				type="button"
				class="bu-action btn plain surface-back surface-opener"
				data-variant="quiet"
				disabled={locked}
				onclick={opener.onclick}
				><opener.icon size={18} aria-hidden="true" /><span class="surface-back-label"
					>{opener.label}</span
				></button
			>{/if}
		{#if titleAtStart}{@render titleHeading()}{/if}
	</div>
	<div class="sheet-heading">
		{#if !titleAtStart}{@render titleHeading()}{/if}
		{#if heading}{@render heading()}{/if}
	</div>
	<div class="sheet-end">
		{#if tools}{@render tools()}{/if}
		{#if end}{@render end()}{:else if onclose}<CloseButton
				onclick={onclose}
				disabled={locked}
				describedBy={exitNote}
			/>{/if}
	</div>
</header>
