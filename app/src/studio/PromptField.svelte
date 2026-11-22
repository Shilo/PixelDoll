<script lang="ts">
	// Every prompt box: the text above, and a quiet footer inside the field's border with Copy and then Enhance. The
	// field runs the enhancer its `spec` names (character, item, motion or still pose, with any images), keeps the
	// text it replaced for Undo, and drops an answer that arrives after the text or its context changed.
	import { onDestroy } from 'svelte';
	import { formatNumber, t } from 'svelte-whisper';
	import { app } from '../lib/app.svelte.ts';
	import { message, type Message } from '../lib/message.ts';
	import { Check, Copy, LoaderCircle, Undo2, WandSparkles } from './icons.ts';
	import {
		ENHANCE_INPUT_LIMIT,
		enhanceErrorMessage,
		enhancePrompt,
		type EnhanceSpec
	} from './promptEnhance.ts';
	import { toast } from './state.svelte.ts';

	let {
		value,
		onvalue,
		spec = null,
		activity,
		maxOutput,
		accept,
		enhanceDisabled = false,
		onconnect,
		onmessage = (note) => toast(note, { tone: 'warning' }),
		copyLabel,
		busy = $bindable(false),
		disabled = false,
		id,
		label,
		describedby,
		rows = 3,
		placeholder,
		maxlength,
		spellcheck,
		class: className = '',
		onkeydown,
		keyshortcuts
	}: {
		value: string;
		onvalue: (value: string) => void;
		/** The enhancer to run; null leaves only Copy. */
		spec?: EnhanceSpec | null;
		activity: { scope: string; label: string };
		/** The longest enhanced text this field can keep. */
		maxOutput: number;
		/** Turns the enhanced text into this field's text, or rejects it with a notice. */
		accept?: (enhanced: string) => string | Message;
		enhanceDisabled?: boolean;
		/** Without a key, Enhance asks to connect instead of staying disabled. */
		onconnect?: () => void;
		onmessage?: (note: Message | string) => void;
		/** What Copy copies, when "Copy prompt" would be unclear. */
		copyLabel?: string;
		busy?: boolean;
		disabled?: boolean;
		id?: string;
		label?: string;
		describedby?: string;
		rows?: number;
		placeholder?: string;
		maxlength?: number;
		spellcheck?: boolean;
		class?: string;
		onkeydown?: (event: KeyboardEvent) => void;
		keyshortcuts?: string;
	} = $props();

	let area: HTMLTextAreaElement;
	let undo = $state<{ before: string; after: string }>();
	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;
	let abort: AbortController | undefined;
	onDestroy(() => {
		abort?.abort();
		clearTimeout(copyTimer);
	});

	const canUndo = $derived(!!undo && undo.after === value);
	const text = $derived(value.trim());
	const cost = $derived(
		`${t('create.form.enhance')} · ${t('moves.estimate', { gens: formatNumber(0.05) })}`
	);
	const enhanceOff = $derived(
		disabled ||
			busy ||
			enhanceDisabled ||
			!text ||
			(spec !== null && text.length > ENHANCE_INPUT_LIMIT[spec.kind]) ||
			((!app.key || app.keyRejected) && !onconnect)
	);

	/** Restores the text from before the last enhancement. */
	function restore() {
		if (!undo) return;
		onvalue(undo.before);
		undo = undefined;
	}

	/** Runs Enhance. Callers use it to resume after connecting. */
	export async function enhance() {
		if (enhanceOff || !spec) return;
		const key = app.key;
		if (!key || app.keyRejected) {
			onconnect?.();
			return;
		}
		const before = value,
			asked = spec;
		abort = new AbortController();
		busy = true;
		try {
			const enhanced = await enhancePrompt(key, asked, text, maxOutput, abort.signal, activity);
			if (abort.signal.aborted) return;
			if (value !== before || spec !== asked || app.key !== key) {
				onmessage(message('create.form.settingsChanged'));
				return;
			}
			const next = accept ? accept(enhanced) : enhanced;
			if (typeof next !== 'string') {
				onmessage(next);
				return;
			}
			undo = { before, after: next };
			onvalue(next);
		} catch (error) {
			if (!abort.signal.aborted) onmessage(enhanceErrorMessage(error));
		} finally {
			if (!abort.signal.aborted) busy = false;
		}
	}

	/** Forgets Undo when something outside the field changed what the enhancement was based on. */
	export function clearUndo() {
		undo = undefined;
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 2000);
		} catch {
			// Leave the whole text selected so it can be copied by hand.
			area.focus();
			area.select();
			onmessage(message('create.form.selectToCopy'));
		}
	}

	// A scrollbar takes the field's right edge when the text overflows, so the footer stops left of it.
	let gutter = $state(0);
	function measure() {
		const style = getComputedStyle(area);
		gutter =
			area.offsetWidth -
			area.clientWidth -
			parseFloat(style.borderLeftWidth) -
			parseFloat(style.borderRightWidth);
	}
	$effect(() => {
		const resize = new ResizeObserver(measure);
		resize.observe(area);
		return () => resize.disconnect();
	});
	// Enhance, Undo and callers replace the text without an input event.
	$effect(() => {
		void value;
		measure();
	});
