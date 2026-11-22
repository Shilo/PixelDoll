<script lang="ts">
	// What an agent is looking at, over the Studio: real frames at whole-pixel scale on a flat background, so a screenshot
	// of the page shows the same pixels the tool measured.
	import { t } from 'svelte-whisper';
	import { X } from '../icons.ts';
	import { hideEvidence, panel } from './panel.svelte.ts';
	const id = $props.id();
	let innerWidth = $state(0),
		innerHeight = $state(0);
	/** Shown pixels per artwork pixel: the largest whole number up to each sheet's own scale at which all sheets fit the
	 *  viewport together, so one screenshot holds all of them and each artwork pixel stays an exact square. */
	const fit = $derived.by(() => {
		const images = panel.images,
			width = Math.max(1, ...images.map((image) => image.width)),
			height = images.reduce((sum, image) => sum + image.height, 0) || 1;
		return Math.min((innerWidth - 32) / width, (innerHeight - 48 - 24 * images.length) / height);
	});
	const shownScale = (image: { scale: number }) =>
		Math.max(1, Math.min(image.scale, Math.floor(image.scale * fit)));
</script>

<svelte:window
	bind:innerWidth
	bind:innerHeight
	onkeydown={(e) => {
		if (e.key === 'Escape' && panel.images.length) hideEvidence();
	}}
/>

{#if panel.images.length}
	<section class="agent-evidence" aria-labelledby="{id}-title" data-agent-evidence>
		<header>
			<h2 id="{id}-title">{t('agentEvidence.title', { subject: panel.title })}</h2>
			<button
				class="bu-btn"
				data-variant="ghost"
				aria-label={t('common.close')}
				onclick={hideEvidence}><X size={18} aria-hidden="true" /></button
			>
		</header>
		<div class="sheets">
			{#each panel.images as image (image.label)}
				{@const k = shownScale(image)}
				<figure>
					<figcaption>{image.label} · {k}×</figcaption>
					<img
						src="data:image/png;base64,{image.data}"
						alt={image.label}
						width={(image.width * k) / image.scale}
						height={(image.height * k) / image.scale}
					/>
				</figure>
			{/each}
		</div>
	</section>
{/if}

<style>
	.agent-evidence {
		position: fixed;
		inset: 0;
		z-index: 2147483000;
		display: flex;
		flex-direction: column;
		background: var(--bu-bg, #111);
		color: var(--bu-text, #eee);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 16px;
	}
	h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.sheets {
		flex: 1;
		overflow: auto;
		padding: 0 16px 16px;
	}
	figure {
		margin: 0 0 8px;
	}
	figcaption {
		margin-bottom: 4px;
		font-size: 12px;
	}
	/* Nearest neighbor: a whole-pixel enlargement shown at a smaller whole-pixel factor keeps every artwork pixel square. */
	img {
		display: block;
		max-width: none;
		image-rendering: pixelated;
	}
</style>
