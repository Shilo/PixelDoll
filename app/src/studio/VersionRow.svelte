<script lang="ts">
	import { popoverFocus } from './experience/focus.ts';
	import { ChevronRight, Copy, GitCommitHorizontal, Github } from './icons.ts';
	import PopoverArrow from './PopoverArrow.svelte';
	import { PRE_RELEASE } from './previewNotice.ts';
	import { toast } from './state.svelte.ts';

	const repositoryName = 'Shilo/PixelDoll';
	const repository = `https://github.com/${repositoryName}`;
	const suffix = PRE_RELEASE && !__APP_VERSION__.endsWith('-dev') ? '-pre' : '';
	const version = `Version ${__APP_VERSION__}${suffix}`;
	const menuId = $props.id();
	let menu: HTMLElement;
	let expanded = $state(false);

	async function copyVersion() {
		menu.hidePopover();
		try {
			await navigator.clipboard.writeText(`${version} (${__APP_COMMIT__})`);
			toast('Version copied');
		} catch {
			toast('Could not copy version details.', { tone: 'warning' });
		}
	}
</script>

<button
	class="row bu-action"
	data-variant="quiet"
	aria-controls={menuId}
	aria-expanded={expanded}
	popovertarget={menuId}
>
	<Github size={18} />
	<span class="row-name version-name">{version}</span>
	<span class="build-meta faint small num">{__APP_COMMIT__}</span>
	<ChevronRight size={16} aria-hidden="true" />
</button>
<div
	id={menuId}
	class="menu bu-popover-anchor"
	data-placement="bottom-end"
	popover
	bind:this={menu}
	role="group"
	aria-label="Version actions"
	ontoggle={(event) => {
		expanded = event.newState === 'open';
		popoverFocus(event);
	}}
>
	<PopoverArrow />
	<div class="menu-surface bu-popover-surface bu-floating">
		<a
			class="row bu-action"
			data-variant="quiet"
			href={repository}
			target="_blank"
			rel="noreferrer"
		>
			<Github size={18} /><span class="row-name">Open source code</span>
			<span class="build-meta faint small">{repositoryName}</span>
		</a>
		<a
			class="row bu-action"
			data-variant="quiet"
			href={`${repository}/commit/${__APP_COMMIT__}`}
			target="_blank"
			rel="noreferrer"
		>
			<GitCommitHorizontal size={18} /><span class="row-name">View commit</span>
			<span class="build-meta faint small num">{__APP_COMMIT__}</span>
		</a>
		<button class="row bu-action" data-variant="quiet" onclick={copyVersion}>
			<Copy size={18} /><span class="row-name">Copy version details</span>
		</button>
	</div>
</div>

<style>
	.build-meta {
		flex: none;
		white-space: nowrap;
	}
	.version-name {
		white-space: normal;
		overflow-wrap: anywhere;
	}
</style>
