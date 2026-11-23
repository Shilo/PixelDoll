<script lang="ts">
	import { openSource } from '../../lib/dress/project.ts';
	import { recolor } from '../../lib/dress/dress.ts';
	import Sprite from '../Sprite.svelte';
	import { doc, view, ui, store, lastProject } from '../state.svelte.ts';
	import { untrack } from 'svelte';
	import {
		stills,
		newest,
		thumbBacking,
		croppedBacking,
		croppedThumbnail,
		characterStill
	} from './thumbnails.svelte.ts';
	import { castStill, mountKey, mountedStill } from './castMount.ts';
	let {
		id,
		name,
		size = 64,
		trim = false,
		mounted = false
	}: {
		id: string;
		name: string;
		size?: number;
		trim?: boolean;
		/** The selection cast: rides the test mount while it shows. */
		mounted?: boolean;
	} = $props();
	const selected = $derived(id === doc.id);
	const look = $derived(store.projects.find((p) => p.id === id)?.look ?? '');
	// Before any character is open, the Studio is opening the last one: its thumbnail waits for that live project instead of
	// decoding the same character again alongside it.
	const starting = $derived(!doc.id && doc.loading);
	// The cast's mount settings for this character; a read draws the mounted variant too while the mount shows.
	const mount = $derived(mountKey(id));
	// The selected character follows live edits, and its last look is what it keeps once another one is selected.
	const live = $derived(
		selected && view.project
			? {
					...characterStill(view.project, doc.items, doc.rev),
					mount: mount
						? { key: mount, still: mountedStill(id, view.project, doc.items, doc.rev) }
						: undefined
				}
			: null
	);
	$effect(() => {
		if (!live) return;
		const at = untrack(() => look);
		newest.set(id, { look: at, reading: false });
		stills.set(id, { ...live, look: at });
	});
	$effect(() => {
		const key = id,
			at = look,
			// Only the cast waits for a mounted variant; other thumbnails show the plain still.
			needs = mounted ? mount : '';
		// Only the starting character reads starting, so the others do not wait for it.
		if (selected || (key === lastProject() && starting)) return;
		const current = stills.get(key);
		if (current?.look === at && (!needs || current.mount?.key === needs)) return;
		const last = newest.get(key);
		// A read draws with the mount settings current when it finishes, so one running for this look suffices.
		if (last?.reading && last.look === at) return;
		const request = { look: at, reading: true };
		newest.set(key, request);
		void openSource(key)
			.then((r) => {
				if (newest.get(key) !== request) return;
				const outfit = r.current ?? r.project.manifest.presets[0];
				const project = recolor(r.project, outfit?.variants ?? {}),
					items = outfit?.items ?? {},
					// The settings now, not at the request: a change meanwhile must not label older art.
					drawn = mountKey(key);
				stills.set(key, {
					...characterStill(project, items),
					look: at,
					mount: drawn ? { key: drawn, still: mountedStill(key, project, items) } : undefined
				});
			})
			.catch((error: unknown) => console.warn('Could not load character thumbnail', key, error))
			.finally(() => {
				if (newest.get(key) === request) request.reading = false;
			});
	});
	const entry = $derived(live ?? stills.get(id));
	const shown = $derived((mounted ? castStill(id, entry) : entry) ?? null);
	const image = $derived(
		trim && shown?.image ? croppedThumbnail(shown.image) : (shown?.image ?? null)
	);
	const backing = $derived(
		trim && image
			? croppedBacking(size, image, ui.dpr)
			: thumbBacking(size, shown ?? undefined, ui.dpr)
	);
	const fitToBox = $derived(trim && !!image && (image.w > size || image.h > size));
</script>

<span
	class="character-thumbnail"
	aria-hidden="true"
	style:width={trim ? size + 'px' : undefined}
	style:height={trim ? size + 'px' : undefined}
	><Sprite img={image} k={backing} limit={size} {fitToBox} label={name} /></span
>
