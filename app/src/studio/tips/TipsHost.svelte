<script lang="ts">
	// The tips system, mounted once. It watches app state and the page, never the other way round: it records each
	// catalog tip as done when its action happens (shown or not), and shows at most one tip, the first in catalog order
	// whose context holds and whose control is whole on screen and not under another layer. See
	// docs/design/onboarding.md.
	import { untrack } from 'svelte';
	import { t } from 'svelte-whisper';
	import { doc, ui } from '../state.svelte.ts';
	import { experience } from '../experience/state.svelte.ts';
	import Tip from './Tip.svelte';
	import { catalog, outfitKey, outfitNow, visit, type TipSpec } from './catalog.svelte.ts';
	import { completeTip, tipDone, tips, tipsEnabled, TIP_IDS } from './tips.svelte.ts';
	import { coveredByLayer, fullyVisible } from './visibility.ts';

	const pending = $derived(TIP_IDS.some((id) => !tipDone(id)));

	// Arrivals on Characters, so a tip can wait for the next one.
	let screen: string | undefined;
	$effect(() => {
		const now = experience.screen;
		if (now === 'characters' && screen !== 'characters') untrack(() => visit.charactersEntry++);
		screen = now;
	});
	// When the Customize tip ends during this visit, the New character tip waits for the next arrival on Characters.
	let customizeWasDone = untrack(() => tipDone('customize'));
	$effect(() => {
		const done = tipDone('customize');
		if (done && !customizeWasDone)
			untrack(() => {
				visit.customizeDoneEntry = visit.charactersEntry;
			});
		customizeWasDone = done;
	});
	// The outfit worn when this Customize visit began, or when tips were asked for again.
	$effect(() => {
		const key = outfitKey();
		if (key && visit.outfit.key !== key)
			untrack(() => {
				visit.outfit = { key, value: outfitNow() };
			});
	});

	// Each tip is done the moment its action shows in app state: on a change to true, so tips asked for again are not
	// consumed by a state that already held (an open sheet, an existing character).
	for (const spec of catalog) {
		if (!spec.doneWhen) continue;
		const check = spec.doneWhen;
		let before: boolean | undefined;
		$effect(() => {
			const now = tipsEnabled && check();
			if (now && !before) completeTip(spec.id);
			before = now;
		});
	}
	// Using a control that means the action happened, through any route, ends its tip too.
	$effect(() => {
		if (!pending) return;
		const used = (event: Event) => {
			if (!(event.target instanceof Element)) return;
			// Placing the caret in a field is not using it: fields count when typed or pasted into.
			if (
				event.type === 'click' &&
				event.target.closest('input, textarea, select, [contenteditable]')
			)
				return;
			for (const spec of catalog)
				if (spec.doneOn && !tipDone(spec.id) && event.target.closest(spec.doneOn))
					completeTip(spec.id);
		};
		const events = ['click', 'input', 'paste'] as const;
		for (const type of events) addEventListener(type, used, true);
		return () => {
			for (const type of events) removeEventListener(type, used, true);
		};
	});

	// The page changes in ways app state does not show (layout, scrolling, menus opening): look again on the next frame.
	let page = $state(0);
	$effect(() => {
		if (!pending) return;
		let frame = 0;
		const later = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => page++);
		};
		// Script animations (the panel sliding in) fire no events: look again when each finite one ends.
		const watched = new WeakSet<Animation>();
		const settle = () => {
			for (const animation of document.getAnimations()) {
				if (watched.has(animation)) continue;
				if (!Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))) continue;
				watched.add(animation);
				animation.finished.then(later, later);
			}
		};
		const observer = new MutationObserver(() => {
			later();
			settle();
		});
		observer.observe(document.body, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: [
				'hidden',
				'inert',
				'class',
				'open',
				'aria-expanded',
				'aria-pressed',
				'aria-selected',
				'data-overflow'
			]
		});
		const events = ['scroll', 'toggle', 'transitionend'] as const;
		for (const type of events) addEventListener(type, later, true);
		addEventListener('resize', later);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			for (const type of events) removeEventListener(type, later, true);
			removeEventListener('resize', later);
		};
	});

	/** Where the person is: closing a tip keeps the others away until this changes. */
	const context = () =>
		`${experience.screen}|${experience.mode}|${ui.tab}|${ui.sheet}|${doc.id}|${tips.request}`;
	let quietIn = $state<string | null>(null);

	/** Counts arrivals on a screen and tab, so a one-per-visit tip can wait for the next one. */
	let arrival = $state(0);
	let place = '';
	$effect(() => {
		const now = `${experience.screen}|${ui.tab}|${doc.id}`;
		if (now === place) return;
		place = now;
		untrack(() => arrival++);
	});
	/** The arrival (and tips request) in which a one-per-visit tip already showed; asking for tips again starts over. */
	let spent = '';

	let shown: { spec: TipSpec; anchor: HTMLElement } | null = null;
	const current = $derived.by(() => {
		void page;
		if (!pending || quietIn === context()) return (shown = null);
		const ready: { spec: TipSpec; anchor: HTMLElement }[] = [];
		for (const spec of catalog) {
			if (tipDone(spec.id) || !(spec.after ?? []).every(tipDone) || !spec.when()) continue;
			if (spec.onePerVisit && spent === `${arrival}|${tips.request}` && shown?.spec !== spec)
				continue;
			const anchor = spec.anchor();
			if (anchor && fullyVisible(anchor, spec.reveal) && !coveredByLayer(anchor))
				ready.push({ spec, anchor });
		}
		// The tip on screen stays while it still applies; otherwise the first in catalog order shows.
		const pick = ready.find((r) => r.spec === shown?.spec) ?? ready[0] ?? null;
		// The same tip on the same control is the same value, so the tip on screen is not placed again.
		if (pick?.spec !== shown?.spec || pick?.anchor !== shown?.anchor) shown = pick;
		if (shown?.spec.onePerVisit) spent = `${arrival}|${tips.request}`;
		return shown;
	});
	$effect(() => {
		if (quietIn !== null && quietIn !== context()) quietIn = null;
	});

	/** Tips already read out this visit: one that hides (a live view, a closed panel) and comes back stays quiet. */
	const heard = new Set<string>();
	$effect(() => {
		void tips.request;
		heard.clear();
	});
	function dismiss(spec: TipSpec) {
		quietIn = context();
		completeTip(spec.id);
	}
</script>

{#if current}
	{#key current.spec.id}
		<Tip
			id={current.spec.id}
			anchor={current.anchor}
			title={t(current.spec.title)}
			body={t(current.spec.body(current.anchor))}
			placement={current.spec.placement}
			fallbacks={current.spec.fallbacks}
			reveal={current.spec.reveal}
			announce={!heard.has(current.spec.id)}
			onannounce={() => heard.add(current.spec.id)}
			ondismiss={() => dismiss(current.spec)}
		/>
	{/key}
{/if}
