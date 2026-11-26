<script lang="ts">
	import type { Component } from 'svelte';
	import { fitSelects } from '@shilo/bronze-ui/svelte';
	import Studio from './studio/Studio.svelte';
	import { workspaceCopy } from './lib/store/workspace-mode.ts';
	import { localDeveloperToolsEnabled, watchDeveloperMode } from './studio/developerMode.svelte.ts';
	import { watchMountPreferences } from './studio/experience/riderPose.ts';
	import { watchLivePreferences } from './studio/experience/liveViews.ts';
	import { applyRiderPose } from './studio/mountPreview.ts';
	import { experience } from './studio/experience/state.svelte.ts';
	import { doc } from './studio/state.svelte.ts';
	import { syncAudio, watchAudio } from './studio/audio.svelte.ts';
	import { watchPromptSuggestions } from './studio/promptSuggestions.svelte.ts';

	// Dev-only harness pages (M1, M3-M5, #/selftest; some spend credits). Behind import.meta.env.DEV, so `vite build` drops them.
	type Page = () => Promise<{ default: Component }>;
	const pages: Record<string, Page> = import.meta.env.DEV
		? {
				'/m1': () => import('./ui/M1.svelte'),
				'/m3': () => import('./ui/M3.svelte'),
				'/m4': () => import('./ui/M4.svelte'),
				'/m5': () => import('./ui/M5.svelte'),
				'/selftest': () => import('./ui/SelfTest.svelte'),
				home: () => import('./ui/Home.svelte'),
				bar: () => import('./ui/TopBar.svelte')
			}
		: {};
	const current = () => location.hash.replace(/^#/, '') || '/';
	let route = $state(import.meta.env.DEV ? current() : '/');
	$effect(watchDeveloperMode);
	// Preview follows another tab only when this character's mounting changed, not for unrelated mount settings.
	$effect(() =>
		watchMountPreferences((previous) => {
			if (
				previous.show !== experience.testMount ||
				previous.poses[doc.id] !== experience.ridingPoses[doc.id]
			)
				applyRiderPose();
		})
	);
	$effect(watchPromptSuggestions);
	$effect(watchLivePreferences);
	$effect(watchAudio);
	$effect(syncAudio);
	// Every theme select, including ones in sheets and popovers added later, keeps the width of its longest option, so
	// choosing never resizes it.
	$effect(() => fitSelects()(document.body));
	$effect(() => {
		if (!import.meta.env.DEV || workspaceCopy || localDeveloperToolsEnabled() || route === '/')
			return;
		history.replaceState(history.state, '', location.pathname + location.search);
		route = '/';
	});
	$effect(() => {
		if (!import.meta.env.DEV) return;
		const on = () => (route = current());
		addEventListener('hashchange', on);
		return () => removeEventListener('hashchange', on);
	});
</script>

{#if !import.meta.env.DEV || !localDeveloperToolsEnabled() || route === '/' || route === ''}
	<Studio />
{:else}
	{#await Promise.all([pages.bar(), (pages[route] ?? pages.home)()]) then [bar, page]}
		<bar.default />
		<main><page.default /></main>
	{/await}
{/if}
{#if import.meta.env.DEV && import.meta.env.MODE === 'agent'}
	<!-- inline style: a <style> rule would survive the dead {#if} into the production CSS -->
	<div
		class="agent-badge"
		style="position:fixed;left:8px;bottom:8px;z-index:9999;pointer-events:none;padding:2px 8px;border-radius:999px;font:600 11px/1.6 system-ui,sans-serif;color:#000;background:var(--warn,#e8b339);opacity:.9"
		title="Agent dev server (npm run dev:agent), for AI-agent testing only"
	>
		Agent mode
	</div>
{/if}
