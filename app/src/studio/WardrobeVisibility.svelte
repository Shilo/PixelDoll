<script lang="ts">
	import { LayoutTemplate, Lock, UserRound, UsersRound } from './icons.ts';
	import { characterName, doc, isDemo, refreshShared, store, toast } from './state.svelte.ts';
	import {
		demoItemsShown,
		setDemoItemsShown,
		setSharedItemsHiddenForAll,
		setSharedItemsHiddenForCharacter,
		sharedItemsHidden,
		sharedItemsHiddenForAll
	} from './wardrobeVisibility.svelte.ts';

	const headingId = $props.id();
	const name = $derived(characterName());
	const hideAll = $derived(sharedItemsHiddenForAll());
	const hideDemo = $derived(hideAll || !demoItemsShown());
	const hideCurrent = $derived(sharedItemsHidden(doc.id));
	const lockReason = $derived(hideAll ? ' (In all wardrobes is on)' : '');

	function reportSave(saved: boolean) {
		if (!saved)
			toast('Visibility changed, but this browser could not save it.', { tone: 'warning' });
	}
</script>

<div role="group" aria-labelledby={headingId}>
	<p class="menu-sec" id={headingId}>Hide shared items</p>
	<label class="row bu-check">
		<UsersRound size={18} aria-hidden="true" />
		<span class="row-name">In <strong>all</strong> wardrobes</span>
		<input
			class="bu-switch"
			type="checkbox"
			role="switch"
			aria-label="Hide shared items in all wardrobes"
			checked={hideAll}
			defaultChecked={hideAll}
			onchange={(event) => reportSave(setSharedItemsHiddenForAll(event.currentTarget.checked))}
		/>
	</label>
	<label class="row bu-check">
		<UserRound size={18} aria-hidden="true" />
		<span class="row-name">In <strong>{name}</strong>'s wardrobe</span>
		{#if hideAll}<Lock size={14} class="faint" aria-hidden="true" />{/if}
		<input
			class="bu-switch"
			type="checkbox"
			role="switch"
			aria-label={`Hide shared items in ${name}'s wardrobe${lockReason}`}
			checked={hideCurrent}
			defaultChecked={hideCurrent}
			disabled={hideAll || !doc.id}
			onchange={(event) =>
				reportSave(setSharedItemsHiddenForCharacter(doc.id, event.currentTarget.checked))}
		/>
	</label>
	<label class="row bu-check">
		<LayoutTemplate size={18} aria-hidden="true" />
		<span class="row-name">From <strong>demo character</strong></span>
		{#if hideAll}<Lock size={14} class="faint" aria-hidden="true" />{/if}
		<input
			class="bu-switch"
			type="checkbox"
			role="switch"
			aria-label={`Hide shared items from demo character${lockReason}`}
			checked={hideDemo}
			defaultChecked={hideDemo}
			disabled={hideAll}
			onchange={(event) => {
				reportSave(setDemoItemsShown(!event.currentTarget.checked));
				if (store.project && !isDemo()) void refreshShared();
			}}
		/>
	</label>
</div>

<style>
	.row-name strong {
		font-weight: 600;
	}
</style>
