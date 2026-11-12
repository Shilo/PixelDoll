<script lang="ts">
	import { app } from '../lib/app.svelte.ts';
	import { popoverFocus } from './experience/focus.ts';
	import { tick } from 'svelte';
	import { experience, characters, setMode, type WorldMode } from './experience/state.svelte.ts';
	import CharacterThumb from './experience/CharacterThumb.svelte';
	import SharePopover from './SharePopover.svelte';
	import PopoverArrow from './PopoverArrow.svelte';
	import ApiPeek from './ApiPeek.svelte';
	import FullscreenButton from './FullscreenButton.svelte';
	import { queue } from '../lib/pixellab/queue.ts';
	import { pwa, installApp, requestUpdate, requestInstallHelp } from '../lib/pwa.ts';
	import { characterFacts, fmtNum } from './model.ts';
	import {
		ui,
		doc,
		store,
		creating,
		settingUp,
		gens,
		openProject,
		undo,
		redo,
		randomize,
		refreshProjects,
		characterName,
		toggleTheme,
		isDemo
	} from './state.svelte.ts';
	import {
		Github,
		Check,
		ChevronLeft,
		ExternalLink,
		ChevronRight,
		Download,
		Share2,
		Ellipsis,
		KeyRound,
		Plus,
		Redo2,
		Sun,
		Moon,
		Undo2,
		House,
		Activity,
		Pencil,
		Trash,
		PersonStanding,
		ChevronDown,
		Copy,
		Dices,
		Eye,
		Layers2,
		Mountain,
		Grid2x2
	} from './icons.ts';

	const m = $derived(store.project?.manifest);
	const name = $derived(characterName());
	const prompt = $derived(m?.items.find((it) => it.id === m.rig.baseItem)?.prompt ?? '');
	const characterCount = $derived(store.projects.filter((p) => !p.dev).length);
	const VIEWS = [
		['preview', 'Preview', Eye],
		['topdown', 'Top-down', Layers2],
		['side', 'Side-scroller', Mountain]
	] as const;
	async function changeMode(mode: WorldMode) {
		setMode(mode);
		await tick();
		document.querySelector<HTMLElement>('.world-stage')?.focus({ preventScroll: true });
	}
	let copyMessage = $state('');
	async function copyPrompt() {
		try {
			await navigator.clipboard.writeText(prompt);
			copyMessage = 'Copied';
		} catch {
			copyMessage = 'Select the prompt to copy it';
		}
	}
	const devRigs = $derived(import.meta.env.DEV ? store.projects.filter((p) => p.dev) : []);
	const active = $derived($queue.counts.running + $queue.counts.pending);
	const busy = $derived(
		active > 0 ||
			gens.some((g) => g.phase === 'running') ||
			(!!creating.spec && !creating.projectId && !creating.error) ||
			(!!settingUp.spec && !settingUp.done && !settingUp.error)
	);
	const undoLabel = $derived(doc.undo.at(-1)?.label);
	const redoLabel = $derived(doc.redo.at(-1)?.label);
	let menu: HTMLElement;
	const close = () => menu?.hidePopover?.();
	const pick = (id: string) => {
		close();
		if (id !== doc.id) void openProject(id);
	};
	const closeOptions = () => document.getElementById('experience-options')?.hidePopover();
	const sheet = (s: typeof ui.sheet) => {
		close();
		ui.sheet = s;
	};
	/** Prefer centering the view switch over the character (the stage's middle), not the window; stay clear of the
	 *  name and the actions, and fall back to the bar's center when there is no room. Floating rows (phones,
	 *  sheets) are positioned by CSS and are left alone. */
	function centerOnStage(node: HTMLElement) {
		const header = node.parentElement!;
		const update = () => {
			node.style.removeProperty('--view-shift');
			if (getComputedStyle(node).position === 'absolute') return;
			const css = getComputedStyle(node),
				stageCenter =
					(parseFloat(css.getPropertyValue('--stage-left')) +
						innerWidth -
						parseFloat(css.getPropertyValue('--stage-right'))) /
					2;
			// The side columns stretch to fill the grid, so measure the controls inside them, not the columns.
			const visible = (selector: string) =>
				[...(header.querySelector(selector)?.children ?? [])]
					.map((el) => el.getBoundingClientRect())
					.filter((r) => r.width > 0);
			const box = node.getBoundingClientRect(),
				start = visible('.header-start'),
				end = visible('.header-actions');
			if (!Number.isFinite(stageCenter) || !start.length || !end.length) return;
			const gap = 12,
				min = Math.max(...start.map((r) => r.right)) + gap - box.left,
				max = Math.min(...end.map((r) => r.left)) - gap - box.right;
			if (min > max) return;
			const shift = Math.min(max, Math.max(min, stageCenter - (box.left + box.width / 2)));
			node.style.setProperty('--view-shift', `${Math.round(shift)}px`);
		};
		const observer = new ResizeObserver(update);
		for (const el of [header, ...header.children]) observer.observe(el);
		addEventListener('resize', update);
		update();
		return () => {
			observer.disconnect();
			removeEventListener('resize', update);
		};
	}
