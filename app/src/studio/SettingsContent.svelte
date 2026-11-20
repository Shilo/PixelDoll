<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { getLocale, t, type WhisperKey } from 'svelte-whisper';
	import { app } from '../lib/app.svelte.ts';
	import { exportFormatNames } from './exportFormatNames.ts';
	import { workspaceCopy } from '../lib/store/workspace-mode.ts';
	import { Download, KeyRound, Moon, Settings2, Shirt, Sun } from './icons.ts';
	import LanguagePicker from './LanguagePicker.svelte';
	import WardrobeVisibility from './WardrobeVisibility.svelte';
	import VersionRow from './VersionRow.svelte';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import {
		openSettingsAccount,
		settingsLabels,
		settingsNavigation,
		type SettingsSection
	} from './settingsNavigation.svelte.ts';
	import { setTheme, ui } from './state.svelte.ts';

	let { exportSettings, busy }: { exportSettings: Snippet<[string | undefined]>; busy: boolean } =
		$props();
	const themes = ['dark', 'light'] as const;
	const sections = [
		{
			id: 'general',
			label: settingsLabels.general,
			icon: Settings2,
			entries: [
				{ id: 'theme', label: 'settings.theme', terms: ['toolbar.lightMode', 'toolbar.darkMode'] },
				{ id: 'language', label: 'language.label' }
			]
		},
		{
			id: 'wardrobe',
			label: settingsLabels.wardrobe,
			icon: Shirt,
			entries: [
				{
					id: 'visibility',
					label: 'sharedVisibility.heading',
					terms: [
						'toolbar.wardrobeSettings',
						'sharedVisibility.hideAll',
						'sharedVisibility.hideDemo'
					]
				}
			]
		},
		{
			id: 'export',
			label: settingsLabels.export,
			icon: Download,
			entries: [
				{
					id: 'format',
					label: 'export.settings.format',
					terms: ['export.group.engines', 'export.settings.versionMenu'],
					names: Object.values(exportFormatNames)
				},
				{
					id: 'playback',
					label: 'export.settings.playOnce',
					terms: ['export.settings.playOnceHint']
				},
				{ id: 'sheets', label: 'export.settings.dressed', terms: ['export.settings.dressedHint'] }
			]
		},
		{
			id: 'pixellab',
			label: settingsLabels.pixellab,
			icon: KeyRound,
			entries: [
				{
					id: 'connection',
					label: 'toolbar.pixelLabAccount',
					terms: [
						'toolbar.connectPixelLab2',
						'connectSheet.aPIKey',
						'connectSheet.forgetKey',
						'connectSheet.rememberOnThisDevice'
					]
				}
			]
		}
	] satisfies {
		id: SettingsSection;
		label: WhisperKey;
		icon: typeof Settings2;
		entries: { id: string; label: WhisperKey; terms?: WhisperKey[]; names?: readonly string[] }[];
	}[];
	const available = sections.filter((section) => !workspaceCopy || section.id !== 'pixellab');
	const wide = new MediaQuery('(min-width: 660px) and (min-height: 520px)');
	const active = $derived(
		available.find(
			(section) => section.id === (settingsNavigation.section ?? (wide.current ? 'general' : null))
		)
	);
	let query = $state('');
	let targetEntry = $state<string>();
	let panel: HTMLElement;
	let search: HTMLInputElement;
	let previousSection: SettingsSection | null = null;
	$effect(() => {
		const section = settingsNavigation.section;
		if (previousSection && !section) {
			query = '';
			void tick().then(() => {
				panel.closest('.sheet-body')?.scrollTo(0, 0);
				search.focus({ preventScroll: true });
			});
		}
		previousSection = section;
	});
	function normalize(value: string, locale: string) {
		return value.toLocaleLowerCase(locale).normalize('NFD').replace(/\p{M}/gu, '');
	}
	const matches = $derived.by(() => {
		const locale = getLocale() || 'en';
		const words = normalize(query.trim(), locale).split(/\s+/);
		return available.flatMap((section) =>
			section.entries.flatMap((entry) => {
				const text = normalize(
					[
						...[section.label, entry.label, ...(entry.terms ?? [])].map((key) => t(key)),
						...('names' in entry ? (entry.names ?? []) : [])
					].join(' '),
					locale
				);
				return words.every((word) => text.includes(word)) ? [{ section, entry }] : [];
			})
		);
	});

	async function show(section: SettingsSection | null, entry?: string) {
		query = '';
		targetEntry = entry;
		settingsNavigation.section = section;
		await tick();
		panel.closest('.sheet-body')?.scrollTo(0, 0);
		if (!section) {
			search.focus({ preventScroll: true });
			return;
		}
		const row = entry && panel.querySelector<HTMLElement>(`[data-setting="${entry}"]`);
		const target =
			(row &&
				(row.querySelector<HTMLElement>(
					'input:checked:not(:disabled), button:not(:disabled), select:not(:disabled), input:not(:disabled)'
				) ||
					row)) ||
			panel.querySelector<HTMLElement>('h3');
		target?.focus();
	}
</script>

