<script lang="ts">
	import {
		REFERENCE_MAX_MB,
		readReference,
		type PickedReference,
		type ReferenceSize
	} from '../lib/image/reference.ts';
	import Upload from '@lucide/svelte/icons/upload';
	import { onDestroy } from 'svelte';
	import { X } from './icons.ts';

	let {
		value = $bindable(),
		loading = $bindable(false),
		max,
		compact = false,
		inspectColors = false,
		hint,
		issue = '',
		disabled = false
	}: {
		value?: PickedReference;
		loading?: boolean;
		max: ReferenceSize;
		compact?: boolean;
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
	let error = $state('');
	let announcement = $state('');
	let active = true;
	onDestroy(() => {
		active = false;
		if (loading) loading = false;
	});
	const empty = $derived(!value && !dragging);
	const resizeNotice = $derived(
		value?.resizedFrom
			? `Resized from ${value.resizedFrom.width} × ${value.resizedFrom.height} to ${value.width} × ${value.height} px.`
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
			error = 'No reference attached. Choose one image at a time.';
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
					if (active && limitChanged()) continue;
					throw failure;
				}
				if (limitChanged()) continue;
				if (!active) return;
				value = prepared;
				announcement = 'Reference attached.';
				break;
			}
		} catch (failure) {
			if (!active) return;
			value = undefined;
			error = `No reference attached. ${failure instanceof Error ? failure.message : 'This image could not be opened.'}`;
		} finally {
			if (active) loading = false;
		}
	}
</script>

<svelte:window ondragover={preventMissedFileDrop} ondrop={preventMissedFileDrop} />

<div class={['reference', { compact }]}>
	<span class="label">Reference <span class="faint">(optional)</span></span>
	<div class="reference-row">
		<button
			type="button"
			class={['drop', { attached: !!value }, empty ? 'bu-tile bu-focus' : 'bu-action']}
			bind:this={drop}
			data-variant={empty ? 'empty' : dragging ? 'primary' : 'outline'}
			aria-label={loading
				? 'Opening image'
				: value
					? 'Choose a different reference image'
					: 'Add image'}
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
				<Upload size={compact ? 18 : 22} />
			{/if}
			<span class="reference-copy">
				{#if value}
					<small class="reference-file" id={fileId}>
						<span class="filename" title={value.name}>{value.name}</span>
						<span>{value.width} × {value.height} px</span>
					</small>
				{:else}
					<span>{loading ? 'Opening image…' : 'Add image'}</span>
					{#if !loading}<small class="faint" aria-hidden="true">Drop here or browse</small>{/if}
				{/if}
			</span>
		</button>
		{#if value}
			<button
				type="button"
				class="bu-action remove"
				data-variant="outline"
				aria-label="Remove reference"
				disabled={disabled || loading}
				onclick={() => {
					value = undefined;
					error = '';
					announcement = 'Reference removed.';
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
	<small class="faint" id={helpId}
		>{hint} Max {max.width} × {max.height} px, {REFERENCE_MAX_MB} MB.</small
	>
	{#if error || issue}<small role="alert">{error || issue}</small>{/if}
	{#if resizeNotice}<small>{resizeNotice}</small>{/if}
	<span class="reference-announcement" role="status"
		>{loading ? '' : resizeNotice || announcement}</span
	>
</div>

<style>
	.reference {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
	}
	.reference-row {
		display: flex;
		align-items: stretch;
		gap: 0.35rem;
		block-size: 112px;
	}
	.compact .reference-row {
		block-size: 54px;
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
	.compact .drop {
		flex-direction: row;
		justify-content: flex-start;
		gap: 10px;
	}
	.drop.attached {
		padding-block: 4px;
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
	.compact .drop .reference-thumbnail {
		flex: none;
		width: auto;
		height: 100%;
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
	.compact .reference-copy {
		text-align: left;
	}
	.reference-file {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
	}
	.compact .reference-file {
		grid-template-columns: minmax(0, auto) max-content;
		gap: 8px;
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
