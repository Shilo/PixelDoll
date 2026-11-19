<script lang="ts">
	import { REFERENCE_MAX_MB, readReference, type PickedReference } from '../lib/image/reference.ts';
	import Upload from '@lucide/svelte/icons/upload';
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
		max: number;
		compact?: boolean;
		inspectColors?: boolean;
		hint: string;
		issue?: string;
		disabled?: boolean;
	} = $props();
	const id = $props.id();
	const helpId = `${id}-help`;
	const actionId = `${id}-action`;
	const fileId = `${id}-file`;
	let input: HTMLInputElement;
	let drop: HTMLButtonElement;
	let dragging = $state(false);
	let error = $state('');
	let announcement = $state('');
	const empty = $derived(!value && !dragging);
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
		loading = true;
		try {
			value = await readReference(files[0], max, inspectColors);
			announcement = 'Reference attached.';
		} catch (failure) {
			value = undefined;
			error = `No reference attached. ${failure instanceof Error ? failure.message : 'This image could not be opened.'}`;
		} finally {
			loading = false;
		}
	}
</script>

<svelte:window ondragover={preventMissedFileDrop} ondrop={preventMissedFileDrop} />

<div class={['reference', { compact }]}>
	<span class="label">Reference <span class="faint">(optional)</span></span>
	<div class="reference-row">
		<button
			type="button"
			class={['drop', empty ? 'bu-tile bu-focus' : 'bu-action']}
			bind:this={drop}
			data-variant={empty ? 'empty' : dragging ? 'primary' : 'outline'}
			aria-labelledby={actionId}
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
				<img src={`data:image/png;base64,${value.base64}`} alt="" />
			{:else}
				<Upload size={compact ? 18 : 22} />
			{/if}
			<span class="reference-copy">
				<span id={actionId}
					>{loading ? 'Opening image…' : value ? 'Replace image' : 'Add image'}</span
				>
				{#if value}
					<small class="reference-file" id={fileId}>
						<span class="filename" title={value.name}>{value.name}</span>
						<span>{value.width} × {value.height} px</span>
					</small>
				{:else if !loading}
					<small class="faint" aria-hidden="true">Drop here or browse</small>
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
		onchange={() => {
			void choose(input.files);
			input.value = '';
		}}
	/>
	<small class="faint" id={helpId}>{hint} Max {max} × {max} px, {REFERENCE_MAX_MB} MB.</small>
	{#if error || issue}<small role="alert">{error || issue}</small>{/if}
	<span class="reference-announcement" role="status">{announcement}</span>
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
	}
	.drop {
		flex: 1;
		min-width: 0;
		min-height: 112px;
		padding: 8px 12px;
		flex-direction: column;
		justify-content: center;
		gap: 6px;
	}
	.compact .drop {
		min-height: 54px;
		flex-direction: row;
		justify-content: flex-start;
		gap: 10px;
	}
	.drop > :global(svg),
	.drop img {
		flex: none;
		pointer-events: none;
	}
	.drop img {
		width: 40px;
		height: 40px;
		object-fit: contain;
		image-rendering: pixelated;
	}
	.compact .drop img {
		width: 32px;
		height: 32px;
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
