<script lang="ts">
	// Every facing of what a View and edit window shows, in one seamless strip: each facing opens it full size, a facing with
	// no frames shows a missing-image icon in place, and one corner glyph marks the whole strip as openable.
	import { t } from 'svelte-whisper';
	import type { Img } from '../lib/image/png.ts';
	import type { RigDirection } from '../lib/store/manifest.ts';
	import { displayDirection } from './displayDirection.ts';
	import { ImageOff, Maximize } from './icons.ts';
	import Sprite from './Sprite.svelte';

	let {
		label,
		directions,
		image,
		drawn,
		name,
		tile,
		k,
		empty,
		onopen
	}: {
		/** The strip's accessible name. */
		label: string;
		directions: readonly RigDirection[];
		/** The facing's art at the shown frame, when it has any. */
		image: (direction: RigDirection) => Img | null | undefined;
		drawn: (direction: RigDirection) => boolean;
		/** What is shown, for each facing's accessible name. */
		name: string;
		tile: number;
		k: number;
		/** Said in place of the strip when there are no facings to show. */
		empty: string;
		onopen: (direction: RigDirection['id']) => void;
	} = $props();
</script>

<section class="facing-strip" aria-label={label}>
	<div
		class="window-views"
		style:--cols={Math.min(4, directions.length || 1)}
		style:--tile="{tile}px"
	>
		{#each directions as direction (direction.id)}
			{@const has = drawn(direction)}
			{@const art = image(direction)}
			{@const title = t('itemPane.labelNameFacingId', { name, id: displayDirection(direction.id) })}
			<button
				class="window-view bu-action"
				data-variant="quiet"
				data-missing={!has || undefined}
				aria-haspopup="dialog"
				aria-label={has
					? t('itemPane.openSprite', { title })
					: t('itemPane.openMissingView', { direction: displayDirection(direction.id) })}
				onclick={() => onopen(direction.id)}
			>
				<span class="view-art" aria-hidden="true">
					{#if has && art}<Sprite img={art} {k} limit={tile} label={title} />{:else}<span
							class="view-missing"
							title={t('itemPane.missingView')}><ImageOff size={24} strokeWidth={1.5} /></span
						>{/if}
				</span>
				<span class="view-caption">{displayDirection(direction.id)}</span>
			</button>
		{/each}
		{#if directions.length}<span class="view-enlarge" aria-hidden="true"
				><Maximize size={14} /></span
			>{:else}<p class="muted small preview-empty">{empty}</p>{/if}
	</div>
</section>

<style>
	.facing-strip {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 6px;
	}
	/* The facings touch: one seamless strip where every point opens a view, so no gap can swallow a tap. Its corners clip
	   the hover of the corner tiles. */
	.window-views {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
		background: var(--stage);
		border-radius: var(--r-card);
		overflow: hidden;
	}
	.window-view {
		display: grid;
		grid-template-rows: var(--tile, 64px) auto;
		justify-items: center;
		align-items: center;
		gap: 4px;
		min-width: 0;
		padding: 12px 4px 8px;
		border-radius: 0;
		font-size: var(--fs-sm);
		color: var(--text-2);
		cursor: zoom-in;
	}
	/* Inside the strip, so its clipped corners keep the whole ring. */
	.window-view:focus-visible {
		outline-offset: -2px;
	}
	/* Pressing sinks the art a little: the theme's hover shows the target, this shows the press. */
	.window-view:active .view-art {
		transform: scale(0.94);
	}
	.view-art {
		display: grid;
		place-items: center;
		width: 100%;
		height: var(--tile, 64px);
		transition: transform var(--dur);
	}
	/* One glyph for the strip, docked in its corner: any facing opens full size. Not a control; it lights up while a
	   facing is hovered or focused. */
	.view-enlarge {
		position: absolute;
		inset-block-start: 8px;
		inset-inline-end: 8px;
		display: grid;
		color: var(--text-3);
		pointer-events: none;
		transition: color var(--dur);
	}
	.window-views:has(.window-view:is(:hover, :focus-visible)) .view-enlarge {
		color: var(--text);
	}
	/* A facing with no frames: just a missing-image icon where its art would be, so the strip keeps one rhythm. */
	.view-missing {
		display: grid;
		place-items: center;
		color: var(--text-3);
	}
	.window-view[data-missing] .view-caption {
		color: var(--warn);
	}
	.view-caption {
		max-width: 100%;
		overflow-wrap: anywhere;
		text-align: center;
	}
	.preview-empty {
		grid-column: 1 / -1;
		margin: 0;
		padding: 16px 8px;
		text-align: center;
	}
</style>
