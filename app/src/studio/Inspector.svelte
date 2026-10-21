<script lang="ts">
  import ItemPane from './ItemPane.svelte'
  import GenCard from './GenCard.svelte'
  import Colours from './Colours.svelte'
  import Moves from './Moves.svelte'
  import { ui, store, genOf, openNewItem } from './state.svelte.ts'
  import { Plus } from './icons.ts'
  const bare = $derived(!!store.project && store.project.manifest.items.length <= 1)
  const g = $derived(genOf(ui.selected))
  const it = $derived(store.project?.manifest.items.find((i) => i.id === ui.selected && i.slot !== 'body'))
</script>

<div class="inspector">
  <div class="seg full" role="tablist" aria-label="Inspector">
    {#each [['item', 'Item'], ['colours', 'Colours'], ['moves', 'Moves']] as [id, label] (id)}
      <button role="tab" aria-selected={ui.inspTab === id} onclick={() => (ui.inspTab = id as typeof ui.inspTab)}>{label}</button>
    {/each}
  </div>
  {#if ui.inspTab === 'colours'}
    <Colours />
  {:else if ui.inspTab === 'moves'}
    <Moves />
  {:else if g}
    <GenCard {g} />
  {:else if it}
    <ItemPane id={it.id} />
  {:else}
    <div class="empty">
      {#if bare}
        <p class="empty-title">Your character is ready</p>
        <p class="small">Add a hat, a top or a weapon. Each item becomes its own layer.</p>
        <button class="btn primary" onclick={() => openNewItem('Head')}><Plus size={16} />Add your first item</button>
      {:else}
        <p class="empty-title">Nothing selected</p>
        <p class="small">Pick an item in the wardrobe to wear it and change its colours.</p>
      {/if}
    </div>
  {/if}
</div>
