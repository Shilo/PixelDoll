<script lang="ts">
	import { Trash } from './icons.ts';
	import { ignoreKeyRepeat, TwoStepConfirm } from './twoStepConfirm.svelte.ts';
	let {
		label,
		confirmLabel,
		disabled,
		onconfirm
	}: { label: string; confirmLabel: string; disabled: boolean; onconfirm: () => void } = $props();
	const confirm = new TwoStepConfirm({ ignoreRepeatClicks: true });

	function activate(event: MouseEvent) {
		if (!disabled && confirm.press(true, event)) onconfirm();
	}
</script>

<svelte:window onblur={() => confirm.disarm()} />
<button
	type="button"
	class="bu-btn destructive-confirm"
	data-trail="destructive.confirm"
	data-variant="danger"
	{disabled}
	onblur={() => confirm.disarm()}
	onkeydown={ignoreKeyRepeat}
	onclick={activate}
>
	<Trash size={16} aria-hidden="true" />
	<span aria-live="polite">{confirm.armed && !disabled ? confirmLabel : label}</span>
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
