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
	let announced = $state<DemoTip | null>(null);

	const visibleIn = (el: HTMLElement) => {
		const r = el.getBoundingClientRect();
		const box = el.closest('.equipment-scroll')?.getBoundingClientRect() ?? {
			top: 0,
			bottom: innerHeight
		};
		return r.height > 0 && r.top >= box.top && r.bottom <= box.bottom;
	};
	/** The first fully visible tile of a complete item, preferring one not worn yet; on a screen too short to show one
	 *  whole, the list itself. */
	function gearAnchor() {
		const tiles = [
			...document.querySelectorAll<HTMLElement>('#customization-panel [data-tile]')
		].filter((tile) => complete.has(tile.dataset.tile!) && visibleIn(tile));
		return (
			tiles.find((tile) => tile.getAttribute('aria-pressed') === 'false') ??
			tiles[0] ??
			document.querySelector<HTMLElement>('#customization-panel .equipment-scroll')
		);
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
			anchor = ui.tab === 'wardrobe' && panelOpen ? gearAnchor() : null;
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
	$effect(() => {
		const root = document.querySelector('.experience');
		if (!root) return;
		const observer = new MutationObserver(resolve);
		observer.observe(root, { attributes: true, attributeFilter: ['data-overflow'] });
		return () => observer.disconnect();
	});

	// Live views are a game with their own on-screen controls: the tips wait for Preview.
	const shown = $derived(!!anchor && !ui.sheet && experience.mode === 'preview');
	/** The open part of the scene: below the top bar and view switch, above the Preview controls, beside the panel.
	 *  Tips stay inside it so they never cover a control or the panel's gear. */
	function openScene() {
		const stage = document.querySelector('.experience-stage')?.getBoundingClientRect();
		if (!stage) return;
		const below = (selector: string) =>
			document.querySelector(selector)?.getBoundingClientRect().bottom ?? 0;
		const top = Math.max(
			stage.top,
			below('.experience-header'),
			below('.view-modes'),
			below('.scene-zoom')
		);
		const bar = document.querySelector('.playback-bar')?.getBoundingClientRect();
		const bottom = bar?.height ? Math.min(stage.bottom, bar.top) : stage.bottom;
		return { x: stage.left, y: top, width: stage.width, height: Math.max(0, bottom - top) };
	}
	/** Beside a docked panel the gear tip points at its tile from the panel's edge, level with it. Over a bottom sheet
	 *  there is no room beside the gear, so it waits at the top of the scene instead. Export is pointed at directly. */
	function reference(el: HTMLElement): { target: Element | VirtualElement; placement: Placement } {
		const rail = step === 'gear' ? el.closest<HTMLElement>('.equipment-rail') : null;
		if (!rail) return { target: el, placement: 'bottom-end' };
		const rect = () => {
			const tile = el.getBoundingClientRect(),
				edge = rail.getBoundingClientRect(),
				scene = openScene();
			if (dock !== 'bottom')
				return new DOMRect(dock === 'left' ? edge.right : edge.left, tile.y, 0, tile.height);
			return scene
				? new DOMRect(scene.x, scene.y, scene.width, 0)
				: new DOMRect(0, 0, innerWidth, 0);
		};
		return {
			target: { contextElement: el, getBoundingClientRect: rect },
			placement: dock === 'bottom' ? 'bottom' : dock === 'left' ? 'right' : 'left'
		};
	}
	$effect(() => {
		const el = anchor;
		// Zooming shows the zoom controls, which the open scene then starts below.
		void (experience.sceneZoom === null);
		if (!shown || !el) return;
		const { target, placement } = reference(el);
		const pointer = tip.querySelector<HTMLElement>(':scope > .bu-popover-arrow')!;
		const pointless = step === 'gear' && dock === 'bottom';
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
					pointless || !point || Math.abs(point.centerOffset) > 1
				);
				// A tile scrolled out of the list hands the tip to another one (or the list); a hidden Export pauses it.
				if (step === 'gear' && !visibleIn(el)) return resolve();
				// A scene too short to hold the tip clear of every control (a phone held sideways) gets no tip.
				const fits =
					!scene || (y >= scene.y - 1 && y + tip.offsetHeight <= scene.y + scene.height + 1);
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
			onclick={ondismiss}><X size={16} aria-hidden="true" /></button
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
