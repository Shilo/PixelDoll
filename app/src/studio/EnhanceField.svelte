<script lang="ts">
	// Every prompt field's Enhance: a quiet icon button tucked into the field's top-right corner. The text keeps clear
	// of it, and its tap area reaches left and down into the field's padding rather than out over the border.
	import type { Snippet } from 'svelte';
	import { t } from 'svelte-whisper';
	import { LoaderCircle, Undo2, WandSparkles } from './icons.ts';

	let {
		children,
		busy = false,
		undo = false,
		disabled = false,
		cost,
		onenhance
	}: {
		/** The text field the button enhances. */
		children: Snippet;
		busy?: boolean;
		/** The text is the last enhancement, so the button restores what was there before. */
		undo?: boolean;
		disabled?: boolean;
		/** The price shown in the tooltip, such as "Est. 0.05 gens". */
		cost?: string;
		onenhance: () => void;
	} = $props();

	const label = $derived(
		t(undo ? 'common.undo' : busy ? 'create.form.enhancing' : 'create.form.enhance')
	);
	// A scrollbar takes the field's right edge when the text overflows, so the button steps left of it.
	let field: HTMLDivElement;
	let gutter = $state(0);
	function measure() {
		const area = field.querySelector('textarea');
		if (!area) return;
		const style = getComputedStyle(area);
		gutter =
			area.offsetWidth -
			area.clientWidth -
			parseFloat(style.borderLeftWidth) -
			parseFloat(style.borderRightWidth);
	}
	$effect(() => {
		const area = field.querySelector('textarea');
		if (!area) return;
		const resize = new ResizeObserver(measure);
		resize.observe(area);
		area.addEventListener('input', measure);
		return () => {
			resize.disconnect();
			area.removeEventListener('input', measure);
		};
	});
	// Enhance and Undo replace the text without an input event.
	$effect(() => {
		void undo;
		void busy;
		measure();
	});
	// The price rides in the tooltip, which is also the button's accessible description.
	const hint = $derived(
		undo ? t('create.form.undoTitle') : cost ? `${t('create.form.enhance')} · ${cost}` : undefined
	);
</script>

<div class="enhance-field" bind:this={field} style:--gutter="{gutter}px">
	{@render children()}
	<button
		class="bu-action enhance-icon"
		data-variant="quiet"
		type="button"
		aria-label={label}
		title={hint}
		aria-busy={busy}
		disabled={disabled || busy}
		onclick={onenhance}
	>
		{#if busy}<LoaderCircle size={16} class="spin" />{:else if undo}<Undo2
				size={16}
			/>{:else}<WandSparkles size={16} />{/if}
	</button>
</div>

<style>
	.enhance-field {
		position: relative;
		display: grid;
		min-inline-size: 0;
	}
	/* Room on the right so the text never runs under the icon. */
	.enhance-field > :global(textarea) {
		padding-inline-end: 36px;
	}
	.enhance-icon {
		position: absolute;
		inset-block-start: 1px;
		inset-inline-end: calc(1px + var(--gutter, 0px));
		inline-size: 40px;
		block-size: 40px;
		min-block-size: 0;
		display: grid;
		place-items: start end;
		padding: 7px 7px 0 0;
		background: none;
		border: 0;
		border-radius: 0 var(--r-ctl) 0 var(--r-ctl);
		color: var(--accent-text);
	}
	.enhance-icon:disabled {
		color: var(--bu-muted);
		opacity: 0.6;
	}
	@media (pointer: coarse) {
		.enhance-icon {
			inline-size: 44px;
			block-size: 44px;
		}
	}
	.enhance-icon :global(.spin) {
		animation: enhance-spin 0.9s linear infinite;
	}
	@media (prefers-reduced-motion: reduce) {
		.enhance-icon :global(.spin) {
			animation: none;
		}
	}
	@keyframes enhance-spin {
		to {
			rotate: 360deg;
		}
	}
</style>
