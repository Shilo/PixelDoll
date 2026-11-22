<script module lang="ts">
	/** "Mod" is Command on Apple devices and Control elsewhere, as in the app's own shortcut handling. */
	export const appleKeys =
		typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

	/** The `aria-keyshortcuts` value for keys such as ['Mod', ',']: both modifier spellings, since either works. */
	export const ariaShortcut = (keys: readonly string[]) =>
		['Control', 'Meta']
			.map((mod) => keys.map((key) => (key === 'Mod' ? mod : key)).join('+'))
			.join(' ');
</script>

<script lang="ts">
	// A quiet hint for a keyboard shortcut, e.g. "Ctrl+," or "⌘,". Screen readers get the shortcut from the control's
	// aria-keyshortcuts instead, so the hint itself is hidden from them.
	import { t } from 'svelte-whisper';

	let { keys, class: className = '' }: { keys: readonly string[]; class?: string } = $props();
	const label = (key: string) => (key === 'Mod' ? (appleKeys ? '⌘' : t('shortcut.control')) : key);
</script>

<kbd class={['shortcut', className]} aria-hidden="true"
	>{#each keys as key, index (index)}{#if index && !appleKeys}+{/if}<kbd>{label(key)}</kbd
		>{/each}</kbd
>

<style>
	.shortcut {
		font: inherit;
		white-space: nowrap;
	}
	.shortcut kbd {
		font: inherit;
	}
</style>
