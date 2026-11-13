<script module lang="ts">
	export const DEMO_CHARACTER_LOCKED = "Demo character can't be deleted";
</script>

<script lang="ts">
	import { Trash } from './icons.ts';
	// A destructive menu item. When `locked` gives a reason, the item stays in its place, unavailable, with the reason
	// underneath, so people learn why it cannot be used instead of wondering where it went.
	let {
		label,
		locked = '',
		onclick,
		class: className = ''
	}: { label: string; locked?: string; onclick: () => void; class?: string } = $props();
	const reason = $props.id();
</script>

<button
	class={['row danger', className]}
	data-variant="quiet"
	role="menuitem"
	aria-label={label}
	aria-disabled={locked ? 'true' : undefined}
	aria-describedby={locked ? reason : undefined}
	onclick={() => {
		if (!locked) onclick();
	}}
	><Trash size={16} aria-hidden="true" /><span class="row-name"
		>{label}{#if locked}<small class="row-reason" id={reason}>{locked}</small>{/if}</span
	></button
>
