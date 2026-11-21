<script lang="ts">
	// Chooses the State or Move a new State starts from, grouped like the playback picker.
	import { t } from 'svelte-whisper';
	import type { Img } from '../lib/image/png.ts';
	import type { RigAnimation } from '../lib/rig/rig.ts';
	import { clipKind } from '../lib/runtime/timeline.js';
	import { popoverFocus } from './experience/focus.ts';
	import { croppedBacking, croppedThumbnail } from './experience/thumbnails.svelte.ts';
	import { Check, ChevronDown } from './icons.ts';
	import PopoverArrow from './PopoverArrow.svelte';
	import Sprite from './Sprite.svelte';
	import { ui } from './state.svelte.ts';

	let {
		clips,
		selected,
		label,
		thumbnail,
		triggerImage,
		disabled = false,
		onselect
	}: {
		clips: readonly RigAnimation[];
		selected: string;
		label: (id: string) => string;
		thumbnail: (id: string) => Img | null;
		triggerImage: Img | null;
		disabled?: boolean;
		onselect: (id: string) => void;
	} = $props();

	const menuId = $props.id();
	const states = $derived(clips.filter((clip) => clipKind(clip) === 'state'));
	const moves = $derived(clips.filter((clip) => clipKind(clip) === 'move'));
	const fieldLabel = $derived(t('stateCapture.source'));
	let menu: HTMLDivElement;
	let expanded = $state(false);
</script>

<div class="field source-field">
	<span class="label" aria-hidden="true">{fieldLabel}</span>
	<button
		type="button"
		class="source-trigger bu-action"
		data-variant="field"
		aria-label="{fieldLabel}: {label(selected)}"
		aria-haspopup="menu"
		aria-expanded={expanded}
		popovertarget={menuId}
		{disabled}
		onkeydown={(event) => {
			if (!expanded && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
				event.preventDefault();
				menu.showPopover({ source: event.currentTarget });
			}
		}}
	>
		{@render thumb(triggerImage, label(selected))}
		<span class="source-value">{label(selected)}</span>
		<ChevronDown size={16} aria-hidden="true" />
	</button>
</div>
<div
	id={menuId}
	class={['menu source-menu bu-popover-anchor', { 'two-columns': states.length && moves.length }]}
	data-placement="bottom-start"
	popover
	role="menu"
	aria-label={fieldLabel}
	tabindex={-1}
	bind:this={menu}
	ontoggle={(event) => {
		expanded = event.newState === 'open';
		popoverFocus(event);
	}}
	onkeydown={(event) => {
		if (event.key === 'Tab')
			requestAnimationFrame(() => {
				if (menu.matches(':popover-open')) menu.hidePopover();
			});
		const items = [...menu.querySelectorAll<HTMLElement>('[role=menuitemradio]')];
		const at = items.indexOf(document.activeElement as HTMLElement);
		const target =
			event.key === 'ArrowDown'
				? items[(at + 1) % items.length]
				: event.key === 'ArrowUp'
					? items[(at - 1 + items.length) % items.length]
					: event.key === 'Home'
						? items[0]
						: event.key === 'End'
							? items.at(-1)
							: undefined;
		if (!target) return;
		event.preventDefault();
		target.focus();
	}}
>
	<PopoverArrow />
	<div class="menu-surface bu-popover-surface bu-floating">
		<div class="source-groups">
			{@render group(t('experience.tabStates'), states)}
			{@render group(t('experience.tabMoves'), moves)}
		</div>
	</div>
</div>

{#snippet thumb(image: Img | null, name: string)}
	{@const art = image && croppedThumbnail(image)}
	<span class="source-thumb" aria-hidden="true"
		><Sprite
			img={art ?? null}
			k={art ? croppedBacking(32, art, ui.dpr) : 1}
			fitToBox={!!art && (art.w > 32 || art.h > 32)}
			label={name}
		/></span
	>
{/snippet}

{#snippet group(heading: string, entries: readonly RigAnimation[])}
	{#if entries.length}
		<div role="group" aria-label={heading}>
			<div class="menu-sec" aria-hidden="true">{heading}</div>
			{#each entries as { id } (id)}
				<button
					type="button"
					class="row source-row bu-action"
					data-variant="quiet"
					role="menuitemradio"
					aria-checked={selected === id}
					tabindex={-1}
					onclick={() => {
						if (selected !== id) onselect(id);
						menu.hidePopover();
					}}
				>
					{@render thumb(thumbnail(id), label(id))}
					<span class="source-name">{label(id)}</span>
					{#if selected === id}<Check size={16} aria-hidden="true" />{/if}
				</button>
			{/each}
		</div>
	{/if}
{/snippet}

<style>
	.source-field {
		display: grid;
		gap: 4px;
	}
	.source-trigger {
		display: flex;
		align-items: center;
		gap: 8px;
		inline-size: 100%;
		min-block-size: 48px;
		padding: 4px 12px 4px 6px;
		font-size: 16px;
		text-align: start;
	}
	.source-trigger :global(svg) {
		flex: none;
		margin-inline-start: auto;
	}
	.source-value,
	.source-name {
		min-inline-size: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.source-name {
		flex: 1;
	}
	.source-thumb {
		flex: none;
		display: grid;
		place-items: center;
		inline-size: 36px;
		block-size: 36px;
	}
	:global(.studio-app) .source-menu {
		width: min(280px, calc(100vw - 16px));
	}
	.source-groups {
		display: grid;
		gap: 8px;
	}
	@media (min-width: 520px) {
		:global(.studio-app) .source-menu.two-columns {
			width: 440px;
		}
		.two-columns .source-groups {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0;
		}
		.two-columns [role='group']:first-child {
			padding-inline-end: 8px;
		}
		.two-columns [role='group'] + [role='group'] {
			border-inline-start: 1px solid var(--bu-line);
			padding-inline-start: 8px;
		}
	}
	.source-menu .source-row {
		justify-content: flex-start;
		gap: 8px;
		height: auto;
		min-height: 44px;
		padding: 4px 8px 4px 4px;
		font-size: inherit;
		text-align: start;
	}
	.source-row :global(svg) {
		flex: none;
	}
</style>
