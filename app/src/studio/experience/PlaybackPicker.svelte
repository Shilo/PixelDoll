<script lang="ts">
	import { t } from 'svelte-whisper';
	import type { playbackClips } from '../../lib/runtime/timeline.js';
	import { displayMove } from '../displayMove.ts';
	import { Check, ChevronDown } from '../icons.ts';
	import PopoverArrow from '../PopoverArrow.svelte';
	import { popoverFocus } from './focus.ts';

	let {
		clips,
		moveIds,
		selected,
		compact,
		onselect
	}: {
		clips: ReturnType<typeof playbackClips>;
		moveIds: readonly string[];
		selected: string;
		compact: boolean;
		onselect: (clip: string) => void;
	} = $props();

	const menuId = $props.id();
	const states = $derived(clips.filter((clip) => clip.kind === 'state'));
	const moves = $derived(clips.filter((clip) => clip.kind === 'move'));
	const value = $derived(displayMove(selected, moveIds));
	let menu: HTMLDivElement;
	let expanded = $state(false);
</script>

<div class="playback-move">
	<button
		type="button"
		class={['clip-trigger bu-action', { compact }]}
		data-variant="quiet"
		aria-haspopup="menu"
		aria-expanded={expanded}
		popovertarget={menuId}
		disabled={!clips.length}
		title={value}
		value={selected}
		onkeydown={(event) => {
			if (!expanded && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
				event.preventDefault();
				menu.showPopover({ source: event.currentTarget });
			}
		}}
	>
		<span class="sr">{t('common.move')}:</span>
		<span class="clip-value">{value}</span>
		<ChevronDown size={14} aria-hidden="true" />
	</button>
</div>
<div
	id={menuId}
	class={[
		'menu clip-menu bu-popover-anchor',
		{ 'two-columns': states.length > 0 && moves.length > 0 && !compact }
	]}
	data-placement="top"
	popover
	role="menu"
	aria-label={t('common.move')}
	tabindex={-1}
	bind:this={menu}
	ontoggle={(event) => {
		expanded = event.newState === 'open';
		popoverFocus(event);
	}}
	onkeydown={(event) => {
		if (event.key === 'Tab') {
			requestAnimationFrame(() => {
				if (menu.matches(':popover-open')) menu.hidePopover();
			});
		}
	}}
>
	<PopoverArrow />
	<div class="menu-surface clip-groups bu-popover-surface bu-floating">
		{@render group(t('experience.tabStates'), states)}
		{@render group(t('experience.tabMoves'), moves)}
	</div>
</div>

{#snippet group(label: string, entries: typeof clips)}
	{#if entries.length}
		<div role="group" aria-label={label}>
			<div class="menu-sec" aria-hidden="true">{label}</div>
			{#each entries as entry (entry.id)}
				<button
					type="button"
					class="row clip-row bu-action"
					data-variant="quiet"
					role="menuitemradio"
					aria-checked={selected === entry.key}
					value={entry.key}
					tabindex={-1}
					onclick={() => {
						if (selected !== entry.key) onselect(entry.key);
						menu.hidePopover();
					}}
				>
					<span>{displayMove(entry.key, moveIds)}</span>
					{#if selected === entry.key}<Check size={16} aria-hidden="true" />{/if}
				</button>
			{/each}
		</div>
	{/if}
{/snippet}

<style>
	.playback-move .clip-trigger {
		min-width: 44px;
		max-width: min(180px, 100%);
	}
	.playback-move .clip-trigger.compact {
		flex: 1;
		max-width: 100%;
		padding-inline: 6px;
		font-size: 14px;
	}
	.clip-value {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.clip-trigger :global(svg),
	.clip-row :global(svg) {
		flex: none;
	}
	:global(.studio-app) .clip-menu {
		width: min(256px, calc(100vw - 16px));
	}
	.clip-groups {
		display: grid;
		gap: 8px;
	}
	@media (min-width: 460px) {
		:global(.studio-app) .clip-menu.two-columns {
			width: 420px;
		}
		.two-columns .clip-groups {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.clip-menu .clip-row {
		justify-content: space-between;
		height: auto;
		min-height: 44px;
		padding: 4px 8px;
		font-size: inherit;
		text-align: start;
		white-space: normal;
		overflow-wrap: anywhere;
	}
</style>
