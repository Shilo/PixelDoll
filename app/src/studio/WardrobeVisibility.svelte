<script lang="ts">
	import { t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
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
	const lockReasonId = `${headingId}-lock-reason`;
	const hideAll = $derived(sharedItemsHiddenForAll());
	const hideDemo = $derived(hideAll || !demoItemsShown());
	const hideCurrent = $derived(current ? sharedItemsHidden(current.id) : false);

	function reportSave(saved: boolean) {
		if (!saved) toast(message('sharedVisibility.notSaved'), { tone: 'warning' });
	}
</script>

<div role="group" aria-labelledby={headingId}>
	<p class="menu-sec" id={headingId}>{t('sharedVisibility.heading')}</p>
	{#if hideAll}<span id={lockReasonId} hidden>{t('sharedVisibility.allOn')}</span>{/if}
	<label class="row bu-check">
		<UsersRound size={18} aria-hidden="true" />
		<span class="row-name">{t('sharedVisibility.all')}</span>
		<input
			class="bu-switch"
			type="checkbox"
			role="switch"
			aria-label={t('sharedVisibility.hideAll')}
			checked={hideAll}
			defaultChecked={hideAll}
			onchange={(event) => reportSave(setSharedItemsHiddenForAll(event.currentTarget.checked))}
		/>
	</label>
	<label class="row bu-check">
		<LayoutTemplate size={18} aria-hidden="true" />
		<span class="row-name wardrobe-character">
			<span class="wardrobe-character-name">{DEMO_NAME}</span><span class="faint small"
				>{t('characterName.demo')}</span
			>
		</span>
		{#if hideAll}<Lock size={14} class="faint" aria-hidden="true" />{/if}
		<input
			class="bu-switch"
			type="checkbox"
			role="switch"
			aria-label={t('sharedVisibility.hideDemo', { name: DEMO_NAME })}
			aria-describedby={hideAll ? lockReasonId : undefined}
			checked={hideDemo}
			defaultChecked={hideDemo}
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
				<span class="wardrobe-character-name">{name}</span><span class="faint small"
					>{t('sharedVisibility.current')}</span
				>
			</span>
			{#if hideAll}<Lock size={14} class="faint" aria-hidden="true" />{/if}
			<input
				class="bu-switch"
				type="checkbox"
				role="switch"
				aria-label={t('sharedVisibility.hideCurrent', { name })}
				aria-describedby={hideAll ? lockReasonId : undefined}
				checked={hideCurrent}
				defaultChecked={hideCurrent}
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
