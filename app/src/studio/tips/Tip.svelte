<script lang="ts">
	// One tip on screen: a small arrow callout on its control, drawn in that control's layer (inside an open dialog when
	// the control is in one). TipsHost decides which tip shows and when; this only places and announces it. It never
	// takes focus. See docs/design/onboarding.md.
	import {
		arrow,
		autoUpdate,
		computePosition,
		flip,
		hide,
		offset,
		shift,
		type Placement
	} from '@floating-ui/dom';
	import { t } from 'svelte-whisper';
	import PopoverArrow from '../PopoverArrow.svelte';
	import { Ellipsis, EllipsisVertical, Lightbulb, X } from '../icons.ts';
	import type { Side } from './catalog.svelte.ts';

	let {
		id,
		anchor,
		title,
		body,
		placement = 'bottom',
		fallbacks,
		reveal = false,
		announce = true,
		onannounce,
		ondismiss
	}: {
		id: string;
		anchor: HTMLElement;
		title: string;
		body: string;
		placement?: Side;
		fallbacks?: Side[];
		/** Keep a hover-only control (a row's ⋮) shown while the tip points at it. */
		reveal?: boolean;
		/** Read it out once it is placed: false when it was already announced this visit and only came back. */
		announce?: boolean;
		onannounce?: () => void;
		ondismiss: () => void;
	} = $props();

	// The names of controls and key words are marked **like this** in the copy and shown in bold; {more} and {menu}
	// stand for the More options (⋯) and row menu (⋮) icons and are drawn as those icons.
	const parts = $derived(body.split(/\*\*(.+?)\*\*/));
	const plain = $derived(parts.join('').replace(/\{(?:more|menu)\}\s?/g, ''));

	let tip = $state<HTMLElement>();
	let announced = $state(false);

	/** Draw in the anchor's layer: an open modal dialog sits in the top layer, above anything outside it. */
	function inLayer(node: HTMLElement) {
		(anchor.closest('dialog') ?? document.body).append(node);
		// Moved out of the place Svelte rendered it, so Svelte cannot remove it on its own.
		return () => node.remove();
	}

	$effect(() => {
		if (!reveal) return;
		const el = anchor;
		el.setAttribute('data-tip-revealed', '');
		return () => el.removeAttribute('data-tip-revealed');
	});

	const opposite = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' } as const;
	$effect(() => {
		const el = anchor;
		if (!tip) return;
		const floating = tip;
		const pointer = floating.querySelector<HTMLElement>(':scope > .bu-popover-arrow')!;
		const across: Placement[] =
			placement === 'bottom' || placement === 'top' ? ['right', 'left'] : ['bottom', 'top'];
		const order: Placement[] = fallbacks ?? [opposite[placement], ...across];
		let sequence = 0;
		const place = () => {
			const current = ++sequence;
			void computePosition(el, floating, {
				strategy: 'fixed',
				placement,
				middleware: [
					offset(12),
					flip({ padding: 8, fallbackPlacements: order }),
					shift({ padding: 8 }),
					arrow({ element: pointer, padding: 14 }),
					hide()
				]
			}).then(({ x, y, placement: side, middlewareData }) => {
				if (current !== sequence) return;
				floating.style.left = `${x}px`;
				floating.style.top = `${y}px`;
				floating.dataset.side = side;
				const point = middlewareData.arrow;
				floating.style.setProperty('--bu-arrow-x', point?.x == null ? '' : `${point.x}px`);
				floating.style.setProperty('--bu-arrow-y', point?.y == null ? '' : `${point.y}px`);
				// A control scrolled or clipped out of view: the tip waits rather than point at nothing.
				const away = !!middlewareData.hide?.referenceHidden;
				floating.toggleAttribute('data-away', away);
				floating.dataset.positioned = '';
				if (!away && !announced) {
					announced = true;
					onannounce?.();
				}
			});
		};
		const stop = autoUpdate(el, floating, place, { layoutShift: true });
		return () => {
			sequence++;
			stop();
			delete floating.dataset.positioned;
		};
	});

	// The tip is drawn at the end of its layer, so its X leaves the natural tab order and is placed by hand right after
	// the control: Tab from the control reaches it, Tab from it carries on after the control, and Shift+Tab walks back
	// the same way.
	let close = $state<HTMLButtonElement>();
	const tabbable =
		'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]';
	function after(el: HTMLElement) {
		const scope = el.closest('dialog') ?? document;
		const all = [...scope.querySelectorAll<HTMLElement>(tabbable)].filter(
			(n) => n.tabIndex >= 0 && !n.closest('[inert], .tip-layer') && n.checkVisibility() && n !== el
		);
		return all.find((n) => el.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING);
	}
	$effect(() => {
		const el = anchor;
		const button = close;
		if (!button) return;
		const fromControl = (event: KeyboardEvent) => {
			if (event.key !== 'Tab') return;
			const into = event.shiftKey
				? document.activeElement === after(el)
				: document.activeElement === el;
			if (!into) return;
			event.preventDefault();
			button.focus();
		};
		addEventListener('keydown', fromControl, true);
		return () => removeEventListener('keydown', fromControl, true);
	});
	function closeKeys(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const next = event.shiftKey ? anchor : after(anchor);
		// Past the last control, Tab leaves the page as usual.
		if (!next) return;
		event.preventDefault();
		next.focus();
	}

	const titleId = $props.id();
	/** Closing by keyboard hands focus to the control the tip was about rather than dropping it on the page. */
	function dismiss() {
		const next = tip?.contains(document.activeElement) ? anchor : null;
		ondismiss();
		next?.focus({ preventScroll: true });
	}
