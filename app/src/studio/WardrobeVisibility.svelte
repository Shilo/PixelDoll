<script lang="ts">
	import { LayoutTemplate, Lock, UserRound, UsersRound } from './icons.ts';
	import { DEMO_NAME, isDemo, refreshShared, store, toast } from './state.svelte.ts';
	import {
		demoItemsShown,
		setDemoItemsShown,
		setSharedItemsHiddenForAll,
		setSharedItemsHiddenForCharacter,
		sharedItemsHidden,
		sharedItemsHiddenForAll
	} from './wardrobeVisibility.svelte.ts';

	let { current }: { current?: { id: string; name: string } } = $props();
	const headingId = $props.id();
	const hideAll = $derived(sharedItemsHiddenForAll());
	const lockReason = $derived(hideAll ? ' (All characters is on)' : '');

	function reportSave(saved: boolean) {
		if (!saved)
			toast('Visibility changed, but this browser could not save it.', { tone: 'warning' });
	}
</script>

<div role="group" aria-labelledby={headingId}>
	<p class="menu-sec" id={headingId}>Hide shared items</p>
	<label class="row bu-check">
		<UsersRound size={18} aria-hidden="true" />
		<span class="row-name">All characters</span>
		<input
			class="bu-switch"
			type="checkbox"
			role="switch"
			aria-label="Hide shared items for all characters"
			checked={hideAll}
			onchange={(event) => reportSave(setSharedItemsHiddenForAll(event.currentTarget.checked))}
		/>
	</label>
	<label class="row bu-check">
		<LayoutTemplate size={18} aria-hidden="true" />
		<span class="row-name wardrobe-character">
			<span class="wardrobe-character-name">{DEMO_NAME}</span><span class="faint small">(Demo)</span
			>
		</span>
		{#if hideAll}<Lock size={14} class="faint" aria-hidden="true" />{/if}
		<input
			class="bu-switch"
			type="checkbox"
			role="switch"
			aria-label={`Hide shared items from ${DEMO_NAME} (Demo)${lockReason}`}
			checked={hideAll || !demoItemsShown()}
			disabled={hideAll}
			onchange={(event) => {
				reportSave(setDemoItemsShown(!event.currentTarget.checked));
				if (store.project && !isDemo()) void refreshShared();
			}}
		/>
	</label>
	{#if current}
		{@const { id, name } = current}
		<label class="row bu-check">
			<UserRound size={18} aria-hidden="true" />
			<span class="row-name wardrobe-character">
				<span class="wardrobe-character-name">{name}</span><span class="faint small">(Current)</span
				>
			</span>
			{#if hideAll}<Lock size={14} class="faint" aria-hidden="true" />{/if}
			<input
				class="bu-switch"
				type="checkbox"
				role="switch"
				aria-label={`Hide shared items for ${name} (Current)${lockReason}`}
				checked={sharedItemsHidden(id)}
				disabled={hideAll}
				onchange={(event) =>
					reportSave(setSharedItemsHiddenForCharacter(id, event.currentTarget.checked))}
			/>
		</label>
	{/if}
</div>

<style>
	.wardrobe-character {
		display: flex;
		align-items: baseline;
		gap: 0.35em;
	}
	.wardrobe-character .small {
		flex: none;
	}
	.wardrobe-character-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
