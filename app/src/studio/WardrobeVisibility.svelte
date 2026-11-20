<script lang="ts">
	import { t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	import { LayoutTemplate, Lock, UserRound, UsersRound } from './icons.ts';
	import { characterName, doc, isDemo, refreshShared, store, toast } from './state.svelte.ts';
	import RichMessage from './RichMessage.svelte';
	import {
		demoItemsShown,
		setDemoItemsShown,
		setSharedItemsHiddenForAll,
		setSharedItemsHiddenForCharacter,
		sharedItemsHidden,
		sharedItemsHiddenForAll
	} from './wardrobeVisibility.svelte.ts';

	const headingId = $props.id();
	let {
		scope = 'all',
		onManage
	}: {
		scope?: 'all' | 'global' | 'character';
		onManage?: () => void;
	} = $props();
	const lockReasonId = `${headingId}-lock-reason`;
	const name = $derived(doc.id ? characterName() : t('common.character'));
	const hideAll = $derived(sharedItemsHiddenForAll());
	const hideDemo = $derived(hideAll || !demoItemsShown());
	const hideCurrent = $derived(sharedItemsHidden(doc.id));

	function reportSave(saved: boolean) {
		if (!saved) toast(message('sharedVisibility.notSaved'), { tone: 'warning' });
	}
</script>

<div role="group" aria-labelledby={headingId}>
	<p class="menu-sec" class:settings-label={scope === 'global'} id={headingId}>
		{t('sharedVisibility.heading')}
	</p>
	{#if hideAll}<span id={lockReasonId} hidden>{t('sharedVisibility.allOn')}</span>{/if}
	{#if scope !== 'character'}<label class="row bu-check">
			<UsersRound size={18} aria-hidden="true" />
			{#snippet all()}<strong>{t('sharedVisibility.allEmphasis')}</strong>{/snippet}
			<span class="row-name"><RichMessage key="sharedVisibility.all" slots={{ all }} /></span>
			<input
				class="bu-switch"
				type="checkbox"
				role="switch"
				aria-label={t('sharedVisibility.hideAll')}
				checked={hideAll}
				defaultChecked={hideAll}
				onchange={(event) => reportSave(setSharedItemsHiddenForAll(event.currentTarget.checked))}
			/>
		</label>{/if}
	{#if scope !== 'global'}<label class="row bu-check">
			<UserRound size={18} aria-hidden="true" />
			{#snippet character()}<strong>{name}</strong>{/snippet}
			<span class="row-name"
				><RichMessage key="sharedVisibility.current" slots={{ name: character }} /></span
			>
			{#if hideAll}<Lock size={14} class="faint" aria-hidden="true" />{/if}
			<input
				class="bu-switch"
				type="checkbox"
				role="switch"
				aria-label={t('sharedVisibility.hideCurrent', { name })}
				aria-describedby={hideAll ? lockReasonId : undefined}
				checked={hideCurrent}
				defaultChecked={hideCurrent}
				disabled={hideAll || !doc.id}
				onchange={(event) =>
					reportSave(setSharedItemsHiddenForCharacter(doc.id, event.currentTarget.checked))}
			/>
		</label>{/if}
	{#if scope !== 'character'}<label class="row bu-check">
			<LayoutTemplate size={18} aria-hidden="true" />
			{#snippet demo()}<strong>{t('sharedVisibility.demoEmphasis')}</strong>{/snippet}
			<span class="row-name"><RichMessage key="sharedVisibility.demo" slots={{ demo }} /></span>
			{#if hideAll}<Lock size={14} class="faint" aria-hidden="true" />{/if}
			<input
				class="bu-switch"
				type="checkbox"
				role="switch"
				aria-label={t('sharedVisibility.hideDemo')}
				aria-describedby={hideAll ? lockReasonId : undefined}
				checked={hideDemo}
				defaultChecked={hideDemo}
				disabled={hideAll}
				onchange={(event) => {
					reportSave(setDemoItemsShown(!event.currentTarget.checked));
					if (store.project && !isDemo()) void refreshShared();
				}}
			/>
		</label>{/if}
	{#if hideAll && onManage}
		<p class="menu-sec">{t('sharedVisibility.allOn')}</p>
		<button class="row bu-action" data-variant="quiet" onclick={onManage}
			>{t('settings.wardrobe')}</button
		>
	{/if}
</div>

<style>
	.settings-label {
		padding-inline: 0;
		margin: 0;
	}
	.row-name strong {
		font-weight: 600;
	}
</style>
