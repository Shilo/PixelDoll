<script lang="ts">
	import { t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	import { LayoutTemplate, Lock, UserRound, UsersRound } from './icons.ts';
	import { characterName, doc, isDemo, refreshShared, store, toast } from './state.svelte.ts';
	import RichMessage from './RichMessage.svelte';
	import SettingsItemToggle from './SettingsItemToggle.svelte';
	import {
		demoItemsShown,
		setDemoItemsShown,
		setSharedItemsHiddenForAll,
		setSharedItemsHiddenForCharacter,
		sharedItemsHidden,
		sharedItemsHiddenForAll
	} from './wardrobeVisibility.svelte.ts';

	const headingId = $props.id();
	let { settings = false }: { settings?: boolean } = $props();
	const lockReasonId = `${headingId}-lock-reason`;
	const name = $derived(characterName());
	const hideAll = $derived(sharedItemsHiddenForAll());
	const hideDemo = $derived(hideAll || !demoItemsShown());
	const hideCurrent = $derived(sharedItemsHidden(doc.id));

	function reportSave(saved: boolean) {
		if (!saved) toast(message('sharedVisibility.notSaved'), { tone: 'warning' });
	}
</script>

{#snippet allContent()}
	<UsersRound size={18} aria-hidden="true" />
	{#snippet emphasis()}<strong>{t('sharedVisibility.allEmphasis')}</strong>{/snippet}
	<span class="row-name"><RichMessage key="sharedVisibility.all" slots={{ all: emphasis }} /></span>
{/snippet}
{#snippet characterContent()}
	<UserRound size={18} aria-hidden="true" />
	{#snippet character()}<strong>{name}</strong>{/snippet}
	<span class="character-wardrobe-label"
		><RichMessage key="sharedVisibility.current" slots={{ name: character }} /></span
	>
	{#if hideAll}<Lock size={14} class="faint" aria-hidden="true" />{/if}
{/snippet}
{#snippet demoContent()}
	<LayoutTemplate size={18} aria-hidden="true" />
	{#snippet emphasis()}<strong>{t('sharedVisibility.demoEmphasis')}</strong>{/snippet}
	<span class="row-name"
		><RichMessage key="sharedVisibility.demo" slots={{ demo: emphasis }} /></span
	>
	{#if hideAll}<Lock size={14} class="faint" aria-hidden="true" />{/if}
{/snippet}
{#snippet wardrobeToggle(
	contents: import('svelte').Snippet,
	attributes: import('svelte/elements').HTMLInputAttributes
)}
	{#if settings}
		<SettingsItemToggle {...attributes}>{@render contents()}</SettingsItemToggle>
	{:else}
		<label class="row bu-check">
			{@render contents()}
			<input {...attributes} class="bu-switch" type="checkbox" role="switch" />
		</label>
	{/if}
{/snippet}

<div role="group" aria-labelledby={headingId}>
	{#if settings}
		<h4 class="settings-label" id={headingId}>{t('sharedVisibility.heading')}</h4>
	{:else}
		<p class="menu-sec" id={headingId}>{t('sharedVisibility.heading')}</p>
	{/if}
	{@render wardrobeToggle(allContent, {
		'aria-label': t('sharedVisibility.hideAll'),
		checked: hideAll,
		defaultChecked: hideAll,
		onchange: (event) => reportSave(setSharedItemsHiddenForAll(event.currentTarget.checked))
	})}
	{#if doc.id}
		{@render wardrobeToggle(characterContent, {
			'aria-label': t('sharedVisibility.hideCurrent', { name }),
			'aria-describedby': hideAll ? lockReasonId : undefined,
			checked: hideCurrent,
			defaultChecked: hideCurrent,
			disabled: hideAll,
			onchange: (event) =>
				reportSave(setSharedItemsHiddenForCharacter(doc.id, event.currentTarget.checked))
		})}
	{/if}
	{@render wardrobeToggle(demoContent, {
		'aria-label': t('sharedVisibility.hideDemo'),
		'aria-describedby': hideAll ? lockReasonId : undefined,
		checked: hideDemo,
		defaultChecked: hideDemo,
		disabled: hideAll,
		onchange: (event) => {
			reportSave(setDemoItemsShown(!event.currentTarget.checked));
			if (store.project && !isDemo()) void refreshShared();
		}
	})}
	{#if hideAll}
		<p class={settings ? 'bu-muted settings-description' : 'menu-sec'} id={lockReasonId}>
			{t('sharedVisibility.allOn')}
		</p>
	{/if}
</div>

<style>
	.character-wardrobe-label {
		flex: 1;
		min-inline-size: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row-name strong,
	.character-wardrobe-label strong {
		font-weight: 600;
	}
</style>
