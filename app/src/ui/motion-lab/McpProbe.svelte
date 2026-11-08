<script lang="ts">
	import { labQueue } from './run.ts';
	import { browserMcp, type McpTool } from './mcp.ts';
	import {
		customTestRecord,
		canCorrectCustomTest,
		customBilling,
		CUSTOM_CHARACTER
	} from './custom-test.ts';
	let {
		connected,
		download
	}: { connected: boolean; download: (name: string, value: unknown) => void } = $props();
	let client: ReturnType<typeof browserMcp> | undefined,
		tools = $state<McpTool[]>([]),
		events = $state<{ operation: string; at: string; result: unknown }[]>([]),
		busy = $state(false),
		error = $state(''),
		search = $state('bald'),
		character = $state('');
	const latest = $derived(events.at(-1));
	let comparison = $state(customTestRecord());
	async function compare() {
		if (busy || !connected || !client) return;
		busy = true;
		error = '';
		try {
			const result = await client.compare();
			events.push({ operation: 'comparison', at: new Date().toISOString(), result });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			comparison = customTestRecord();
			busy = false;
		}
	}
	async function billing() {
		if (busy || !connected) return;
		busy = true;
		error = '';
		try {
			events.push({
				operation: 'billing',
				at: new Date().toISOString(),
				result: await customBilling(labQueue.key)
			});
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	async function action(kind: 'inspect' | 'list' | 'character' | 'instructions') {
		if (busy) return;
		busy = true;
		error = '';
		try {
			let result: unknown;
			if (kind === 'inspect') {
				client = browserMcp(labQueue.key);
				const catalog = await client.inspect();
				tools = catalog.tools;
				result = catalog;
			} else {
				if (!client) throw new Error('Inspect the live tool schema first.');
				result =
					kind === 'instructions'
						? await client.instructions(character)
						: await client.read(
								kind === 'list' ? 'list_characters' : 'get_character',
								kind === 'list'
									? { search, limit: 10 }
									: { character_id: character, include_preview: false }
							);
			}
			events.push({ operation: kind, at: new Date().toISOString(), result });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	function exported() {
		download('pixeldoll-custom-v3-inspection.json', {
			version: 1,
			date: '2026-11-01',
			connected,
			paidRequests: comparison ? 1 : 0,
			comparison,
			events,
			error
		});
	}
</script>

<section class="bu-dialog-surface probe" aria-label="Custom Skeleton v3 inspection">
	<h2>Custom Skeleton v3 inspection</h2>
	<p>
		Inspect the live schema and benchmark, then request the free custom-motion instructions. The
		single paid comparison reserves the remaining eight generations before submission and cannot be
		resent.
	</p>
	<div class="bu-actions">
		<button class="bu-btn" disabled={!connected || busy} onclick={() => action('inspect')}
			>Inspect custom V3 MCP schema (free)</button
		><label>Benchmark character search<input class="bu-input" bind:value={search} /></label><button
			class="bu-btn"
			disabled={!tools.length || busy}
			onclick={() => action('list')}>Find benchmark characters (free)</button
		><label>Managed character ID<input class="bu-input" bind:value={character} /></label><button
			class="bu-btn"
			disabled={!tools.length || !character || busy}
			onclick={() => action('character')}>Read benchmark character (free)</button
		><button class="bu-btn" onclick={exported}>Export custom V3 inspection</button>
	</div>
	<button
		class="bu-btn"
		disabled={!connected ||
			!tools.some((t) => t.name === 'animate_character') ||
			!character ||
			busy}
		onclick={() => action('instructions')}>Read custom V3 authoring instructions (free)</button
	>
	<button
		class="bu-btn"
		disabled={!connected ||
			busy ||
			(!!comparison && !canCorrectCustomTest(comparison)) ||
			character !== CUSTOM_CHARACTER ||
			!events.some((e) => e.operation === 'instructions')}
		onclick={compare}>Run planted overhead comparison, south and east (reserve 8 gens)</button
	>
	{#if comparison}<p>
			Custom comparison: {comparison.status}; {comparison.reserved} generations reserved. Inspect the
			receipt and character before any further work.
		</p>{/if}
	<button class="bu-btn" disabled={!connected || busy || !comparison} onclick={billing}
		>Read comparison job billing (free)</button
	>
	<p aria-live="polite">{busy ? 'Reading PixelLab MCP…' : `${events.length} completed checks.`}</p>
	{#if error}<p role="alert" class="bu-error">{error}</p>{/if}{#if latest}<details open>
			<summary>{latest.operation} response</summary>
			<pre>{JSON.stringify(latest.result, null, 2)}</pre>
		</details>{/if}
</section>

<style>
	.probe {
		padding: 16px;
		display: grid;
		gap: 12px;
	}
	.probe pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 420px;
		overflow: auto;
	}
	.probe label {
		display: grid;
		gap: 6px;
	}
</style>
