<script lang="ts">
	// One status in a small rounded chip: neutral, a warning or done, with its glyph (a spinner while busy).
	import { CircleCheck, LoaderCircle, TriangleAlert } from './icons.ts';

	let {
		tone,
		label,
		busy = false
	}: { tone: 'warn' | 'ok' | 'neutral'; label: string; busy?: boolean } = $props();
</script>

<span class="window-status" data-tone={tone}
	>{#if tone === 'warn'}<TriangleAlert
			size={12}
			aria-hidden="true"
		/>{:else if tone === 'ok'}<CircleCheck
			size={12}
			aria-hidden="true"
		/>{:else if busy}<LoaderCircle size={12} aria-hidden="true" />{/if}{label}</span
>

<style>
	.window-status {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 1px 8px;
		border-radius: 999px;
		border: 1px solid var(--bu-line);
		font-size: var(--fs-xs, 12px);
		line-height: 18px;
		white-space: nowrap;
		color: var(--text-2);
	}
	.window-status[data-tone='warn'] {
		color: var(--warn);
		border-color: color-mix(in srgb, var(--warn) 45%, transparent);
	}
	.window-status[data-tone='ok'] {
		color: var(--ok);
		border-color: color-mix(in srgb, var(--ok) 45%, transparent);
	}
</style>
