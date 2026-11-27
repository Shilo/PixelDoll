<script lang="ts" generics="Id extends string">
	import type { Snippet } from 'svelte';
	import { t, type WhisperKey } from 'svelte-whisper';
	import { Check, ChevronDown } from './icons.ts';
	import PopoverArrow from './PopoverArrow.svelte';
	import { navigateMenu, popoverFocus } from './experience/focus.ts';

	// One format card split in two: its body (the children, the card's radio) only selects, keeping the version already
	// chosen, and its version button selects and opens the version menu. Selecting never opens the menu by itself, so
	// arrow keys across the cards stay plain radio behavior.
	let {
		menuId,
		versions,
		current,
		on,
		disabled,
		menuLabel,
		buttonLabel,
		onchoose,
		children
	}: {
		menuId: string;
		versions: readonly { id: Id; value: WhisperKey; title: WhisperKey; sub: WhisperKey }[];
		/** The selected format; a version that is not this card's shows the card's first version. */
		current: string;
		/** This card is the selected format. */
		on: boolean;
		disabled: boolean;
		menuLabel: WhisperKey;
		/** Takes the chosen version's title as `version`. */
		buttonLabel: WhisperKey;
		onchoose: (id: Id) => void;
		children: Snippet;
	} = $props();

	let menu = $state<HTMLElement>();
	const version = $derived(versions.find((v) => v.id === current) ?? versions[0]);
</script>

<div class="export-split">
	<div class="split-card" class:on>
		{@render children()}
		<button
			type="button"
			class="version-btn"
			popovertarget={menuId}
			aria-haspopup="menu"
			{disabled}
			aria-label={t(buttonLabel, { version: t(version.title) })}
			onclick={() => {
				if (!on) onchoose(version.id);
			}}
		>
			<span class="version-value"
				>{#each versions as v (v.id)}<span aria-hidden="true" class:hidden={v.id !== version.id}
						>{t(v.value)}</span
					>{/each}</span
			>

			<ChevronDown size={16} aria-hidden="true" />
		</button>
	</div>
</div>
<div
	id={menuId}
	class="menu version-menu bu-popover-anchor"
	data-placement="bottom-end"
	popover
	role="menu"
	aria-label={t(menuLabel)}
	tabindex={-1}
	bind:this={menu}
	ontoggle={popoverFocus}
	onkeydown={(event) => navigateMenu(event.currentTarget, event)}
>
	<PopoverArrow />
	<div class="menu-surface bu-popover-surface bu-floating">
		<p class="menu-sec">{t('export.settings.version')}</p>
		{#each versions as v (v.id)}
			<button
				type="button"
				class="row version-row"
				role="menuitemradio"
				aria-checked={current === v.id}
				onclick={() => {
					onchoose(v.id);
					menu?.hidePopover();
				}}
			>
				<span class="version-check" aria-hidden="true"
					>{#if current === v.id}<Check size={16} />{/if}</span
				>
				<span class="version-text"
					><span class="version-title">{t(v.title)}</span><span class="version-sub">{t(v.sub)}</span
					></span
				>
			</button>
		{/each}
	</div>
</div>

<style>
	/* the card body selects; the version button beside it (below it on narrow cards) selects and opens the menu */
	.export-split {
		container-type: inline-size;
		min-width: 0;
	}
	.split-card {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		height: 100%;
		box-sizing: border-box;
		border: 1px solid var(--line-strong);
		border-radius: var(--r-card);
		background: var(--bg);
	}
	.split-card.on {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
		background: var(--accent-soft);
	}
	.split-card :global(.export-target),
	.split-card :global(.export-target:has(input:checked)) {
		position: relative;
		grid-template-columns: 28px minmax(0, 1fr);
		border: 0;
		box-shadow: none;
		background: transparent;
	}
	/* the radio stays the real control: invisible, covering the card body, so any tap on the body checks it */
	.split-card :global(.export-target input) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.version-btn {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 4px;
		min-width: 44px;
		padding: 0 10px 0 12px;
		border: 0;
		border-left: 1px solid var(--line-strong);
		border-radius: 0 var(--r-card) var(--r-card) 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: var(--fs-sm);
		font-weight: 600;
		cursor: pointer;
	}
	.split-card.on .version-btn {
		border-color: color-mix(in srgb, var(--accent), transparent 45%);
	}
	.version-btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--text), transparent 94%);
	}
	/* one focus ring around the whole card, as on the other cards, whichever half has focus; keyboard focus on the version
     half also tints it, so Tab shows whether Space selects the card or opens the menu */
	.split-card:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.split-card :global(.export-target:focus-within) {
		outline: none;
	}
	.version-btn:focus-visible {
		outline: none;
		background: color-mix(in srgb, var(--accent), transparent 80%);
	}
	.version-btn:disabled {
		cursor: default;
		opacity: 0.6;
	}
	/* every value shares one cell, so the button keeps the longest value's width and never shifts */
	.version-value {
		display: grid;
	}
	.version-value > span {
		grid-area: 1 / 1;
	}
	.version-value > .hidden {
		visibility: hidden;
	}
	@container (max-width: 220px) {
		.split-card {
			grid-template-columns: minmax(0, 1fr);
		}
		.version-btn {
			min-height: 44px;
			border-left: 0;
			border-top: 1px solid var(--line-strong);
			border-radius: 0 0 var(--r-card) var(--r-card);
		}
	}
	.version-menu {
		width: min(300px, calc(100vw - 16px));
	}
	.version-row {
		display: grid;
		grid-template-columns: 16px minmax(0, 1fr);
		align-items: center;
		width: 100%;
		text-align: left;
	}
	.version-check {
		display: inline-flex;
		color: var(--accent);
	}
	.version-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.version-title {
		font-weight: 600;
	}
	.version-sub {
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
</style>
