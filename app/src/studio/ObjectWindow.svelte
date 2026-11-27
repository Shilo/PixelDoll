<script lang="ts">
	// The View and edit window of a character, item, move or state: one fixed header (its icon, name, one status, an
	// optional scope picker such as the move, and the object's ⋮ menu), a scrolling body and one primary action in the
	// footer. The ⋮ holds the same actions as the object's own menu in its list, without View and edit.
	import type { Snippet } from 'svelte';
	import Sheet from './Sheet.svelte';
	import PopoverArrow from './PopoverArrow.svelte';
	import StatusChip from './StatusChip.svelte';
	import { popoverFocus } from './experience/focus.ts';
	import { EllipsisVertical } from './icons.ts';

	let {
		title,
		className = '',
		icon,
		kind,
		status,
		scope,
		menuLabel,
		menu,
		onmenutoggle,
		footer,
		developer,
		onclose,
		children
	}: {
		/** The object's name. */
		title: string;
		/** Type-specific hooks for the window and its tests (`item-detail`). */
		className?: string;
		/** The object's type icon, before the name. */
		icon?: Snippet;
		/** The type in words, for screen readers and the icon's tooltip. */
		kind: string;
		status?: { tone: 'warn' | 'ok' | 'neutral'; label: string; busy?: boolean };
		/** What the whole window shows (an item's move): ends the header line; a phone gives it the second row. */
		scope?: Snippet;
		menuLabel: string;
		/** The object's actions; `close` hides the menu before one runs. */
		menu?: Snippet<[close: () => void]>;
		onmenutoggle?: (open: boolean) => void;
		footer?: Snippet;
		developer?: Snippet;
		onclose: () => void;
		children: Snippet;
	} = $props();
	const menuId = $props.id();
	let popover = $state<HTMLElement>();
	const close = () => popover?.hidePopover();
	/** Tab or Shift+Tab leaves the menu, which closes; focus goes on from its trigger. (The menu role is inside, on the
	 *  object's own action list.) */
	function closeOnTab(node: HTMLElement) {
		const onkey = (event: KeyboardEvent) => {
			if (event.key === 'Tab') close();
		};
		node.addEventListener('keydown', onkey);
		return () => node.removeEventListener('keydown', onkey);
	}
</script>

<Sheet {title} className="object-window {className}" {onclose} {footer} {developer}>
	{#snippet heading()}
		<!-- Shown before the name (CSS order): the type's icon. -->
		{#if icon}<span class="window-icon" title={kind}>{@render icon()}</span>{/if}
		<span class="sr">{kind}</span>
		{#if status}<StatusChip {...status} />{/if}
		{#if scope}<div class="window-scope">{@render scope()}</div>{/if}
	{/snippet}
	{#snippet tools()}
		{#if menu}
			<button
				class="bu-action btn plain icon"
				data-variant="quiet"
				popovertarget={menuId}
				aria-haspopup="menu"
				data-trail="window.menu"
				aria-label={menuLabel}
				title={menuLabel}><EllipsisVertical size={20} aria-hidden="true" /></button
			>
		{/if}
	{/snippet}

	{@render children()}

	{#if menu}
		<div
			id={menuId}
			class="menu item-menu bu-popover-anchor"
			data-placement="bottom-end"
			popover
			bind:this={popover}
			{@attach closeOnTab}
			onfocusout={(event) => {
				// Like any menu, Tab or Shift+Tab out of it closes it, so it never covers where the keyboard went.
				const to = event.relatedTarget;
				if (
					to instanceof HTMLElement &&
					!popover?.contains(to) &&
					to.getAttribute('popovertarget') !== menuId
				)
					close();
			}}
			ontoggle={(event) => {
				onmenutoggle?.(event.newState === 'open');
				popoverFocus(event, true);
			}}
		>
			<PopoverArrow />
			<div class="menu-surface bu-popover-surface bu-floating">{@render menu(close)}</div>
		</div>
	{/if}
</Sheet>

<style>
	/* Header (only the window's own: a viewer opens inside this dialog): one line of type icon, name, one status and the
	   scope picker. The name truncates first; its heading keeps the full name. It starts at the edge (an identity row,
	   not a centered title) so the line has the room it needs. */
	:global(dialog.object-window > .sheet-head) {
		grid-template-columns: 0 minmax(0, 1fr) auto;
	}
	:global(dialog.object-window > .sheet-head .sheet-heading) {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		justify-content: flex-start;
		gap: 8px;
		min-width: 0;
	}
	:global(dialog.object-window > .sheet-head .sheet-heading .sheet-title) {
		flex: 0 1 auto;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.window-icon {
		order: -1;
		flex: none;
		display: grid;
		color: var(--text-2);
	}
	/* A scope with nothing to pick (one move) takes no room. */
	.window-scope:empty {
		display: none;
	}
	/* The scope picker ends the line; it keeps its width (up to 40%) while the name truncates. */
	.window-scope {
		flex: none;
		max-width: 40%;
		margin-inline-start: auto;
	}
	/* Exactly its longest choice's width (the theme's fitSelects), not the chosen one's, so the row never reflows as the
	   choice changes. */
	.window-scope :global(select) {
		inline-size: var(--bu-select-fit, auto);
		max-width: 100%;
		min-height: 32px;
		padding-block: 2px;
		font-size: var(--fs-sm);
	}
	/* A phone gives the name the whole first row beside the menu and Close; the second row holds the status and the scope
	   picker, full width at touch size. */
	@media (max-width: 480px) {
		:global(dialog.object-window > .sheet-head) {
			grid-template-columns: auto auto minmax(0, 1fr) auto;
			row-gap: 6px;
		}
		:global(dialog.object-window > .sheet-head .sheet-start) {
			display: none;
		}
		:global(dialog.object-window > .sheet-head .sheet-heading) {
			display: contents;
		}
		.window-icon {
			grid-area: 1 / 1;
		}
		:global(dialog.object-window > .sheet-head .sheet-heading .sheet-title) {
			grid-area: 1 / 2 / 2 / 4;
			justify-self: start;
			max-width: 100%;
			text-align: start;
		}
		:global(dialog.object-window > .sheet-head .sheet-end) {
			grid-area: 1 / 4;
		}
		:global(dialog.object-window > .sheet-head .window-status) {
			grid-area: 2 / 1 / 3 / 3;
			justify-self: start;
		}
		.window-scope {
			grid-area: 2 / 3 / 3 / -1;
			max-width: none;
			margin: 0;
		}
		:global(dialog.object-window > .sheet-head:not(:has(.window-status))) .window-scope {
			grid-column: 1 / -1;
		}
		.window-scope :global(select) {
			width: 100%;
			min-height: 44px;
			font-size: 16px;
		}
	}
	:global(dialog.sheet.bottom.object-window) {
		box-sizing: border-box;
		height: 100dvh;
		max-height: 100dvh;
		margin: 0;
		padding-top: env(safe-area-inset-top);
		border-radius: 0;
	}
</style>
