<script lang="ts">
	import { formatNumber, t } from 'svelte-whisper';
	// Character ⋮ > Details: how the character was made and what it has cost, read from its saved provenance.
	import Sheet from './Sheet.svelte';
	import ApiPeek from './ApiPeek.svelte';
	import GenerationDetails from './GenerationDetails.svelte';
	import { ui, doc, store } from './state.svelte.ts';
	import * as db from '../lib/store/db.ts';
	import { openSource } from '../lib/dress/project.ts';
	import { ownItems, ownProvenance, recordedCost } from '../lib/store/generation.ts';
	import { displayCost } from './displayCost.ts';
	import { displayMessage, errorMessage } from '../lib/i18n.ts';
	import { LocalizedError, type Message } from '../lib/message.ts';
	import type { Manifest } from '../lib/store/manifest.ts';
	import type { StoredProject } from '../lib/store/project.ts';

	const id = ui.details || doc.id;
	const name = $derived(store.projects.find((p) => p.id === id)?.name ?? t('common.character'));
	let m = $state.raw<Manifest | null>(null),
		error = $state<Message | string>('');
	async function manifestOf(): Promise<Manifest> {
		if (id === doc.id && store.project && !doc.loading) return store.project.manifest;
		if (!id.startsWith('fixture:')) {
			const rec = await db.get<StoredProject>('projects', id);
			if (!rec)
				throw new LocalizedError('This character is no longer saved.', 'detailsSheet.notSaved');
			return rec.manifest;
		}
		return (await openSource(id)).project.manifest;
	}
	manifestOf().then(
		(x) => (m = x),
		(e: unknown) => (error = errorMessage(e))
	);
	const base = $derived(m?.items.find((i) => i.id === m!.rig.baseItem));
	// Items copied from another character were paid for there; counting them here would count them twice.
	const items = $derived(m ? ownItems(m) : []);
	const extra = $derived.by(() => {
		if (!m || !items.length) return [];
		const all = recordedCost(ownProvenance(m));
		return [
			{
				label: t('detailsSheet.withItems'),
				value: t('detailsSheet.itemCost', {
					cost: displayCost(all) || t('common.notRecorded'),
					count: items.length,
					n: formatNumber(items.length)
				})
			}
		];
	});
</script>

<Sheet
	title={t('detailsSheet.title', { name })}
	cancel="common.done"
	onclose={() => (ui.sheet = null)}
>
	{#snippet developer()}
		<ApiPeek copyId={m && !id.startsWith('fixture:') ? id : undefined} />
	{/snippet}

	{#if error}<p class="notice bad small" role="alert">{displayMessage(error)}</p>
	{:else if m && base}<GenerationDetails {m} it={base} {extra} />
	{:else if m}<p class="faint small">{t('detailsSheet.noGenerationDetailsWereSavedForThis')}</p>
	{:else}<p class="faint small" role="status">{t('common.loading')}</p>{/if}
</Sheet>
