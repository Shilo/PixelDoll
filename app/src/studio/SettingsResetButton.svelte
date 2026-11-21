<script lang="ts">
	import { t } from 'svelte-whisper';
	import { RotateCcw } from './icons.ts';
	import type { ResetScope } from './resetSettings.ts';
	import { settingsAtDefaults } from './settingsDefaults.svelte.ts';
	let { scope, disabled, onclick }: { scope: ResetScope; disabled: boolean; onclick: () => void } =
		$props();
	const label = $derived(
		t(scope === 'all' ? 'settings.reset.action' : 'settings.reset.pageAction')
	);
</script>

<!-- Stays in place but disabled at defaults, so every page keeps the same header and Reset stays discoverable. -->
<button
	type="button"
	class="bu-action btn icon plain"
	data-variant="quiet"
	disabled={disabled || settingsAtDefaults(scope)}
	{onclick}
	aria-label={label}
	title={label}
>
	<RotateCcw size={18} aria-hidden="true" />
</button>
