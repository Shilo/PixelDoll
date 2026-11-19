<script lang="ts">
	import { t, type WhisperKey } from 'svelte-whisper';
	import LanguagePicker from './LanguagePicker.svelte';
	import RichMessage from './RichMessage.svelte';
	import Sprite from './Sprite.svelte';
	import ApiPeek from './ApiPeek.svelte';
	import { composeCell } from '../lib/compose/compose.ts';
	import { ui, doc, view, DEMO, openProject, dismissWelcome, toggleTheme } from './state.svelte.ts';
	import { Moon, Sun, Sparkles, Download } from './icons.ts';

	let vw = $state(innerWidth),
		vh = $state(innerHeight);
	// short phones (320 x 568): the hero gives way so the buttons stay above the fold
	const heroPx = $derived(
		ui.size === 'landscape'
			? 192
			: vw < 900
				? Math.min(256, Math.floor(vw * 0.7), Math.floor(vh * 0.3))
				: 384
	);
	const k = $derived(Math.max(1, Math.floor((heroPx * ui.dpr) / 64)));
	const img = $derived(
		view.project && view.anim
			? composeCell(view.project, doc.items, ui.anim, 'south', view.cell)
			: null
	);
	function create() {
		dismissWelcome();
		ui.sheet = 'create';
	}
	function demo() {
		dismissWelcome();
		if (doc.id !== DEMO) void openProject(DEMO);
	}
	const STEPS = [
		['welcome.steps.create', 'welcome.steps.describeBody'],
		['welcome.steps.addItems', 'welcome.steps.examples'],
		['welcome.steps.dressUp', 'welcome.steps.wearRecolorPlay'],
		['welcome.steps.export', 'welcome.steps.anyEngine']
	] as const satisfies readonly (readonly [WhisperKey, WhisperKey])[];
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} />

<div class="welcome">
	<div class="welcome-bar">
		<span class="logo"
			><span class="mark" aria-hidden="true"
				><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"
					><rect x="5" y="1" width="4" height="4" rx="1" /><rect
						x="3"
						y="6"
						width="8"
						height="4"
						rx="1"
					/><rect x="4" y="10" width="2" height="3" /><rect
						x="8"
						y="10"
						width="2"
						height="3"
					/></svg
				></span
			>PixelDoll</span
		>
		<span class="api-action"
			><ApiPeek scope="all" all /><LanguagePicker compact /><button
				class="bu-action btn icon plain"
				data-variant="quiet"
				aria-label={ui.theme === 'dark'
					? t('welcome.switchToLightMode')
					: t('welcome.switchToDarkMode')}
				onclick={toggleTheme}
				>{#if ui.theme === 'dark'}<Sun size={18} />{:else}<Moon size={18} />{/if}</button
			></span
		>
	</div>
	<main class="welcome-main">
		<div class="hero-stage" style:width="{heroPx + 32}px" style:height="{heroPx + 32}px">
			{#if img}<Sprite {img} {k} label={t('welcome.labelDemoCharacterWalking')} />{:else}<span
					class="bu-ring ring spin"
					aria-hidden="true"
				></span>{/if}
		</div>
		<div class="hero-copy">
			<h1 class="hero-title">
				{t('welcome.dressUpYour2DGameCharactersWith')}
			</h1>
			<p class="hero-sub">
				{t('welcome.generateSwappableFrameAlignedEquipmentLayersWith')}
			</p>
			<div class="hero-actions">
				<button class="bu-action btn primary lg" data-variant="primary" onclick={create}
					><Sparkles size={16} />{t('welcome.createYourCharacter')}</button
				>
				<button class="bu-action btn lg" data-variant="outline" onclick={demo}
					>{t('welcome.tryTheDemo')}</button
				>
			</div>
			<button
				class="bu-action btn plain"
				data-variant="quiet"
				onclick={() => {
					ui.sheet = 'importZip';
				}}><Download size={16} />{t('welcome.importAnExistingCharacter')}</button
			>
			<p class="faint small">
				{#snippet pixelLab()}<a href="https://pixellab.ai" target="_blank" rel="noreferrer"
						>PixelLab</a
					>{/snippet}
				<RichMessage key="welcome.demoNeedsNoAccount" slots={{ pixelLab }} />
			</p>
		</div>
	</main>
	<ol class="how">
		{#each STEPS as [label, description], i (label)}
			<li>
				<span class="how-num">{i + 1}</span><span class="how-text"
					><b>{t(label)}</b><span class="muted small">{t(description)}</span></span
				>
			</li>
		{/each}
	</ol>
</div>
