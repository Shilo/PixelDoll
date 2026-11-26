<script lang="ts">
	import {
		arrow,
		autoUpdate,
		computePosition,
		flip,
		hide,
		offset,
		shift,
		type Placement,
		type VirtualElement
	} from '@floating-ui/dom';
	import { t } from 'svelte-whisper';
	import PopoverArrow from '../PopoverArrow.svelte';
	import { Lightbulb, X } from '../icons.ts';
	import { doc, ui } from '../state.svelte.ts';
	import { experience } from './state.svelte.ts';
	import type { DemoTip } from './demoTips.svelte.ts';

	let {
		step,
		dock,
		panelOpen,
		complete,
		ondismiss
	}: {
		step: DemoTip;
		dock: 'left' | 'right' | 'bottom';
		panelOpen: boolean;
		/** Items with frames in every move: a tip never suggests one that would vanish or warn. */
		complete: ReadonlySet<string>;
		ondismiss: () => void;
	} = $props();

	let tip: HTMLElement;
	let anchor = $state.raw<HTMLElement | null>(null);
	let inMore = $state(false);
	/** Pointing at the whole list (no whole tile in view): the arrow would point at nothing in particular. */
	let atList = false;
	let announced = $state<DemoTip | null>(null);

	const visibleIn = (el: HTMLElement) => {
		const r = el.getBoundingClientRect();
		const box = el.closest('.equipment-scroll')?.getBoundingClientRect() ?? {
			top: 0,
			bottom: innerHeight
		};
		return r.height > 0 && r.top >= box.top && r.bottom <= box.bottom;
	};
	/** The first fully visible tile of a complete item, preferring one not worn yet; when none is whole in view, the
	 *  list itself; when the list shows none at all (a search with no match), nothing. */
	function gearAnchor() {
		const tiles = [
			...document.querySelectorAll<HTMLElement>('#customization-panel [data-tile]')
		].filter((tile) => complete.has(tile.dataset.tile!));
		const whole = tiles.filter(visibleIn);
		const tile = whole.find((el) => el.getAttribute('aria-pressed') === 'false') ?? whole[0];
		atList = !tile;
		if (tile) return tile;
		return tiles.length
			? document.querySelector<HTMLElement>('#customization-panel .equipment-scroll')
			: null;
	}
	/** Export in the top bar, or More once the bar has moved Export into it (Toolbar.svelte fitting). */
	function exportAnchor() {
		const header = document.querySelector('.experience-header');
		const button = header?.querySelector<HTMLElement>('.header-export');
		if (button?.checkVisibility()) return { el: button, more: false };
		const more = header?.querySelector<HTMLElement>('[popovertarget="experience-options"]');
		return { el: more ?? null, more: true };
	}
	function resolve() {
		if (step === 'gear') {
			// Over a bottom sheet there is no room beside the gear that keeps the character clear: the Characters note
			// already says to try gear on, so this tip only shows beside a docked panel.
			anchor = ui.tab === 'wardrobe' && panelOpen && dock !== 'bottom' ? gearAnchor() : null;
			inMore = false;
		} else {
			const found = exportAnchor();
			anchor = found.el;
			inMore = found.more;
		}
	}
	// Find the anchor again whenever what is on screen may have changed it.
	$effect(() => {
		void [step, ui.tab, panelOpen, doc.items, experience.mode, dock, complete];
		const frame = requestAnimationFrame(resolve);
		return () => cancelAnimationFrame(frame);
	});
	// Scrolling the Wardrobe can bring a whole tile back into view, or take the pointed one out.
	$effect(() => {
		if (step !== 'gear') return;
		let frame = 0;
		const scrolled = (event: Event) => {
			if (!(event.target instanceof Element) || !event.target.matches('.equipment-scroll')) return;
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(resolve);
		};
		document.addEventListener('scroll', scrolled, true);
		return () => {
			cancelAnimationFrame(frame);
			document.removeEventListener('scroll', scrolled, true);
		};
	});
	$effect(() => {
		const root = document.querySelector('.experience');
		if (!root) return;
		const observer = new MutationObserver(resolve);
		observer.observe(root, { attributes: true, attributeFilter: ['data-overflow'] });
		return () => observer.disconnect();
	});

	// Live views are a game with their own on-screen controls, and a zoomed scene is being inspected: tips wait for
	// Preview at its normal fit.
	const shown = $derived(
		!!anchor && !ui.sheet && experience.mode === 'preview' && experience.sceneZoom === null
	);
	/** The open part of the scene: below the top bar and view switch, above the Preview controls, beside the panel.
	 *  Tips stay inside it so they never cover a control or the panel's gear. */
	function openScene() {
		const stage = document.querySelector('.experience-stage')?.getBoundingClientRect();
		if (!stage) return;
		const below = (selector: string) =>
			document.querySelector(selector)?.getBoundingClientRect().bottom ?? 0;
		const top = Math.max(stage.top, below('.experience-header'), below('.view-modes'));
		const bar = document.querySelector('.playback-bar')?.getBoundingClientRect();
		const bottom = bar?.height ? Math.min(stage.bottom, bar.top) : stage.bottom;
		return { x: stage.left, y: top, width: stage.width, height: Math.max(0, bottom - top) };
	}
	/** The gear tip points at its tile from the docked panel's edge, level with it; Export is pointed at directly. */
	function reference(el: HTMLElement): { target: Element | VirtualElement; placement: Placement } {
		const rail = step === 'gear' ? el.closest<HTMLElement>('.equipment-rail') : null;
		if (!rail) return { target: el, placement: 'bottom-end' };
		const rect = () => {
			const tile = el.getBoundingClientRect(),
				edge = rail.getBoundingClientRect();
			return new DOMRect(dock === 'left' ? edge.right : edge.left, tile.y, 0, tile.height);
		};
		return {
			target: { contextElement: el, getBoundingClientRect: rect },
			placement: dock === 'left' ? 'right' : 'left'
		};
	}
	$effect(() => {
		const el = anchor;
		if (!shown || !el) return;
		const { target, placement } = reference(el);
		const pointer = tip.querySelector<HTMLElement>(':scope > .bu-popover-arrow')!;
		let sequence = 0;
		const place = () => {
			const current = ++sequence;
			const scene = openScene();
			const bounds = scene ? { boundary: scene } : {};
			void computePosition(target, tip, {
				strategy: 'fixed',
				placement,
				middleware: [
					// Clear of the view switch even when the control it points at sits above it.
					offset(({ rects }) =>
						Math.max(10, scene ? scene.y + 8 - rects.reference.y - rects.reference.height : 0)
					),
					flip({ padding: 8, ...bounds }),
					shift({ padding: 8, ...bounds }),
					arrow({ element: pointer, padding: 14 }),
					hide()
				]
			}).then(({ x, y, placement: side, middlewareData }) => {
				if (current !== sequence) return;
				tip.style.left = `${x}px`;
				tip.style.top = `${y}px`;
				tip.dataset.side = side.split('-')[0];
				const point = middlewareData.arrow;
				tip.style.setProperty('--bu-arrow-x', point?.x === undefined ? '' : `${point.x}px`);
				tip.style.setProperty('--bu-arrow-y', point?.y === undefined ? '' : `${point.y}px`);
				// Kept inside the open scene, a tip may no longer line up with its control: drop the arrow then.
				tip.toggleAttribute(
					'data-arrow-hidden',
					atList || !point || Math.abs(point.centerOffset) > 1
				);
				// A tile scrolled out of the list hands the tip to another one (or the list); a hidden Export pauses it.
				if (step === 'gear' && !visibleIn(el)) return resolve();
				// A scene too short to hold the tip clear of every control (a phone held sideways) gets no tip. Over a
				// bottom sheet the character stands mid-scene, so the tip needs room for both above it.
				const height = tip.offsetHeight;
				const fits =
					!scene ||
					(y >= scene.y - 1 &&
						y + height <= scene.y + scene.height + 1 &&
						(dock !== 'bottom' || scene.height >= 3 * height));
				const away = !fits || (step === 'export' && !!middlewareData.hide?.referenceHidden);
				tip.toggleAttribute('data-away', away);
				tip.dataset.positioned = '';
				if (!away) announced = step;
			});
		};
		const stop = autoUpdate(target, tip, place, { layoutShift: true });
		return () => {
			sequence++;
			stop();
			delete tip.dataset.positioned;
		};
	});

	const title = $derived(t(step === 'gear' ? 'demoTips.gearTitle' : 'demoTips.exportTitle'));
	const body = $derived(
		t(
			step === 'gear'
				? 'demoTips.gearBody'
				: inMore
					? 'demoTips.exportInMoreBody'
					: 'demoTips.exportBody'
		)
	);
	const titleId = $props.id();
	/** Closing by keyboard hands focus to what the tip was about rather than dropping it on the page. */
	function dismiss() {
		const next = tip.contains(document.activeElement)
			? step === 'gear'
				? document.getElementById('customization-tab-wardrobe')
				: anchor
			: null;
		ondismiss();
		next?.focus({ preventScroll: true });
	}
</script>

<p class="sr" role="status">{announced === step ? `${title}. ${body}` : ''}</p>
<!-- Not a popover: the app reads an open popover as an open menu and pauses stage keys and zoom for it. -->
<section bind:this={tip} class="demo-tip bu-popover-anchor" aria-labelledby={titleId}>
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
			aria-label={t('demoTips.dismiss')}
			title={t('demoTips.dismiss')}
			onclick={dismiss}><X size={16} aria-hidden="true" /></button
		>
	</div>
</section>

<style>
	.demo-tip {
		z-index: 7;
		width: min(288px, calc(100vw - 16px));
	}
	.demo-tip:not(:global([data-positioned])),
	.demo-tip:global([data-away]) {
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
		.demo-tip:global([data-positioned]) {
			animation: tip-in 180ms ease-out;
		}
	}
	@keyframes tip-in {
		from {
			opacity: 0;
			translate: 0 4px;
		}
	}
</style>
