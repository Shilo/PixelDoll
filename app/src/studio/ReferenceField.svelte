<script lang="ts">
	import {
		REFERENCE_MAX_MB,
		readReference,
		type PickedReference,
		type ReferenceSize
	} from '../lib/image/reference.ts';
	import Upload from '@lucide/svelte/icons/upload';
	import { onDestroy, type Snippet } from 'svelte';
	import { t } from 'svelte-whisper';
	import { errorMessage, message, type Message } from '../lib/message.ts';
	import { displayNestedMessage } from './nestedMessage.ts';
	import { X } from './icons.ts';
	import PopoverArrow from './PopoverArrow.svelte';
	import { popoverFocus } from './experience/focus.ts';

	let {
		value = $bindable(),
		loading = $bindable(false),
		max,
		sideBySide = false,
		inspectColors = false,
		label,
		hint,
		issue = '',
		disabled = false,
		exactFrame = false,
		caption,
		thumbnail,
		beforePick,
		picker,
		removeLabel,
		onremove
	}: {
		value?: PickedReference;
		loading?: boolean;
		max: ReferenceSize;
		sideBySide?: boolean;
		inspectColors?: boolean;
		label?: string;
		hint: string;
		issue?: string;
		disabled?: boolean;
		exactFrame?: boolean;
		caption?: string;
		thumbnail?: Snippet;
		beforePick?: (accept: () => void) => void;
		picker?: Snippet<[() => void, () => void]>;
		removeLabel?: string;
		onremove?: () => void;
	} = $props();
	const id = $props.id();
	const helpId = `${id}-help`;
	const fileId = `${id}-file`;
	const pickerId = `${id}-picker`;
	let menu = $state<HTMLElement>();
	let input: HTMLInputElement;
	let drop: HTMLButtonElement;
	let dragging = $state(false);
	let error = $state<Message | ''>('');
	let announcement = $state<Message | ''>('');
	let active = true;
	onDestroy(() => {
		active = false;
		if (loading) loading = false;
	});
	const empty = $derived(!value && !dragging);
	const limits = $derived(
		t('referenceField.limits', {
			width: max.width,
			height: max.height,
			mb: REFERENCE_MAX_MB
		})
	);
	const resizeNotice = $derived(
		value?.resizedFrom
			? message('referenceField.resized', {
					fromWidth: value.resizedFrom.width,
					fromHeight: value.resizedFrom.height,
					width: value.width,
					height: value.height
				})
			: ''
	);
	function preventMissedFileDrop(event: DragEvent) {
		if (event.defaultPrevented || !event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'none';
		dragging = false;
	}
	function pick(accept: () => void) {
		if (disabled || loading) return;
		if (beforePick) beforePick(accept);
		else accept();
	}
	async function choose(files: ArrayLike<File> | undefined | null) {
		if (!files?.length || loading || disabled) return;
		error = '';
		announcement = '';
		if (files.length !== 1) {
			if (!exactFrame) value = undefined;
			error = message('referenceField.error', {
				reason: message('referenceField.oneAtATime')
			});
			return;
		}
		const file = files[0];
		loading = true;
		try {
			while (active) {
				const limit = max;
				const limitChanged = () => limit.width !== max.width || limit.height !== max.height;
				let prepared: PickedReference;
				try {
					prepared = await readReference(file, limit, inspectColors, exactFrame);
				} catch (failure) {
					if (active && !disabled && limitChanged()) continue;
					throw failure;
				}
				if (!active || disabled) return;
				if (limitChanged()) continue;
				value = prepared;
				announcement = message('referenceField.attached');
				break;
			}
		} catch (failure) {
			if (!active || disabled) return;
			if (!exactFrame) value = undefined;
			error = message('referenceField.error', {
				reason:
					failure instanceof Error ? errorMessage(failure) : message('referenceField.unreadable')
			});
		} finally {
			if (active) loading = false;
		}
	}
</script>

<svelte:window ondragover={preventMissedFileDrop} ondrop={preventMissedFileDrop} />

<div
	class={['reference', { 'side-by-side': sideBySide, attached: !!value, 'move-frame': exactFrame }]}
>
	<span class="label reference-label"
		>{label ?? t('referenceField.label')}{#if !exactFrame}{' '}<span class="faint"
				>{t('common.optional')}</span
			>{/if}</span
	>
	<div class="reference-row">
		<button
			type="button"
			class={['drop', empty ? 'bu-tile bu-focus' : 'bu-action']}
			bind:this={drop}
			data-variant={empty ? 'empty' : dragging ? 'primary' : 'outline'}
			aria-label={exactFrame && label
				? label
				: loading
					? t('referenceField.openingLabel')
					: value
						? t('referenceField.chooseDifferent')
						: t('referenceField.addImage')}
			aria-describedby={exactFrame && !hint
				? fileId
				: value || exactFrame
					? `${fileId} ${helpId}`
					: helpId}
			aria-disabled={disabled || loading}
			popovertarget={picker && !disabled && !loading ? pickerId : undefined}
			aria-haspopup={picker && !disabled ? 'dialog' : undefined}
			title={exactFrame && !loading ? (value?.name ?? caption) : undefined}
			onclick={() => {
				if (picker) return;
				pick(() => {
					if (active) input.click();
				});
			}}
			ondragover={(event) => {
				if (!event.dataTransfer?.types.includes('Files')) return;
				event.preventDefault();
				dragging = !disabled && !loading;
				event.dataTransfer.dropEffect = dragging ? 'copy' : 'none';
			}}
			ondragleave={() => (dragging = false)}
			ondrop={(event) => {
				if (!event.dataTransfer?.types.includes('Files')) return;
				event.preventDefault();
				dragging = false;
				const files = Array.from(event.dataTransfer.files);
				if (files.length)
					pick(() => {
						if (active) void choose(files);
					});
			}}
		>
			{#if value}
				<svg class="reference-thumbnail" viewBox={value.previewBox} aria-hidden="true">
					<image
						href={`data:image/png;base64,${value.base64}`}
						width={value.width}
						height={value.height}
					/>
				</svg>
			{:else if thumbnail}
				{@render thumbnail()}
			{:else if !disabled}
				<Upload size={22} />
			{/if}
			<span class="reference-copy">
				{#if value}
					<small class="reference-file" id={fileId}>
						<span class="filename" title={value.name}>{value.name}</span>
						<span class="faint dimensions"
							>{t('share.resolution', { width: value.width, height: value.height })}</span
						>
					</small>
				{:else if !exactFrame || !disabled}
					<span class="reference-caption" id={fileId}
						>{loading
							? t('referenceField.opening')
							: (caption ?? t('referenceField.addImage'))}</span
					>
					{#if !loading && !disabled}<small class="faint reference-drop-hint" aria-hidden="true"
							>{t('referenceField.dropHint')}</small
						>{/if}
				{/if}
			</span>
		</button>
		{#if picker && !disabled}
			<div
				id={pickerId}
				class="bu-popover-anchor"
				data-placement="bottom-start"
				popover
				role="dialog"
				aria-label={label}
				ontoggle={popoverFocus}
				bind:this={menu}
			>
				<PopoverArrow />
				<div class="bu-popover-surface bu-floating">
					{@render picker(
						() => {
							menu?.hidePopover();
							pick(() => input.click());
						},
						() => {
							menu?.hidePopover();
							drop.focus();
						}
					)}
				</div>
			</div>
		{/if}
		{#if exactFrame && disabled}
			<span class="frame-unavailable" id={fileId}
				><span class="reference-caption">{caption}</span></span
			>
		{/if}
		{#if value || (thumbnail && onremove)}
			<button
				type="button"
				class="bu-action remove"
				data-variant={exactFrame ? 'quiet' : 'outline'}
				aria-label={removeLabel ?? t('referenceField.remove')}
				disabled={disabled || loading}
				onclick={() => {
					if (onremove) onremove();
					else value = undefined;
					error = '';
					announcement = message('referenceField.removed');
					drop.focus();
				}}><X size={16} /></button
			>
		{/if}
	</div>
	<input
		type="file"
		accept={exactFrame ? 'image/png' : 'image/png,image/jpeg,image/webp'}
		hidden
		bind:this={input}
		oncancel={(event) => event.stopPropagation()}
		onchange={() => {
			void choose(input.files);
			input.value = '';
		}}
	/>
	{#if hint || !exactFrame}
		<small class="faint" id={helpId}
			>{exactFrame ? hint : hint ? `${hint} ${limits}` : limits}</small
		>
	{/if}
	{#if error || issue}<small role="alert">{displayNestedMessage(error || issue)}</small>{/if}
	{#if resizeNotice}<small>{displayNestedMessage(resizeNotice)}</small>{/if}
	<span class="reference-announcement" role="status"
		>{loading ? '' : displayNestedMessage(resizeNotice || announcement)}</span
	>
</div>

<style>
	.reference {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
	}
	.reference-label {
		color: var(--text);
	}
	.move-frame {
		align-content: start;
		container-type: inline-size;
	}
	.move-frame .reference-label {
		font-size: var(--fs-sm);
	}
	.reference-row {
		display: flex;
		align-items: stretch;
		gap: 0.35rem;
		block-size: 112px;
	}
	.side-by-side .reference-row {
		--item-reference-cap: 80px;
		block-size: var(--item-reference-cap);
		max-block-size: var(--item-reference-cap);
	}
	.side-by-side:not(.attached) .reference-row {
		block-size: auto;
		min-block-size: 44px;
	}
	.move-frame.side-by-side .reference-row {
		position: relative;
		block-size: 68px;
	}
	.drop {
		flex: 1;
		min-width: 0;
		min-height: 0;
		padding: 8px 12px;
		flex-direction: column;
		justify-content: center;
		gap: 6px;
	}
	.side-by-side .drop {
		flex-direction: row;
		justify-content: flex-start;
		gap: 10px;
	}
	.side-by-side:not(.attached) .drop {
		padding-block: 4px;
	}
	.attached .drop {
		padding: 2px 4px;
	}
	.move-frame.side-by-side .drop {
		padding-inline: 8px;
		gap: 6px;
	}
	.move-frame.side-by-side .reference-row:has(.remove) .drop {
		padding-inline-end: 44px;
	}
	.move-frame .remove {
		position: absolute;
		inset-block-start: 50%;
		inset-inline-end: 0;
		translate: 0 -50%;
	}
	.frame-unavailable {
		position: absolute;
		inset: 0;
		display: grid;
		align-content: center;
		padding-inline: 8px;
		pointer-events: none;
	}
	.drop > :global(svg) {
		flex: none;
		pointer-events: none;
	}
	.drop .reference-thumbnail {
		flex: 1;
		width: 100%;
		height: 0;
		min-height: 0;
		overflow: hidden;
		image-rendering: pixelated;
	}
	.side-by-side .drop .reference-thumbnail {
		flex: none;
		width: auto;
		height: 100%;
		max-height: calc(var(--item-reference-cap) - 6px);
		max-width: calc(100% - min(50%, 8rem) - 10px);
	}
	.reference-copy {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		min-width: 0;
		max-width: 100%;
		text-align: center;
		pointer-events: none;
	}
	.side-by-side .reference-copy {
		text-align: left;
	}
	.reference-file {
		display: grid;
		grid-template-columns: minmax(0, auto) max-content;
		gap: 8px;
	}
	.side-by-side .reference-file {
		grid-template-columns: minmax(0, 1fr);
		gap: 2px;
	}
	.dimensions {
		white-space: nowrap;
	}
	.move-frame .dimensions {
		display: none;
	}
	.reference-copy .filename {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.move-frame .reference-copy {
		min-height: 0;
		overflow: hidden;
	}
	.move-frame .reference-caption {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.move-frame .reference-drop-hint {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@container (width < 166px) {
		.move-frame.side-by-side .drop {
			flex-direction: column;
			justify-content: center;
			gap: 2px;
		}
		.move-frame.side-by-side .drop .reference-thumbnail,
		.move-frame .drop > :global(img),
		.move-frame .drop :global(.sprite-box > canvas) {
			max-height: 22px;
			max-width: 100%;
			object-fit: contain;
		}
		.move-frame .reference-copy {
			width: 100%;
			text-align: center;
		}
		.move-frame .reference-drop-hint {
			display: none;
		}
	}
	.remove {
		min-width: 44px;
		min-height: 44px;
	}
	.reference-announcement {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
