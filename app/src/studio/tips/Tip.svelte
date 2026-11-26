<script lang="ts">
	// One tip: a small arrow callout on the control it is about. It shows while it is not done, `when` holds and the
	// anchor is on screen, at most one tip at a time, and it never takes focus. Place it in the layer of its anchor
	// (inside a sheet for a control in that sheet), just before that control so the X comes first in tab order.
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
	import { Lightbulb, X } from '../icons.ts';
	import { completeTip, tipDone, tips, type TipId } from './tips.svelte.ts';

	let {
		id,
		anchor,
		title,
		body,
		placement = 'bottom',
		when = true
	}: {
		id: TipId;
		/** Finds the control the tip points at, or null while there is none on screen. Called again whenever the page may
		 *  have changed: reactive state it reads, DOM changes, scrolling and resizing. */
		anchor: () => HTMLElement | null;
		title: string;
		body: string;
		/** The preferred side. With no room there it tries the opposite side, then the other two. */
		placement?: 'bottom' | 'top' | 'left' | 'right';
		/** The app's own condition, such as being in the right view. */
		when?: boolean;
	} = $props();

	let tip = $state<HTMLElement>();
	let target = $state.raw<HTMLElement | null>(null);
	let announced = $state(false);

	const eligible = $derived(when && !tipDone(id));
	const mine = $derived(tips.showing === null || tips.showing === id);
	const shown = $derived(eligible && mine && !!target);

	// Find the anchor: now (tracking what `anchor` reads), and after DOM changes, scrolling or resizing.
	$effect(() => {
		if (!eligible) {
			target = null;
			return;
		}
		target = anchor();
		let frame = 0;
		const later = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => (target = anchor()));
		};
		const observer = new MutationObserver(later);
		observer.observe(document.body, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ['hidden', 'aria-pressed', 'aria-selected', 'data-overflow', 'open']
		});
		addEventListener('scroll', later, true);
		addEventListener('resize', later);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			removeEventListener('scroll', later, true);
			removeEventListener('resize', later);
		};
	});
	// One tip at a time: the first to be ready holds the screen until it is done or leaves.
	$effect(() => {
		if (!eligible || !target || tips.showing) return;
		tips.showing = id;
	});
	$effect(() => () => {
		if (tips.showing === id) tips.showing = null;
	});
	$effect(() => {
		if (!(eligible && target) && tips.showing === id) tips.showing = null;
	});

	const opposite = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' } as const;
	$effect(() => {
		const el = target;
		if (!shown || !el || !tip) return;
		const floating = tip;
		const pointer = floating.querySelector<HTMLElement>(':scope > .bu-popover-arrow')!;
		const across: Placement[] =
			placement === 'bottom' || placement === 'top' ? ['right', 'left'] : ['bottom', 'top'];
		let sequence = 0;
		const place = () => {
			const current = ++sequence;
			void computePosition(el, floating, {
				strategy: 'fixed',
				placement,
				middleware: [
					offset(12),
					flip({ padding: 8, fallbackPlacements: [opposite[placement], ...across] }),
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
				if (!away) announced = true;
			});
		};
		const stop = autoUpdate(el, floating, place, { layoutShift: true });
		return () => {
			sequence++;
			stop();
			delete floating.dataset.positioned;
		};
	});

	const titleId = $props.id();
	/** Closing by keyboard hands focus to the control the tip was about rather than dropping it on the page. */
	function dismiss() {
		const next = tip?.contains(document.activeElement) ? target : null;
		completeTip(id);
		next?.focus({ preventScroll: true });
	}
</script>

{#if shown}
	<p class="sr" role="status">{announced ? `${title}. ${body}` : ''}</p>
	<!-- Not a popover: the app reads an open popover as an open menu and pauses stage keys and zoom for it. -->
	<section bind:this={tip} class="tip bu-popover-anchor" aria-labelledby={titleId} data-tip={id}>
		<PopoverArrow />
		<div class="tip-surface bu-popover-surface bu-floating">
			<span class="tip-icon" aria-hidden="true"><Lightbulb size={18} /></span>
			<div class="tip-copy">
				<h2 id={titleId}>{title}</h2>
				<p>{body}</p>
			</div>
			<button
				type="button"
				class="bu-action tip-close"
				data-variant="quiet"
				aria-label={t('tips.close')}
				title={t('tips.close')}
				onclick={dismiss}><X size={16} aria-hidden="true" /></button
			>
		</div>
	</section>
{/if}

<style>
	.tip {
		position: fixed;
		inset: 0 auto auto 0;
		z-index: 7;
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
