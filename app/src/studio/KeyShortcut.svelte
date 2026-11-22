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
	// A quiet keyboard shortcut hint drawn as keycaps, e.g. [Ctrl] [,] or [⌘] [,]. Screen readers get the shortcut from
	// the control's aria-keyshortcuts instead, so the hint itself is hidden from them.
	import { t } from 'svelte-whisper';

	let { keys, class: className = '' }: { keys: readonly string[]; class?: string } = $props();
	const label = (key: string) => (key === 'Mod' ? (appleKeys ? '⌘' : t('shortcut.control')) : key);
</script>

<kbd class={['shortcut', className]} aria-hidden="true"
	>{#each keys as key, index (index)}<kbd>{label(key)}</kbd>{/each}</kbd
>

<style>
	/* Sized by the surrounding text (e.g. a menu row's small aside), so only the family is reset here. */
	.shortcut {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-family: inherit;
		line-height: 1;
		white-space: nowrap;
	}
	.shortcut kbd {
		min-width: 1.75em;
		padding: 3px 5px 2px;
		border: 1px solid var(--bu-line);
		border-bottom-width: 2px;
		border-radius: 5px;
		background: var(--bu-field);
		font: inherit;
		/* Full-contrast, semibold monospace labels like printed keycaps: every key gets a full-width cell, so thin keys
		   such as "," stay readable. */
		font-family: var(--bu-mono);
		font-weight: 600;
		color: var(--bu-text);
		text-align: center;
	}
	/* Touch-first devices usually have no keyboard to press it with. */
	@media (hover: none) and (pointer: coarse) {
		.shortcut {
			display: none;
		}
	}
</style>
