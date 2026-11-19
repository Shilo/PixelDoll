<script lang="ts">
	import { getLocale, getLocales, localeName, t } from 'svelte-whisper';
	import { detectedLanguage, languagePreference, selectLanguage } from '../lib/i18n.ts';
	import { popoverFocus } from './experience/focus.ts';
	import { Check, ChevronRight, Languages } from './icons.ts';
	import PopoverArrow from './PopoverArrow.svelte';

	const names: Record<string, string> = {
		en: 'English',
		es: 'Español',
		'zh-Hans': '简体中文',
		'pt-BR': 'Português (Brasil)',
		ja: '日本語',
		de: 'Deutsch',
		fr: 'Français',
		ko: '한국어',
		tr: 'Türkçe',
		id: 'Bahasa Indonesia'
	};
	const nameOf = (id: string) => names[id] ?? localeName(id);
	const alphabetical = new Intl.Collator('en');
	const choices = getLocales()
		.map((id) => ({ id, name: nameOf(id) }))
		.sort((first, second) => alphabetical.compare(first.name, second.name));
	const menuId = $props.id();
	const valueId = `${menuId}-value`;
	let { compact = false }: { compact?: boolean } = $props();
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
	<button
		type="button"
		class={compact ? 'bu-action btn icon plain' : 'row bu-action'}
		data-variant="quiet"
		aria-label={t('language.label')}
		aria-describedby={compact ? undefined : valueId}
		aria-controls={menuId}
		aria-expanded={expanded}
		popovertarget={menuId}
	>
		<Languages size={18} aria-hidden="true" />
		{#if !compact}
			<span class="row-name">{t('language.label')}</span>
			<span id={valueId} class="faint small" lang={activeLanguage}>{nameOf(activeLanguage)}</span>
			<ChevronRight size={16} aria-hidden="true" />
		{/if}
	</button>
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
							{' '}<span class="small bu-muted" lang={activeLanguage}>({translated})</span>
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
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.language-status {
		margin: 6px 8px;
	}
</style>
