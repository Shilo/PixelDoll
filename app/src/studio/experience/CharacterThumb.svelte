<script module lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import type { Img } from '../../lib/image/png.ts';
	import type { Frame } from '../../lib/compose/compose.ts';
	// One still per character, shared by every thumbnail (cast, its reflection, the list and the name menu): stepping to
	// another character or opening the menu reuses it instead of reading and decoding the character again, so nothing blinks.
	// savedAt is the listed save time it was drawn from; a newer save redraws it in the background, keeping the old one shown.
	const stills = new SvelteMap<string, { savedAt: string; image: Img | null; frame: Frame }>();
	const reading = new Set<string>();
</script>

<script lang="ts">
	import { openSource } from '../../lib/dress/project.ts';
	import { recolor } from '../../lib/dress/dress.ts';
	import { buildPresentation, southStill, renderPresentation } from './presentation.ts';
	import Sprite from '../Sprite.svelte';
	import { doc, view, ui, store, lastProject } from '../state.svelte.ts';
	import { untrack } from 'svelte';
	let { id, name, size = 64 }: { id: string; name: string; size?: number } = $props();
	const selected = $derived(id === doc.id);
	const savedAt = $derived(store.projects.find((p) => p.id === id)?.savedAt ?? '');
	// Before any character is open, the Studio is opening the last one: its thumbnail waits for that live project instead of
	// decoding the same character again alongside it.
	const starting = $derived(!doc.id && doc.loading);
	const draw = (project: Parameters<typeof buildPresentation>[0], items: typeof doc.items) => {
		const assets = buildPresentation(project);
		const { image, frame } = renderPresentation(assets, items, southStill(assets));
		return { image, frame };
	};
	// The selected character follows live edits, and its last look is what it keeps once another one is selected.
	const live = $derived(selected && view.project ? draw(view.project, doc.items) : null);
	$effect(() => {
		if (live) stills.set(id, { ...live, savedAt: untrack(() => savedAt) });
	});
	$effect(() => {
		const key = id,
			at = savedAt;
		// Only the starting character reads starting, so the others do not wait for it.
		if (selected || (key === lastProject() && starting)) return;
		const known = stills.get(key);
		const job = `${key}|${at}`;
		if (known?.savedAt === at || reading.has(job)) return;
		reading.add(job);
		void openSource(key)
			.then((r) => {
				// A live look stored meanwhile is newer than this read.
				if (stills.get(key) !== known) return;
				const outfit = r.current ?? r.project.manifest.presets[0];
				stills.set(key, {
					...draw(recolor(r.project, outfit?.variants ?? {}), outfit?.items ?? {}),
					savedAt: at
				});
			})
			.catch((error: unknown) => console.warn('Could not load character thumbnail', key, error))
			.finally(() => reading.delete(job));
	});
	const shown = $derived(live ?? stills.get(id) ?? null);
</script>

<span class="character-thumbnail" aria-hidden="true"
	><Sprite
		img={shown?.image ?? null}
		k={Math.max(1, Math.floor((size / (shown?.frame.h ?? 64)) * ui.dpr))}
		limit={size}
		label={name}
	/></span
>
