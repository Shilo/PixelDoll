<script lang="ts">
	// How a character or item was made: the prompt first, then cost and settings; the exact requests one level deeper.
	import type { Item, Manifest } from '../lib/store/manifest.ts';
	import {
		costText,
		generationDetails,
		seedOf,
		toolOf,
		requestPromptOf
	} from '../lib/store/generation.ts';
	import { Check, ChevronRight, Copy } from './icons.ts';

	let {
		m,
		it,
		extra = []
	}: { m: Manifest; it: Item; extra?: { label: string; value: string }[] } = $props();
	const g = $derived(generationDetails(m, it));
	const prov = $derived(it.provenance ?? []);
	let copied = $state<'prompt' | 'json' | null>(null),
		message = $state('');
	const when = (iso: string) => {
		const d = new Date(iso);
		return Number.isNaN(d.getTime())
			? iso
			: d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	};
	async function copy(what: 'prompt' | 'json') {
		const text =
			what === 'prompt'
				? g.prompt
				: JSON.stringify(
						{
							name: it.id === m.rig.baseItem ? m.name : it.name,
							app: m.app,
							prompt: g.prompt,
							createdAt: g.createdAt,
							settings: Object.fromEntries(g.settings.map((s) => [s.label, s.value])),
							cost: g.cost,
							calls: prov
						},
						null,
						2
					);
		try {
			await navigator.clipboard.writeText(text);
			copied = what;
			message = '';
		} catch {
			message = 'Copy is unavailable here.';
		}
	}
</script>

<div class="generation">
	{#if g.prompt}
		<div class="prompt">
			<p>{g.prompt}</p>
			<button
				class="bu-action btn icon"
				data-variant="outline"
				aria-label="Copy prompt"
				title="Copy prompt"
				onclick={() => copy('prompt')}
				>{#if copied === 'prompt'}<Check size={14} />{:else}<Copy size={14} />{/if}</button
			>
		</div>
	{/if}
	<dl class="kv">
		{#if g.tools.length}<dt>Made with</dt>
			<dd>
				{g.tools.map((t) => (t.calls > 1 ? `${t.name} ×${t.calls}` : t.name)).join(' · ')}
			</dd>{/if}
		{#each g.settings as s (s.label)}<dt>{s.label}</dt>
			<dd>{s.value}</dd>{/each}
		<dt>Cost</dt>
		<dd>
			{costText(g.cost) || 'Not recorded'}{g.cost.calls
				? ` · ${g.cost.calls} ${g.cost.calls === 1 ? 'call' : 'calls'}`
				: ''}{g.cost.replaced ? ` (${g.cost.replaced} re-rolled)` : ''}{it.copiedFrom
				? ` · paid once for ${it.copiedFrom.name}; copied here for free`
				: ''}
		</dd>
		{#each extra as s (s.label)}<dt>{s.label}</dt>
			<dd>{s.value}</dd>{/each}
		{#if g.createdAt}<dt>Created</dt>
			<dd>{when(g.createdAt)}</dd>{/if}
	</dl>
	{#if g.requestPrompts.length}
		<details class="disclosure">
			<summary
				><ChevronRight size={14} />Sent to PixelLab ({g.requestPrompts.length}
				{g.requestPrompts.length === 1 ? 'prompt' : 'prompts'})</summary
			>
			<div>
				{#each g.requestPrompts as text, i (i)}<p class="sent small">{text}</p>{/each}
			</div>
		</details>
	{/if}
	{#if prov.length}
		<details class="disclosure">
			<summary><ChevronRight size={14} />API calls ({prov.length})</summary>
			<div>
				<ol class="calls small">
					{#each prov as p, i (i)}
						<li>
							<span class="call-head"
								><span class="mono">{p.endpoint}</span>{#if p.replaced}<span class="faint">
										· re-rolled</span
									>{/if}</span
							>
							<span class="faint"
								>{toolOf(p)}{seedOf(p) === undefined ? '' : ` · seed ${seedOf(p)}`}{p.usage
									?.generations
									? ` · ${+p.usage.generations.toFixed(2)} gens`
									: ''}{p.usage?.usd ? ` · $${p.usage.usd.toFixed(3)}` : ''}{p.usage
									? ''
									: ' · cost unknown'} · {when(p.createdAt)}</span
							>
							{#if requestPromptOf(p) && requestPromptOf(p) !== (i ? requestPromptOf(prov[i - 1]) : '')}<span
									class="faint call-prompt">{requestPromptOf(p)}</span
								>{/if}
						</li>
					{/each}
				</ol>
			</div>
		</details>
	{/if}
	<div class="actions">
		<button class="bu-action btn small" data-variant="outline" onclick={() => copy('json')}
			>{#if copied === 'json'}<Check size={14} />{:else}<Copy size={14} />{/if}Copy as JSON</button
		>
		{#if message}<span class="faint small" role="status">{message}</span>{/if}
	</div>
</div>

<style>
	.generation {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	.prompt {
		display: flex;
		align-items: flex-start;
		gap: 6px;
	}
	.prompt p {
		flex: 1;
		min-width: 0;
		margin: 0;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
	.sent {
		margin: 0;
		color: var(--text-2);
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
	.calls {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.calls li {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.call-prompt {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.actions .btn {
		gap: 6px;
	}
</style>
