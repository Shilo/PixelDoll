<script lang="ts">
	import { t } from 'svelte-whisper';
	import { Download, LoaderCircle } from './icons.ts';
	import SettingsItemButton from './SettingsItemButton.svelte';

	let {
		settings = false,
		disabled = false,
		pending = $bindable(false),
		onbackup
	}: {
		settings?: boolean;
		disabled?: boolean;
		pending?: boolean;
		onbackup: () => Promise<void>;
	} = $props();

	async function startBackup() {
		if (disabled || pending) return;
		pending = true;
		try {
			await onbackup();
		} finally {
			pending = false;
		}
	}
</script>

{#snippet label()}
	{#if pending}<LoaderCircle size={18} class="backup-spinner" aria-hidden="true" />{:else}<Download
			size={18}
			aria-hidden="true"
		/>{/if}
	{t('librarySettings.backup')}
{/snippet}

{#if settings}
	<SettingsItemButton
		data-setting="backup"
		disabled={disabled || pending}
		aria-busy={pending}
		onclick={startBackup}
	>
		{@render label()}
	</SettingsItemButton>
{:else}
	<button
		type="button"
		class="bu-action btn sm compact-backup"
		data-variant="outline"
		disabled={disabled || pending}
		aria-busy={pending}
		onclick={startBackup}
	>
		{@render label()}
	</button>
{/if}

<style>
	.compact-backup {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-block-start: 6px;
	}
	@media (prefers-reduced-motion: no-preference) {
		:global(.backup-spinner) {
			animation: spin 1.2s linear infinite;
		}
	}
</style>