</script>

{#snippet text(
	copy: string
)}{#each copy.split(/(\{more\}|\{menu\})/) as piece, index (index)}{#if piece === '{more}'}<Ellipsis
				class="tip-glyph"
				size={14}
				aria-hidden="true"
			/>{:else if piece === '{menu}'}<EllipsisVertical
				class="tip-glyph"
				size={14}
				aria-hidden="true"
			/>{:else}{piece}{/if}{/each}{/snippet}

<div class="tip-layer" {@attach inLayer}>
	<p class="sr" role="status">{announce && announced ? `${title}. ${plain}` : ''}</p>
	<!-- Not a popover: the app reads an open popover as an open menu and pauses stage keys and zoom for it. -->
	<section
		bind:this={tip}
		class="tip bu-popover-anchor"
		data-tone="accent"
		aria-labelledby={titleId}
		data-tip={id}
	>
		<PopoverArrow />
		<div class="tip-surface bu-popover-surface bu-floating">
			<span class="tip-icon" aria-hidden="true"><Lightbulb size={18} /></span>
			<div class="tip-copy">
				<h2 id={titleId}>{title}</h2>
				<p>
					{#each parts as part, index (index)}{#if index % 2}<strong>{@render text(part)}</strong
							>{:else}{@render text(part)}{/if}{/each}
				</p>
			</div>
			<button
				type="button"
				class="bu-action tip-close"
				bind:this={close}
				tabindex="-1"
				onkeydown={closeKeys}
				data-variant="quiet"
				aria-label={t('tips.close')}
				title={t('tips.close')}
				onclick={dismiss}><X size={16} aria-hidden="true" /></button
			>
		</div>
	</section>
</div>

<style>
	/* Out of the page flow and above the app, below the top layer (open dialogs and menus). */
	.tip-layer {
		position: fixed;
		inset: 0 auto auto 0;
		width: 0;
		height: 0;
		z-index: 31;
	}
	.tip {
		position: fixed;
		inset: 0 auto auto 0;
		width: min(288px, calc(100vw - 16px));
		margin: 0;
	}
	.tip:not(:global([data-positioned])),
	.tip:global([data-away]) {
		visibility: hidden;
	}
	.tip-surface {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 4px 12px 14px;
	}
	.tip-icon {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		margin-top: 1px;
		border-radius: 50%;
		color: var(--bu-accent);
		background: color-mix(in srgb, var(--bu-accent) 14%, transparent);
	}
	.tip-copy {
		flex: 1;
		min-width: 0;
	}
	h2 {
		margin: 0 0 2px;
		font-size: var(--fs-md);
		line-height: 1.3;
		font-weight: 600;
		text-wrap: balance;
	}
	:global(.tip-glyph) {
		display: inline-block;
		vertical-align: -2px;
	}
	strong {
		font-weight: 600;
		color: var(--bu-text);
	}
	p {
		margin: 0;
		font-size: var(--fs-sm);
		line-height: 1.4;
		color: var(--bu-muted);
		text-wrap: pretty;
	}
	.tip-close {
		flex: none;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		padding: 0;
		margin: -10px 0 -10px -6px;
	}
	/* A row's ⋮ shows only on hover (hoverActions.css); while a tip points at it, it stays shown. */
	@media (hover: hover) and (pointer: fine) {
		:global(
			.hover-actions:not(:hover):not(:has(:focus-visible))
				> .hover-actions-button[data-tip-revealed]:not([aria-expanded='true'])
		) {
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: no-preference) {
		.tip:global([data-positioned]) {
			animation: tip-in 180ms ease-out;
		}
	}
	@keyframes tip-in {
		from {
			opacity: 0;
		}
	}
</style>
