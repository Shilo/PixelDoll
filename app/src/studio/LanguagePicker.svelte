<script lang="ts">
	import { getLocale, getLocales, localeName, setLocale, t } from 'svelte-whisper';

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
	const available = new Set(getLocales());
	const choices = [...new Set([...Object.keys(names), ...available])].filter((id) =>
		available.has(id)
	);
	let { compact = false }: { compact?: boolean } = $props();
	let pending = $state(false);
	let failed = $state(false);
	async function switchLanguage(event: Event) {
		const select = event.currentTarget as HTMLSelectElement;
		const id = select.value;
		pending = true;
		failed = false;
		try {
			failed = !(await setLocale(id)) && getLocale() !== id;
		} finally {
			select.value = getLocale();
			pending = false;
		}
	}
</script>

{#if choices.length > 1}
	<div class="language-picker" aria-busy={pending}>
		<label>
			<span class:sr={compact}>{t('language.label')}</span>
			<select class="bu-select" value={getLocale()} disabled={pending} onchange={switchLanguage}>
				{#each choices as id (id)}
					<option value={id} lang={id}>{names[id] ?? localeName(id)}</option>
				{/each}
			</select>
		</label>
		{#if pending || failed}
			<p class="small" role="status">{pending ? t('language.loading') : t('language.failed')}</p>
		{/if}
	</div>
{/if}

<style>
	label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}
	select {
		max-width: 100%;
		min-height: 44px;
	}
	.language-picker {
		min-width: 0;
	}
</style>
