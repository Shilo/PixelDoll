<script lang="ts">
	import { installWorkspaceCopy } from '../lib/store/db.ts';
	import { readWorkspace } from '../lib/store/workspace.ts';
	import { MAX_ZIP_BYTES } from '../lib/store/zip.ts';
	import { setWorkspaceInfo, workspaceUrl } from '../lib/store/workspace-mode.ts';
	import { FileArchive } from './icons.ts';
	import './studio.css';

	let { openStudio }: { openStudio: () => Promise<void> } = $props();
	let input: HTMLInputElement;
	let busy = $state(false);
	let installed = $state(false);
	let error = $state('');
	async function choose() {
		const file = input.files?.[0];
		input.value = '';
		if (!file || busy || installed) return;
		busy = true;
		error = '';
		try {
			if (file.size > MAX_ZIP_BYTES) throw new Error('Choose a workspace ZIP up to 64 MB.');
			const { projects, blobs, ...info } = await readWorkspace(
				new Uint8Array(await file.arrayBuffer())
			);
			installWorkspaceCopy(projects, blobs);
			setWorkspaceInfo(info);
			installed = true;
			await openStudio();
		} catch (cause) {
			error = installed
				? 'The copy could not open. Reload this tab to try again.'
				: (cause as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<main class="studio-app picker" aria-busy={busy}>
	<section class="bu-surface" aria-labelledby="workspace-title">
		<h1 id="workspace-title">Open workspace copy</h1>
		<p>
			Choose a ZIP made with <strong>Export my workspace</strong>. Your library stays unchanged.
		</p>
		<p>
			PixelLab is off here. Any changes to the copy are discarded when you close or reload this tab.
		</p>
		<input
			type="file"
			accept=".zip,application/zip"
			aria-label="Choose workspace ZIP"
			hidden
			bind:this={input}
			onchange={choose}
		/>
		{#if error}<p class="notice warn" role="alert">{error}</p>{/if}
		<div class="actions">
			<a class="btn bu-action" data-variant="quiet" href={workspaceUrl(false)}>Go to my library</a>
			<button
				class="btn primary bu-action"
				data-variant="primary"
				disabled={busy || installed}
				onclick={() => input.click()}
			>
				<FileArchive size={16} />{busy ? 'Opening…' : 'Choose ZIP'}
			</button>
		</div>
	</section>
</main>

<style>
	.picker {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 16px;
	}
	section {
		width: min(100%, 30rem);
		display: grid;
		gap: 14px;
		padding: 24px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
	}
</style>