</script>

<div class="prompt-field" style:--gutter="{gutter}px">
	<textarea
		bind:this={area}
		{id}
		class="bu-input input {className}"
		{value}
		oninput={(event) => {
			copied = false;
			onvalue(event.currentTarget.value);
		}}
		{onkeydown}
		aria-keyshortcuts={keyshortcuts}
		aria-label={label}
		aria-describedby={describedby}
		{rows}
		{placeholder}
		{maxlength}
		{spellcheck}
		{disabled}></textarea>
	<div class="prompt-actions">
		<!-- Undo appears first so Copy and Enhance never move. -->
		{#if canUndo}
			<button
				class="bu-action"
				data-variant="quiet"
				type="button"
				aria-label={t('common.undo')}
				title={t('create.form.undoTitle')}
				disabled={disabled || busy}
				onclick={restore}><Undo2 size={16} /></button
			>
		{/if}
		<button
			class="bu-action"
			data-variant="quiet"
			type="button"
			aria-label={copied ? t('toolbar.copiedPrompt') : (copyLabel ?? t('toolbar.copyPrompt'))}
			title={copyLabel ?? t('toolbar.copyPrompt')}
			disabled={disabled || !text}
			onclick={copy}
			>{#if copied}<Check size={16} />{:else}<Copy size={16} />{/if}</button
		>
		{#if spec}
			<button
				class="bu-action enhance"
				data-variant="quiet"
				type="button"
				aria-label={t(busy ? 'create.form.enhancing' : 'create.form.enhance')}
				title={cost}
				aria-busy={busy}
				disabled={enhanceOff}
				onclick={() => void enhance()}
			>
				{#if busy}<LoaderCircle size={16} class="spin" />{:else}<WandSparkles size={16} />{/if}
			</button>
		{/if}
	</div>
	<span class="sr" aria-live="polite">{copied ? t('toolbar.copiedPrompt') : ''}</span>
</div>

<style>
	.prompt-field {
		position: relative;
		display: grid;
		min-inline-size: 0;
	}
	/* The footer row lives inside the border, below the text: full-width lines, never a lane down the side. */
	.prompt-field > textarea {
		padding-block-end: 40px;
	}
	.prompt-actions {
		position: absolute;
		inset-block-end: 1px;
		inset-inline: 1px calc(1px + var(--gutter, 0px));
		display: flex;
		justify-content: flex-end;
		gap: 2px;
		padding: 2px 4px;
		background: var(--bu-field);
		border-radius: 0 0 var(--r-ctl) var(--r-ctl);
		pointer-events: none;
	}
	.prompt-actions button {
		pointer-events: auto;
		inline-size: 32px;
		block-size: 32px;
		min-block-size: 0;
		display: grid;
		place-items: center;
		padding: 0;
		color: var(--bu-muted);
	}
	.prompt-actions .enhance {
		color: var(--accent-text);
	}
	.prompt-actions button:disabled {
		color: var(--bu-muted);
		opacity: 0.5;
	}
	@media (pointer: coarse) {
		.prompt-field > textarea {
			padding-block-end: 52px;
		}
		.prompt-actions button {
			inline-size: 44px;
			block-size: 44px;
		}
	}
	.prompt-actions :global(.spin) {
		animation: prompt-spin 0.9s linear infinite;
	}
	@media (prefers-reduced-motion: reduce) {
		.prompt-actions :global(.spin) {
			animation: none;
		}
	}
	@keyframes prompt-spin {
		to {
			rotate: 360deg;
		}
	}
</style>
