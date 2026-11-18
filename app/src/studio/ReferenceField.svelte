<script lang="ts">
	import { readReference, type PickedReference } from '../lib/image/reference.ts';
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import { X } from './icons.ts';

	let {
		value = $bindable(),
		loading = $bindable(false),
		max,
		inspectColors = false,
		hint,
		issue = '',
		disabled = false
	}: {
		value?: PickedReference;
		loading?: boolean;
		max: number;
		inspectColors?: boolean;
		hint: string;
		issue?: string;
		disabled?: boolean;
	} = $props();
	const helpId = $props.id();
	let input: HTMLInputElement;
	let drop: HTMLButtonElement;
	let dragging = $state(false);
	let error = $state('');
	async function choose(files: FileList | undefined | null) {
		if (!files?.length || loading || disabled) return;
		error = '';
		if (files.length !== 1) {
			value = undefined;
			error = 'No reference attached. Choose one image at a time.';
			return;
		}
		loading = true;
		try {
			value = await readReference(files[0], max, inspectColors);
		} catch (failure) {
			value = undefined;
			error = `No reference attached. ${failure instanceof Error ? failure.message : 'This image could not be opened.'}`;
		} finally {
			loading = false;
		}
	}
</script>

<div class="reference">
	<span class="label">Reference <span class="faint">(optional)</span></span>
	<div class="reference-row">
		<button
			type="button"
			class="bu-action drop"
			bind:this={drop}
			data-variant={dragging ? 'primary' : 'outline'}
			aria-describedby={helpId}
			disabled={disabled || loading}
			onclick={() => input.click()}
			ondragover={(event) => {
				if (!event.dataTransfer?.types.includes('Files')) return;
				event.preventDefault();
				dragging = !disabled && !loading;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={(event) => {
				event.preventDefault();
				dragging = false;
				void choose(event.dataTransfer?.files);
			}}
		>
			{#if value}
				<img src={`data:image/png;base64,${value.base64}`} alt="" />
			{:else}
				<ImagePlus size={18} />
			{/if}
			<span class="reference-copy">
				<span>{loading ? 'Opening image…' : value ? 'Replace image' : 'Add image'}</span>
				{#if value}<small title={value.name}>{value.name} · {value.width} × {value.height} px</small
					>{/if}
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
	<small class="faint" id={helpId}
		>{hint} Drop or choose one PNG, JPEG, or WebP, up to {max} × {max} px and 8 MB. Sent to PixelLab when
		you generate.</small
	>
	{#if error || issue}<small role="alert">{error || issue}</small>{/if}
</div>

<style>
	.reference {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
	}
	.reference-row {
		display: flex;
		gap: 0.35rem;
	}
	.drop {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		justify-content: flex-start;
	}
	.drop > :global(svg),
	.drop img {
		flex: none;
		pointer-events: none;
	}
	.drop img {
		width: 32px;
		height: 32px;
		object-fit: contain;
	}
	.reference-copy {
		display: grid;
		min-width: 0;
		text-align: left;
		pointer-events: none;
	}
	.reference-copy small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.remove {
		min-width: 44px;
		min-height: 44px;
	}
</style>
