<script lang="ts">
	import { installWorkspaceCopy } from '../lib/store/db.ts';
	import { readWorkspace } from '../lib/store/workspace.ts';
	import { MAX_ZIP_BYTES } from '../lib/store/zip.ts';
	import { setWorkspaceInfo, workspaceUrl } from '../lib/store/workspace-mode.ts';
	import { FileArchive } from './icons.ts';
	import { fileDrop, preventFileNavigation } from './fileDrop.ts';
	import './studio.css';

	let { openStudio }: { openStudio: () => Promise<void> } = $props();
	let input: HTMLInputElement;
	let busy = $state(false);
	let installed = $state(false);
	let error = $state('');
	let dragging = $state(false);
	const drop = fileDrop(
		() => busy || installed,
		(active) => (dragging = active),
		(files) => void openFiles(files)
	);
	function choose() {
		const files = Array.from(input.files ?? []);
		input.value = '';
		if (files.length) void openFiles(files);
	}
	async function openFiles(files: File[]) {
		if (busy || installed) return;
		const [file] = files;
		if (!file || files.length !== 1) {
			error = 'Choose one workspace ZIP, not a folder or multiple files.';
			return;
		}
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

<svelte:window ondragover={preventFileNavigation} ondrop={preventFileNavigation} />
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
			disabled={busy || installed}
			bind:this={input}
			onchange={choose}
		/>
		<button
			class="btn bu-action drop-target"
			data-variant={dragging ? 'primary' : 'outline'}
			disabled={busy || installed}
			onclick={() => input.click()}
			ondragenter={drop.enter}
			ondragleave={drop.leave}
			ondragover={drop.over}
			ondrop={drop.drop}
		>
			<FileArchive size={30} aria-hidden="true" />
			<strong aria-live="polite"
				>{busy ? 'Opening…' : dragging ? 'Release to open' : 'Drop a workspace ZIP here'}</strong
			>
			<span>or click to choose a ZIP</span>
		</button>
		{#if error}<p class="notice warn" role="alert">{error}</p>{/if}
		<div class="actions">
			<a class="btn bu-action" data-variant="quiet" href={workspaceUrl(false)}>Go to my library</a>
		</div>
	</section>
</main>

<style>
	.picker {
		box-sizing: border-box;
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 16px;
	}
	.drop-target {
		display: grid;
		justify-items: center;
		gap: 8px;
		min-height: 132px;
		padding: 20px 12px;
		white-space: normal;
		text-align: center;
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
