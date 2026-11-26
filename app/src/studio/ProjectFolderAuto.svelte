<script lang="ts">
	// Renders nothing: watches the open character and, when it has a linked folder with automatic updates, republishes a
	// moment after each change. Mounted only in browsers that can write folders.
	import { untrack } from 'svelte';
	import { subscribeExportSettings } from '../lib/store/export-settings.ts';
	import {
		folderFallsBehind,
		loadFolderLink,
		projectFolder,
		scheduleFolderPublish
	} from './projectFolder.svelte.ts';
	import { doc, store } from './state.svelte.ts';
	import { experience } from './experience/state.svelte.ts';

	$effect(() => {
		const id = doc.id;
		if (doc.loading || !id) return;
		untrack(() => void loadFolderLink(id));
	});

	// Coming back to this tab reads the link again: another tab may have linked, replaced or stopped it meanwhile.
	$effect(() => {
		const refresh = () => {
			if (document.visibilityState === 'visible' && doc.id && !doc.loading)
				void loadFolderLink(doc.id);
		};
		document.addEventListener('visibilitychange', refresh);
		return () => document.removeEventListener('visibilitychange', refresh);
	});

	// Only whether the open character publishes automatically: a publish that records its timestamp replaces the link
	// object, and that alone must not start another publish.
	const automatic = $derived(
		!!projectFolder.link?.auto && projectFolder.link.characterId === doc.id
	);

	let wasAutomatic = false;
	$effect(() => {
		// Anything an export reads: the saved character, its record and the worn look.
		void store.project;
		void store.exportRecord;
		void JSON.stringify(doc.items);
		void JSON.stringify(doc.variants);
		// The live views' waist and clip choices shape moving-attack fragments.
		void JSON.stringify(experience.liveRoles[doc.id]);
		void JSON.stringify(experience.liveLayering[doc.id]);
		const on = automatic;
		// Turning automatic updates off changes nothing in the folder, so only a real change leaves it behind.
		const turnedOff = wasAutomatic && !on;
		wasAutomatic = on;
		if (doc.loading) return;
		if (on) untrack(scheduleFolderPublish);
		else if (!turnedOff) untrack(folderFallsBehind);
	});

	// A settings change changes the export too: it republishes, or with automatic updates off leaves the folder behind.
	$effect(() =>
		subscribeExportSettings(() => {
			scheduleFolderPublish();
			folderFallsBehind();
		})
	);
</script>
