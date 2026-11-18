<script lang="ts">
	import NoticeLink from './NoticeLink.svelte';

	let { multiline = false }: { multiline?: boolean } = $props();
</script>

<div class="affiliation-spacing">
	<NoticeLink
		href="https://pixellab.ai"
		label="Powered by PixelLab. Not an official app. Visit PixelLab (opens in a new tab)."
	>
		<span class={multiline ? 'multiline' : undefined}
			><span class="affiliation-sentence">Powered by PixelLab.</span>
			<span class="affiliation-sentence bu-muted">Not an official app.</span></span
		>
	</NoticeLink>
</div>

<style>
	.affiliation-sentence {
		display: inline-block;
		max-width: 100%;
	}
	.multiline > .affiliation-sentence {
		display: block;
	}
	:global(.menu) .affiliation-spacing {
		--notice-padding-block: 4px 0;
		--notice-padding-start: 7px;
		--notice-gap: 11px;
	}
</style>
