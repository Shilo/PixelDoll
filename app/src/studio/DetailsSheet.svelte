<script lang="ts">
	// Character ⋮ > Details: how the character was made and what it has cost, read from its saved provenance.
	import Sheet from './Sheet.svelte';
	import GenerationDetails from './GenerationDetails.svelte';
	import { ui, doc, store } from './state.svelte.ts';
	import * as db from '../lib/store/db.ts';
	import { openSource } from '../lib/dress/project.ts';
	import { costText, recordedCost } from '../lib/store/generation.ts';
	import type { Manifest } from '../lib/store/manifest.ts';
	import type { StoredProject } from '../lib/store/project.ts';

	const id = ui.details || doc.id;
	const name = store.projects.find((p) => p.id === id)?.name ?? 'Character';
	let m = $state.raw<Manifest | null>(null),
		error = $state('');
	async function manifestOf(): Promise<Manifest> {
		if (id === doc.id && store.project && !doc.loading) return store.project.manifest;
		if (!id.startsWith('fixture:')) {
			const rec = await db.get<StoredProject>('projects', id);
			if (!rec) throw new Error('This character is no longer saved.');
			return rec.manifest;
		}
		return (await openSource(id)).project.manifest;
	}
	manifestOf().then(
		(x) => (m = x),
		(e: unknown) => (error = e instanceof Error ? e.message : String(e))
	);
	const base = $derived(m?.items.find((i) => i.id === m!.rig.baseItem));
	// Items copied from another character were paid for there; counting them here would count them twice.
	const items = $derived(
		m?.items.filter((i) => i.id !== m!.rig.baseItem && !i.variantOf && !i.copiedFrom) ?? []
	);
	const extra = $derived.by(() => {
		if (!m || !items.length) return [];
		const all = recordedCost([...(base?.provenance ?? []), ...items.flatMap((i) => i.provenance)]);
		return [
			{
				label: 'With items',
				value: `${costText(all) || 'Not recorded'} · ${items.length} ${items.length === 1 ? 'item' : 'items'}`
			}
		];
	});
</script>

<Sheet title={`${name} details`} cancel="Done" onclose={() => (ui.sheet = null)}>
	{#if error}<p class="notice bad small" role="alert">{error}</p>
	{:else if m && base}<GenerationDetails {m} it={base} {extra} />
	{:else if m}<p class="faint small">No generation details were saved for this character.</p>
	{:else}<p class="faint small" role="status">Loading…</p>{/if}
</Sheet>
