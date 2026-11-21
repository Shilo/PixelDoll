<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { getLocale, getLocales, localeName, t } from 'svelte-whisper';
	import { detectedLanguage, languagePreference, selectLanguage } from '../lib/i18n.ts';
	import { popoverFocus } from './experience/focus.ts';
	import { Check, ChevronDown, Languages } from './icons.ts';
	import PopoverArrow from './PopoverArrow.svelte';
	import SettingsItemButton from './SettingsItemButton.svelte';

	const nameOf = (id: string) => (id === 'id' ? 'Bahasa Indonesia' : localeName(id));
	const alphabetical = new Intl.Collator('en');
	const choices = getLocales()
		.map((id) => ({ id, name: nameOf(id) }))
		.sort((first, second) => alphabetical.compare(first.name, second.name));
	const menuId = $props.id();
	const valueId = `${menuId}-value`;
	let { compact = false, settings = false }: { compact?: boolean; settings?: boolean } = $props();
	const activeLanguage = $derived(getLocale() || 'en');
	let menu = $state<HTMLElement>();
	let expanded = $state(false);
	let detected = $state(detectedLanguage());
	let pending = $state(false);
	let failed = $state(false);
	async function switchLanguage(id?: string) {
		if (pending) return;
		pending = true;
		failed = false;
		try {
			failed = !(await selectLanguage(id));
			if (!failed) menu?.hidePopover();
		} finally {
			pending = false;
		}
	}
</script>

{#if choices.length > 1}
	{@const trigger = {
		'aria-label': t('language.label'),
		title: compact ? t('language.label') : undefined,
		'aria-describedby': compact ? undefined : valueId,
		'aria-controls': menuId,
		'aria-expanded': expanded,
		popovertarget: menuId
	}}
	{#snippet triggerContents()}
		<Languages size={18} aria-hidden="true" />
		{#if !compact}
			<span class="row-name">{openerLabel(t('language.label'))}</span>
			<span id={valueId} class="faint small" lang={activeLanguage}>{nameOf(activeLanguage)}</span>
			{#if settings}<ChevronDown size={16} aria-hidden="true" />{:else}<SurfaceChevron />{/if}
		{/if}
	{/snippet}
	{#if settings}
		<SettingsItemButton {...trigger}>{@render triggerContents()}</SettingsItemButton>
	{:else}
		<button
			{...trigger}
			type="button"
			class={compact ? 'bu-action btn icon plain' : 'row bu-action'}
			data-variant="quiet">{@render triggerContents()}</button
		>
	{/if}
	<div
		id={menuId}
		class="menu bu-popover-anchor"
		data-placement="bottom-end"
		popover
		bind:this={menu}
		role="group"
		aria-label={t('language.label')}
		ontoggle={(event) => {
			expanded = event.newState === 'open';
			if (expanded) detected = detectedLanguage();
			popoverFocus(event);
		}}
	>
		<PopoverArrow />
		<div class="menu-surface bu-popover-surface bu-floating">
			<button
				type="button"
				class="row bu-action"
				data-variant="quiet"
				aria-pressed={$languagePreference === undefined}
				aria-disabled={pending}
				onclick={() => switchLanguage()}
			>
				<span class="row-name">{t('language.auto', { language: nameOf(detected) })}</span>
				{#if $languagePreference === undefined}<Check size={16} aria-hidden="true" />{/if}
			</button>
			<hr />
			{#each choices as { id, name } (id)}
				{@const translated = localeName(id, activeLanguage)}
				{@const showTranslation =
					id !== activeLanguage &&
					translated !== id &&
					translated.toLocaleLowerCase(activeLanguage) !== name.toLocaleLowerCase(activeLanguage)}
				<button
					type="button"
					class="row bu-action"
					data-variant="quiet"
					aria-pressed={$languagePreference === id}
					aria-disabled={pending}
					onclick={() => switchLanguage(id)}
				>
					<span class="row-name language-option">
						<span lang={id}>{name}</span>{#if showTranslation}
							<span class="small bu-muted language-translation" lang={activeLanguage}
								>{translated}</span
							>
						{/if}
					</span>
					{#if $languagePreference === id}<Check size={16} aria-hidden="true" />{/if}
				</button>
			{/each}
			<div role="status">
				{#if pending || failed}
					<p class="small language-status">
						{pending ? t('language.loading') : t('language.failed')}
					</p>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.language-option {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--menu-row-gap, 10px);
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.language-option > span {
		min-width: 0;
	}
	.language-translation {
		text-align: end;
	}
	.language-status {
		margin: 6px 8px;
	}
</style>
