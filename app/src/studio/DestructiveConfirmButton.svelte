<script lang="ts">
	import { Trash } from './icons.ts';
	let {
		label,
		confirmLabel,
		disabled,
		onconfirm
	}: { label: string; confirmLabel: string; disabled: boolean; onconfirm: () => void } = $props();
	let armed = $state(false);

	function activate(event: MouseEvent) {
		if (disabled || event.detail > 1) return;
		if (!armed) {
			(event.currentTarget as HTMLButtonElement).focus({ preventScroll: true });
			armed = true;
			return;
		}
		armed = false;
		onconfirm();
	}
</script>

<svelte:window onblur={() => (armed = false)} />
<button
	type="button"
	class="bu-btn destructive-confirm"
	data-variant="danger"
	{disabled}
	onblur={() => (armed = false)}
	onkeydown={(event) => {
		if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
	}}
	onclick={activate}
>
	<Trash size={16} aria-hidden="true" />
	<span aria-live="polite">{armed && !disabled ? confirmLabel : label}</span>
</button>

<style>
	.destructive-confirm {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		white-space: normal;
	}
	.destructive-confirm :global(svg) {
		flex: none;
	}
</style>
