<script lang="ts">
	import {
		REFERENCE_MAX_MB,
		readReference,
		type PickedReference,
		type ReferenceSize
	} from '../lib/image/reference.ts';
	import Upload from '@lucide/svelte/icons/upload';
	import { onDestroy } from 'svelte';
	import { t } from 'svelte-whisper';
	import { errorMessage, message, type Message } from '../lib/message.ts';
	import { displayNestedMessage } from './nestedMessage.ts';
	import { X } from './icons.ts';

	let {
		value = $bindable(),
		loading = $bindable(false),
		max,
		sideBySide = false,
		inspectColors = false,
		hint,
		issue = '',
		disabled = false
	}: {
		value?: PickedReference;
		loading?: boolean;
		max: ReferenceSize;
		sideBySide?: boolean;
		inspectColors?: boolean;
		hint: string;
		issue?: string;
		disabled?: boolean;
	} = $props();
	const id = $props.id();
	const helpId = `${id}-help`;
	const fileId = `${id}-file`;
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
	async function choose(files: FileList | undefined | null) {
		if (!files?.length || loading || disabled) return;
		error = '';
		announcement = '';
		if (files.length !== 1) {
			value = undefined;
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
					prepared = await readReference(file, limit, inspectColors);
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
			value = undefined;
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

<div class={['reference', { 'side-by-side': sideBySide, attached: !!value }]}>
	<span class="label reference-label"
		>{t('referenceField.label')} <span class="faint">{t('common.optional')}</span></span
	>
	<div class="reference-row">
		<button
			type="button"
			class={['drop', empty ? 'bu-tile bu-focus' : 'bu-action']}
			bind:this={drop}
			data-variant={empty ? 'empty' : dragging ? 'primary' : 'outline'}
			aria-label={loading
				? t('referenceField.openingLabel')
				: value
					? t('referenceField.chooseDifferent')
					: t('referenceField.addImage')}
			aria-describedby={value ? `${fileId} ${helpId}` : helpId}
			aria-disabled={disabled || loading}
			onclick={() => {
				if (!disabled && !loading) input.click();
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
				void choose(event.dataTransfer?.files);
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
			{:else}
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
				{:else}
					<span>{loading ? t('referenceField.opening') : t('referenceField.addImage')}</span>
					{#if !loading}<small class="faint" aria-hidden="true"
							>{t('referenceField.dropHint')}</small
						>{/if}
				{/if}
			</span>
		</button>
		{#if value}
			<button
				type="button"
				class="bu-action remove"
				data-variant="outline"
				aria-label={t('referenceField.remove')}
				disabled={disabled || loading}
				onclick={() => {
					value = undefined;
					error = '';
					announcement = message('referenceField.removed');
					drop.focus();
				}}><X size={16} /></button
			>
		{/if}
	</div>
	<input
		type="file"
		accept="image/png,image/jpeg,image/webp"
		hidden
		bind:this={input}
		oncancel={(event) => event.stopPropagation()}
		onchange={() => {
			void choose(input.files);
			input.value = '';
		}}
	/>
	<small class="faint" id={helpId}>{hint} {limits}</small>
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
	.reference-copy .filename {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
