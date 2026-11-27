<script lang="ts">
	// How a character or item was made: the prompt first, then cost and settings; the exact requests one level deeper.
	import type { Item, Manifest } from '../lib/store/manifest.ts';
	import {
		cameraMessage,
		generationDetails,
		seedOf,
		toolOf,
		requestPromptOf
	} from '../lib/store/generation.ts';
	import { Check, ChevronRight, Copy } from './icons.ts';
	import { formatNumber, getLocale, t } from 'svelte-whisper';
	import { displayDate, displayMessage } from '../lib/i18n.ts';
	import { displayCost, usdText } from './displayCost.ts';

	let {
		m,
		it,
		extra = [],
		part = 'all'
	}: {
		m: Manifest;
		it: Item;
		extra?: { label: string; value: string }[];
		/** A View and edit window with a Cost section shows the cost lines there and the rest under About. */
		part?: 'all' | 'cost' | 'about';
	} = $props();
	const g = $derived(generationDetails(m, it));
	const prov = $derived(it.provenance ?? []);
	let copied = $state<'prompt' | 'json' | null>(null),
		copyFailed = $state(false);
	const when = (iso: string) => {
		const d = new Date(iso);
		return Number.isNaN(d.getTime())
			? iso
			: displayDate(d, { dateStyle: 'medium', timeStyle: 'short' });
	};
	const usd = usdText;
	const settingValue = (setting: (typeof g.settings)[number]) => {
		if (
			setting.labelMessage?.key === 'generationDetails.settings.camera' &&
			m.rig.view &&
			getLocale() !== 'en'
		) {
			const camera = cameraMessage(m.rig.view);
			if (camera) return displayMessage(camera);
		}
		if (!setting.valueMessage) return setting.value;
		const { key, vars } = setting.valueMessage;
		if (!vars || Array.isArray(vars)) return t(key, vars);
		const formatted = Object.fromEntries(
			Object.entries(vars).map(([name, value]) => [
				name,
				typeof value === 'number' ? formatNumber(value) : value
			])
		);
		return t(key, formatted);
	};
	const costText = $derived(displayCost(g.cost));
	const cost = $derived.by(() => {
		const base = [
			costText || t('common.notRecorded'),
			g.cost.calls ? t('apiPeek.calls', { count: g.cost.calls }) : ''
		]
			.filter(Boolean)
			.join(' · ');
		const rerolled = g.cost.replaced
			? t('generationDetails.costRerolled', { cost: base, count: g.cost.replaced })
			: base;
		return it.copiedFrom
			? `${rerolled} · ${t('generationDetails.copiedFrom', { name: it.copiedFrom.name })}`
			: rerolled;
	});
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
			copyFailed = false;
		} catch {
			copyFailed = true;
		}
	}
</script>

{#snippet costRows()}
	<!-- Under a Cost heading, the first line is what this object itself cost. -->
	<dt>{part === 'cost' ? t('common.character') : t('common.cost')}</dt>
	<dd>
		{cost}
	</dd>
	{#each extra as s (s.label)}<dt>{s.label}</dt>
		<dd>{s.value}</dd>{/each}
{/snippet}

{#if part === 'cost'}<dl class="kv">{@render costRows()}</dl>{:else}<div class="generation">
		{#if g.prompt}
			<div class="prompt">
				<p>{g.prompt}</p>
				<button
					class="bu-action btn icon"
					data-variant="outline"
					aria-label={t('toolbar.copyPrompt')}
					title={t('toolbar.copyPrompt')}
					onclick={() => copy('prompt')}
					>{#if copied === 'prompt'}<Check size={14} />{:else}<Copy size={14} />{/if}</button
				>
			</div>
		{/if}
		<dl class="kv">
			{#if g.tools.length}<dt>{t('generationDetails.madeWith')}</dt>
				<dd>
					{g.tools
						.map((tool) =>
							tool.calls > 1
								? t('generationDetails.toolCalls', {
										name: tool.name,
										count: formatNumber(tool.calls)
									})
								: tool.name
						)
						.join(' · ')}
				</dd>{/if}
			{#each g.settings as s (s.label)}<dt>
					{s.labelMessage ? displayMessage(s.labelMessage) : s.label}
				</dt>
				<dd>{settingValue(s)}</dd>{/each}
			{#if part === 'all'}{@render costRows()}{/if}
			{#if g.createdAt}<dt>{t('generationDetails.created')}</dt>
				<dd>{when(g.createdAt)}</dd>{/if}
		</dl>
		{#if g.requestPrompts.length}
			<details class="disclosure">
				<summary
					><ChevronRight size={14} />{t('generationDetails.sent', {
						count: g.requestPrompts.length
					})}</summary
				>
				<div>
					{#each g.requestPrompts as text, i (i)}<p class="sent small">{text}</p>{/each}
				</div>
			</details>
		{/if}
		{#if prov.length}
			<details class="disclosure">
				<summary
					><ChevronRight size={14} />{t('generationDetails.apiCalls', {
						count: prov.length
					})}</summary
				>
				<div>
					<ol class="calls small">
						{#each prov as p, i (i)}
							<li>
								<span class="call-head"
									><span class="mono">{p.endpoint}</span>{#if p.replaced}<span class="faint">
											· {t('generationDetails.rerolled')}</span
										>{/if}</span
								>
								<span class="faint"
									>{[
										toolOf(p),
										seedOf(p) === undefined
											? ''
											: t('generationDetails.seed', { seed: formatNumber(seedOf(p)!) }),
										p.usage?.generations
											? t('generationDetails.gens', {
													value: formatNumber(p.usage.generations, { maximumFractionDigits: 2 })
												})
											: '',
										p.usage?.usd ? usd(p.usage.usd) : '',
										p.usage ? '' : t('generationDetails.costUnknown'),
										when(p.createdAt)
									]
										.filter(Boolean)
										.join(' · ')}</span
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
				>{#if copied === 'json'}<Check size={14} />{:else}<Copy size={14} />{/if}{t(
					'generationDetails.copyJson'
				)}</button
			>
			{#if copyFailed}<span class="faint small" role="status"
					>{t('generationDetails.copyUnavailable')}</span
				>{/if}
		</div>
	</div>{/if}

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
