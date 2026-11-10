<script lang="ts">
	import { openSource } from '../../lib/dress/project.ts';
	import { recolor } from '../../lib/dress/dress.ts';
	import { buildPresentation, southStill, renderPresentation } from './presentation.ts';
	import type { Project, Preset } from '../../lib/store/manifest.ts';
	import Sprite from '../Sprite.svelte';
	import { doc, view, ui, lastProject } from '../state.svelte.ts';
	let { id, name, size = 64 }: { id: string; name: string; size?: number } = $props();
	let project = $state.raw<Project | null>(null);
	let items = $state<Preset['items']>({});
	const selected = $derived(id === doc.id);
	// Before any character is open, the Studio is opening the last one: its thumbnail waits for that live project instead of
	// decoding the same character again alongside it.
	const starting = $derived(!doc.id && doc.loading);
	$effect(() => {
		const key = id;
		project = null;
		items = {};
		// The selected character already uses the live project below. Only the starting character reads starting, so the others
		// do not reload when it flips.
		if (selected || (key === lastProject() && starting)) return;
		const controller = new AbortController();
		void openSource(key, controller.signal)
			.then((r) => {
				if (controller.signal.aborted) return;
				const outfit = r.current ?? r.project.manifest.presets[0];
				project = recolor(r.project, outfit?.variants ?? {});
				items = outfit?.items ?? {};
			})
			.catch((error: unknown) => {
				if (!controller.signal.aborted)
					console.warn('Could not load character thumbnail', key, error);
			});
		return () => controller.abort();
	});
	const p = $derived(selected ? view.project : project);
	const outfit = $derived(selected ? doc.items : items);
	const assets = $derived(p ? buildPresentation(p) : null);
	const rendered = $derived(assets ? renderPresentation(assets, outfit, southStill(assets)) : null);
	const frame = $derived(rendered?.frame);
	const img = $derived(rendered?.image ?? null);
</script>

<span class="character-thumbnail" aria-hidden="true"
	><Sprite
		{img}
		k={Math.max(1, Math.floor((size / (frame?.h ?? 64)) * ui.dpr))}
		limit={size}
		label={name}
	/></span
>
