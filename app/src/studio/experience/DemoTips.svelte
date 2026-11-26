<script lang="ts">
	// The demo's two tips, shown in its Customize: try on gear, then take it into your game. Mounted only there.
	import { t } from 'svelte-whisper';
	import Tip from '../tips/Tip.svelte';
	import { untrack } from 'svelte';
	import { tips } from '../tips/tips.svelte.ts';
	import { doc, ui } from '../state.svelte.ts';
	import { experience } from './state.svelte.ts';

	let {
		show,
		tryable
	}: {
		/** The app's own gate: a newcomer, or tips asked for again. */
		show: boolean;
		/** Items with frames for the move on screen: putting one on shows it at once. */
		tryable: ReadonlySet<string>;
	} = $props();

	// Live views are a game with their own on-screen controls, and a zoomed scene is being inspected: tips wait for
	// Preview at its normal fit, with no sheet open.
	const calm = $derived(
		show && !ui.sheet && experience.mode === 'preview' && experience.sceneZoom === null
	);

	const outfit = () =>
		JSON.stringify(
			Object.entries(doc.items)
				.filter(([, id]) => id)
				.sort()
		);
	// Trying gear on is the action the first tip asks for: any change from the outfit worn on arrival (or when tips were
	// asked for again) completes it, shown or not.
	let entered = $state(outfit());
	$effect(() => {
		void tips.request;
		entered = untrack(outfit);
	});
	const triedOn = $derived(outfit() !== entered);

	/** Whole in its list, so the arrow lands on it rather than on a clipped edge. */
	const whole = (el: HTMLElement) => {
		const r = el.getBoundingClientRect();
		const box = el.closest('.equipment-scroll')?.getBoundingClientRect();
		return r.height > 0 && (!box || (r.top >= box.top && r.bottom <= box.bottom));
	};
	/** The clearest thing to try on: an item not worn yet (one with frames for the move on screen first), else a worn
	 *  one, which can come off, else an Empty tile. Only whole tiles, so the arrow lands on the tile itself. */
	function gearAnchor() {
		const panel = document.getElementById('customization-panel');
		if (!panel) return null;
		const items = [...panel.querySelectorAll<HTMLElement>('[data-tile]')].filter(
			(tile) => !tile.dataset.tile!.startsWith('gen:') && whole(tile)
		);
		const worn = (tile: HTMLElement) => tile.getAttribute('aria-pressed') === 'true';
		const ready = (tile: HTMLElement) => tryable.has(tile.dataset.tile!);
		return (
			items.find((tile) => !worn(tile) && ready(tile)) ??
			items.find((tile) => !worn(tile)) ??
			items.find(ready) ??
			items[0] ??
			[...panel.querySelectorAll<HTMLElement>('.bu-tile[data-variant="empty"]')].find(whole) ??
			null
		);
	}
	/** Export in the top bar, or More once the bar has moved Export into it (Toolbar.svelte fitting). */
	let inMore = $state(false);
	function exportAnchor() {
		const header = document.querySelector('.experience-header');
		const button = header?.querySelector<HTMLElement>('.header-export');
		inMore = !button?.checkVisibility();
		return inMore
			? (header?.querySelector<HTMLElement>('[popovertarget="experience-options"]') ?? null)
			: button!;
	}
</script>

<Tip
	id="gear"
	when={calm && ui.tab === 'wardrobe'}
	doneWhen={triedOn}
	anchor={gearAnchor}
	title={t('tips.gearTitle')}
	body={t('tips.gearBody')}
	placement="top"
/>
<Tip
	id="export"
	when={calm}
	after={['gear']}
	doneWhen={ui.sheet === 'export'}
	anchor={exportAnchor}
	title={t('tips.exportTitle')}
	body={t(inMore ? 'tips.exportInMoreBody' : 'tips.exportBody')}
/>