</script>

<header class="experience-header">
	<div class="header-start">
		{#if experience.screen === 'studio'}<button
				class="bu-action header-back"
				data-variant="quiet"
				aria-label="Characters"
				title="Characters"
				onclick={characters}><ChevronLeft size={20} /></button
			><!-- The page heading sits beside the menu button: a heading is not allowed inside a button. -->
			<h1 class="sr">{name}</h1>
			<button
				class="name-menu project-btn"
				popovertarget="project-menu"
				aria-haspopup="menu"
				onclick={() => void refreshProjects()}
				><span class="name-line"
					><span class="name-text">{name}</span>
					<ChevronDown size={16} /></span
				>{#if m}<span class="name-facts">{characterFacts(m)}</span>{/if}</button
			>{:else}<span class="brand"><PersonStanding size={20} />PixelDoll</span><span
				class="brand-divider"
				aria-hidden="true"
			></span>
			<h1 class="screen-title">Characters</h1>
			<span class="screen-count num"
				>{characterCount}<span class="sr"
					>{` ${characterCount === 1 ? 'character' : 'characters'}`}</span
				></span
			>{/if}
	</div>
	{#if experience.screen === 'studio'}
		<!-- A view switch over one stage, not tabs with panels: pressed toggle buttons. -->
		<div class="view-modes" role="group" aria-label="Character view" {@attach centerOnStage}>
			{#each VIEWS as [id, label, Icon] (id)}<button
					class="bu-action"
					data-variant="tab"
					aria-pressed={experience.mode === id}
					aria-controls="world-stage"
					aria-label={label}
					title={label}
					onclick={() => changeMode(id)}
					><span class="bu-tab-label"
						><Icon size={18} aria-hidden="true" /><span class="view-label">{label}</span></span
					></button
				>{/each}
		</div>
	{/if}
	<div class="header-actions">
		{#if experience.screen === 'characters'}
			<button
				class="bu-action selection-import"
				data-variant="outline"
				onclick={() => {
					ui.importSource = 'device';
					ui.sheet = 'import';
				}}><Download size={16} /><span>Import</span></button
			>
			<button
				class="bu-action selection-create"
				data-variant="outline"
				aria-label="New character"
				onclick={() => (ui.sheet = 'create')}><Plus size={16} /><span>New character</span></button
			>
		{:else}
			<button
				class="bu-action header-random"
				data-variant="quiet"
				aria-label="Random look"
				title="Random look (items and colors)"
				disabled={!m}
				onclick={randomize}><Dices size={18} /></button
			>
			<button
				class="bu-action header-undo"
				data-variant="quiet"
				aria-label={undoLabel ? 'Undo ' + undoLabel : 'Undo'}
				title={undoLabel ? 'Undo ' + undoLabel : 'Undo'}
				disabled={!undoLabel}
				onclick={undo}><Undo2 size={18} /></button
			>
			<button
				class="bu-action header-redo"
				data-variant="quiet"
				aria-label={redoLabel ? 'Redo ' + redoLabel : 'Redo'}
				title={redoLabel ? 'Redo ' + redoLabel : 'Redo'}
				disabled={!redoLabel}
				onclick={redo}><Redo2 size={18} /></button
			>
			<button
				class="bu-action header-share"
				data-variant="outline"
				aria-label="Share character"
				title="Share"
				popovertarget="share-popover"
				disabled={!m}><Share2 size={16} /><span>Share</span></button
			>
			<button
				class="bu-action header-export"
				data-variant="outline"
				aria-label="Export"
				title="Export"
				onclick={() => (ui.sheet = 'export')}
				disabled={!m}><Download size={16} /><span>Export</span></button
			>
		{/if}
		{#if busy}<button
				class="bu-action"
				data-variant="quiet"
				aria-label="Activity"
				onclick={() => (ui.sheet = 'activity')}
				><span class="ring spin"></span><span class="num">{active || ''}</span></button
			>{/if}
		<FullscreenButton />
		<button
			class="bu-action"
			data-variant="quiet"
			aria-label="More options"
			data-popover-fallback="share-popover"
			popovertarget="experience-options"><Ellipsis size={20} /></button
		>
	</div>
</header>
<SharePopover />
<div
	id="experience-options"
	class="menu options-menu bu-popover-anchor"
	data-placement="bottom-end"
	popover
	ontoggle={popoverFocus}
>
	<PopoverArrow />
	<div class="menu-surface bu-popover-surface bu-floating">
		<!-- Phones move lower-frequency bar actions here, so the character name keeps its room. -->
		{#if experience.screen === 'studio'}<button
				class="row bu-action mobile-random"
				data-variant="quiet"
				disabled={!m}
				onclick={() => {
					closeOptions();
					randomize();
				}}><Dices size={18} /><span class="row-name">Random look</span></button
			>{/if}
		{#if experience.screen === 'studio'}<button
				class="row bu-action mobile-undo"
				data-variant="quiet"
				disabled={!undoLabel}
				onclick={() => {
					closeOptions();
					undo();
				}}
				><Undo2 size={18} /><span class="row-name">{undoLabel ? 'Undo ' + undoLabel : 'Undo'}</span
				></button
			>{/if}
		{#if experience.screen === 'studio'}<button
				class="row bu-action mobile-redo"
				data-variant="quiet"
				disabled={!redoLabel}
				onclick={() => {
					closeOptions();
					redo();
				}}
				><Redo2 size={18} /><span class="row-name">{redoLabel ? 'Redo ' + redoLabel : 'Redo'}</span
				></button
			>{/if}
		{#if experience.screen === 'studio'}<button
				class="row bu-action mobile-share"
				data-variant="quiet"
				disabled={!m}
				onclick={() => {
					closeOptions();
					document.getElementById('share-popover')?.showPopover();
				}}><Share2 size={18} /><span class="row-name">Share</span></button
			>{/if}
		<!-- Narrow phones move Inspect here from the playback bar so its controls keep full-size targets. -->
		{#if experience.screen === 'studio' && experience.mode === 'preview'}<button
				class="row bu-action mobile-inspect"
				data-variant="quiet"
				disabled={!m}
				onclick={() => {
					closeOptions();
					ui.sheet = 'inspect';
				}}><Grid2x2 size={18} /><span class="row-name">Inspect</span></button
			>{/if}
		{#if experience.screen === 'studio'}<hr class="mobile-sep" />{/if}
		<button
			class="row bu-action"
			data-variant="quiet"
			onclick={() => {
				closeOptions();
				ui.sheet = 'activity';
			}}
			><Activity size={18} /><span class="row-name">Activity</span
			>{#if $queue.role === 'follower'}<span class="small">Other tab</span>{/if}</button
		>
		<ApiPeek scope="all" all menu />
		{#if import.meta.env.PROD && !$pwa.installed}
			{#if $pwa.installable || $pwa.installing}<button
					class="row bu-action"
					data-variant="quiet"
					disabled={$pwa.installing}
					onclick={() => {
						void installApp();
					}}><Download size={18} /><span class="row-name">Install PixelDoll</span></button
				>
			{:else}<button class="row bu-action" data-variant="quiet" onclick={requestInstallHelp}
					><Download size={18} /><span class="row-name">Installation help</span></button
				>{/if}
		{/if}
		{#if $pwa.available}<button
				class="row bu-action"
				data-variant="quiet"
				disabled={!$pwa.ready}
				onclick={requestUpdate}
				><Download size={18} /><span class="row-name">Update to v{$pwa.available.version}</span
				></button
			>{/if}
		<hr />
		<button
			class="row bu-action"
			data-variant="quiet"
			onclick={() => {
				closeOptions();
				ui.sheet = 'connect';
			}}
			><KeyRound size={18} /><span class="row-name"
				>{app.key
					? app.keyRejected
						? 'Key not accepted'
						: 'PixelLab account'
					: 'Connect PixelLab'}</span
			></button
		>
		<button
			class="row bu-action"
			data-variant="quiet"
			onclick={() => {
				toggleTheme();
				closeOptions();
			}}
			>{#if ui.theme === 'dark'}<Sun size={18} />{:else}<Moon size={18} />{/if}<span
				class="row-name">{ui.theme === 'dark' ? 'Light mode' : 'Dark mode'}</span
			></button
		>
		<hr />
		<a
			class="row bu-action"
			data-variant="quiet"
			href="https://github.com/Shilo/PixelDoll"
			target="_blank"
			rel="noreferrer"
			><Github size={18} /><span class="row-name">Source code</span><span
				class="row-aside faint small">Shilo/PixelDoll</span
			><ExternalLink size={16} /></a
		>
		<a
			class="row bu-action"
			data-variant="quiet"
			href="https://github.com/Shilo/PixelDoll/commit/{__APP_COMMIT__}"
			target="_blank"
			rel="noreferrer"
			><PersonStanding size={18} /><span class="row-name">Version {__APP_VERSION__}</span><span
				class="row-aside faint small num">{__APP_COMMIT__}</span
			><ExternalLink size={16} /></a
		>
	</div>
</div>

<div
	id="project-menu"
	class="menu bu-popover-anchor"
	data-placement="bottom-start"
	popover
	bind:this={menu}
	role="menu"
	aria-label="Characters"
	ontoggle={(e) => {
		copyMessage = '';
		popoverFocus(e);
	}}
>
	<PopoverArrow />
	<div class="menu-surface bu-popover-surface bu-floating">
		{#if experience.screen === 'studio' && prompt}
			<div class="menu-prompt">
				<p class="menu-sec">Prompt</p>
				<p class="menu-prompt-text">{prompt}</p>
				<button
					class="row"
					role="menuitem"
					aria-label={copyMessage || 'Copy prompt'}
					onclick={copyPrompt}
					><Copy size={16} /><span class="row-name">{copyMessage || 'Copy prompt'}</span></button
				>
			</div>
			<hr />
		{/if}
		<p class="menu-sec">Characters</p>
		{#snippet proj(p: (typeof store.projects)[number])}
			<button
				class="row"
				role="menuitemradio"
				aria-checked={p.id === doc.id}
				aria-label={p.name}
				onclick={() => pick(p.id)}
			>
				<CharacterThumb id={p.id} name={p.name} size={48} /><span class="row-name">{p.name}</span
				>{#if p.id === doc.id}<Check size={14} />{/if}
			</button>
		{/snippet}
		{#each store.projects.filter((p) => !p.dev) as p (p.id)}{@render proj(p)}{/each}
		<button class="row" role="menuitem" aria-label="New character…" onclick={() => sheet('create')}
			><Plus size={16} /><span class="row-name">New character…</span></button
		>
		<button
			class="row"
			role="menuitem"
			aria-label="Import character…"
			onclick={() => {
				ui.importSource = 'device';
				sheet('import');
			}}><Download size={16} /><span class="row-name">Import character…</span></button
		>
		{#if !isDemo()}<button
				class="row"
				role="menuitem"
				aria-label="Rename character…"
				onclick={() => sheet('rename')}
				><Pencil size={16} /><span class="row-name">Rename…</span></button
			>{/if}
		{#if !isDemo()}<button
				class="row"
				role="menuitem"
				aria-label="Set up character…"
				onclick={() => sheet('setup')}
				><PersonStanding size={16} /><span class="row-name">Set up character…</span></button
			>{/if}
		{#if !isDemo()}<button
				class="row"
				role="menuitem"
				aria-label="Delete character…"
				onclick={() => sheet('delete')}
				><Trash size={16} /><span class="row-name">Delete character…</span></button
			>{/if}
		<hr />
		<button
			class="row"
			role="menuitem"
			aria-label={app.key ? 'PixelLab account' : 'Connect PixelLab…'}
			onclick={() => sheet('connect')}
			><KeyRound size={16} /><span class="row-name"
				>{app.key ? 'PixelLab account' : 'Connect PixelLab…'}</span
			>
			{#if app.balance}<span class="faint small num"
					>{fmtNum(app.balance.subscription.generations)} gens</span
				>{/if}</button
		>
		<button class="row" role="menuitem" aria-label="Activity" onclick={() => sheet('activity')}
			><Activity size={16} /><span class="row-name">Activity</span>{#if active}<span
					class="badge accent">{active}</span
				>{/if}</button
		>
		<button
			class="row"
			role="menuitem"
			aria-label="Character selection"
			onclick={() => {
				close();
				characters();
			}}><House size={16} /><span class="row-name">Character selection</span></button
		>
		{#if import.meta.env.DEV}<a
				class="row"
				role="menuitem"
				aria-label="Developer pages"
				href="#/dev"
				onclick={close}
				style="text-decoration:none"
				><Ellipsis size={16} /><span class="row-name">Developer pages (M1–M5)</span></a
			>{/if}
		<!-- T2: rigs frozen on the M2 dev pages stay out of the main list; reachable here for developers only -->
		{#if import.meta.env.DEV && devRigs.length}
			<details class="dev-rigs">
				<summary class="row"
					><ChevronRight size={16} /><span class="row-name">Developer rigs</span><span
						class="faint small num">{devRigs.length}</span
					></summary
				>
				{#each devRigs as p (p.id)}{@render proj(p)}{/each}
			</details>
		{/if}
	</div>
</div>
