<script lang="ts">
	import { openSource } from '../../lib/dress/project.ts';
	import { recolor } from '../../lib/dress/dress.ts';
	import { buildPresentation, southStill, renderPresentation } from './presentation.ts';
	import Sprite from '../Sprite.svelte';
	import { doc, view, ui, store, lastProject } from '../state.svelte.ts';
	import { untrack } from 'svelte';
	import { stills, newest } from './thumbnails.svelte.ts';
	let { id, name, size = 64 }: { id: string; name: string; size?: number } = $props();
	const selected = $derived(id === doc.id);
	const look = $derived(store.projects.find((p) => p.id === id)?.look ?? '');
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
		if (!live) return;
		const at = untrack(() => look);
		newest.set(id, { look: at, reading: false });
		stills.set(id, { ...live, look: at });
	});
	$effect(() => {
		const key = id,
			at = look;
		// Only the starting character reads starting, so the others do not wait for it.
		if (selected || (key === lastProject() && starting)) return;
		if (stills.get(key)?.look === at) return;
		const last = newest.get(key);
		if (last?.reading && last.look === at) return; // already being read
		const request = { look: at, reading: true };
		newest.set(key, request);
		void openSource(key)
			.then((r) => {
				if (newest.get(key) !== request) return;
				const outfit = r.current ?? r.project.manifest.presets[0];
				stills.set(key, {
					...draw(recolor(r.project, outfit?.variants ?? {}), outfit?.items ?? {}),
					look: at
				});
			})
			.catch((error: unknown) => console.warn('Could not load character thumbnail', key, error))
			.finally(() => {
				if (newest.get(key) === request) request.reading = false;
			});
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