<div class={['settings-content', { detail: Boolean(active), searching: Boolean(query.trim()) }]}>
	<div class="settings-index">
		<input
			class="bu-input input"
			type="search"
			readonly={busy}
			aria-label={t('settings.search')}
			placeholder={t('settings.search')}
			bind:this={search}
			bind:value={query}
		/>
		{#if !query.trim()}
			<div class="settings-links">
				<nav aria-label={t('export.sheet.settings')}>
					{#each available as section (section.id)}
						<button
							class="row bu-action"
							data-variant={active?.id === section.id ? 'field' : 'quiet'}
							aria-current={active?.id === section.id ? 'page' : undefined}
							disabled={busy}
							onclick={() => show(section.id)}
						>
							<section.icon size={18} aria-hidden="true" />
							<span class="row-name">{t(section.label)}</span>
							<SurfaceChevron />
						</button>
					{/each}
				</nav>
				<hr class="bu-separator" />
				<VersionRow />
			</div>
		{/if}
	</div>
	<section
		class="settings-panel"
		aria-label={query.trim()
			? t('settings.search')
			: active
				? t(active.label)
				: t('export.sheet.settings')}
		bind:this={panel}
	>
		{#if query.trim()}
			{#each matches as { section, entry } (entry.id)}
				<button
					class="row bu-action search-result"
					data-variant="quiet"
					disabled={busy}
					onclick={() => show(section.id, entry.id)}
				>
					<span class="row-name"
						>{t(entry.label)}<small class="bu-muted">{t(section.label)}</small></span
					>
					<SurfaceChevron />
				</button>
			{:else}
				<p role="status" class="bu-muted">{t('settings.noResults')}</p>
			{/each}
		{:else if active}
			<h3 class="settings-heading" tabindex="-1">{t(active.label)}</h3>
			{#if settingsNavigation.fromExport && settingsNavigation.section}
				<button
					class="row bu-action settings-index-link"
					data-variant="quiet"
					disabled={busy}
					onclick={() => show(null)}>{t('settings.all')}<SurfaceChevron /></button
				>
			{/if}
			{#if active.id === 'general'}
				<fieldset class="theme-options" data-setting="theme" tabindex="-1">
					<legend class="label">{t('settings.theme')}</legend>
					{#each themes as theme (theme)}
						<label class="row bu-check bu-action" data-variant="field">
							{#if theme === 'dark'}<Moon size={18} aria-hidden="true" />{:else}<Sun
									size={18}
									aria-hidden="true"
								/>{/if}
							<span class="row-name"
								>{t(theme === 'dark' ? 'toolbar.darkMode' : 'toolbar.lightMode')}</span
							>
							<input
								type="radio"
								name="settings-theme"
								checked={ui.theme === theme}
								onchange={() => setTheme(theme)}
							/>
						</label>
					{/each}
				</fieldset>
				<hr class="bu-separator" />
				<div data-setting="language" tabindex="-1"><LanguagePicker /></div>
			{:else if active.id === 'wardrobe'}
				<div data-setting="visibility" tabindex="-1">
					<WardrobeVisibility scope="global" />
				</div>
			{:else if active.id === 'export'}
				{@render exportSettings(targetEntry)}
			{:else}
				<button
					class="row bu-action"
					data-setting="connection"
					data-variant="quiet"
					onclick={openSettingsAccount}
				>
					<KeyRound size={18} aria-hidden="true" />
					<span class="row-name"
						>{openerLabel(
							t(app.key ? 'toolbar.pixelLabAccount' : 'toolbar.connectPixelLab2')
						)}</span
					>
					<SurfaceChevron />
				</button>
			{/if}
		{/if}
	</section>
</div>

<style>
	:global(dialog.settings-sheet.center) {
		height: min(540px, calc(100dvh - 32px));
	}
	:global(dialog.settings-sheet.bottom) {
		height: 100dvh;
		max-height: 100dvh;
	}
	:global(dialog.settings-sheet.side) {
		width: min(100%, 560px);
		height: 100dvh;
	}
	.settings-content,
	.settings-index,
	.settings-panel {
		display: grid;
		align-content: start;
		min-width: 0;
		gap: 12px;
	}
	.settings-index input {
		width: 100%;
		min-width: 0;
	}
	.settings-heading {
		margin: 0;
	}
	.theme-options {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
		gap: 8px;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.theme-options legend {
		margin-block-end: 8px;
	}
	.settings-content :global(.row) {
		width: 100%;
		text-align: start;
		min-height: 44px;
	}
	.settings-content :global(.row-name) {
		white-space: normal;
		overflow-wrap: anywhere;
	}
	nav button[aria-current='page'] {
		font-weight: 700;
	}
	.settings-panel :global(.row:not([data-variant='field'])) {
		padding-inline: 0;
	}
	.search-result small {
		display: block;
	}
	.detail:not(.searching) .settings-links {
		display: none;
	}
	@media (min-width: 660px) and (min-height: 520px) {
		.detail,
		.searching {
			grid-template-columns: minmax(248px, 1fr) minmax(0, 1.8fr);
			gap: 24px;
		}
		.detail:not(.searching) .settings-links {
			display: block;
		}
		.settings-content .settings-index-link {
			display: none;
		}
	}
</style>
