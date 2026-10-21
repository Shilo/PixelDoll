<script lang="ts">
  // Phone content (portrait under the canvas, landscape in the side column): Wardrobe / Colours / Moves.
  import { GROUPS, HEALTH_LABEL, healthOf } from './model.ts'
  import { ui, doc, store, view, gens, wear, clearSlots, genOf, genProgress, openNewItem } from './state.svelte.ts'
  import { queue } from '../lib/pixellab/queue.ts'
  import Thumb from './Thumb.svelte'
  import GroupIcon from './GroupIcon.svelte'
  import Colours from './Colours.svelte'
  import Moves from './Moves.svelte'
  import GenCard from './GenCard.svelte'
  import { Info, Plus, X } from './icons.ts'

  const m = $derived(store.project?.manifest)
  const g = $derived(GROUPS.find((x) => x.id === ui.group)!)
  const items = $derived(m ? m.items.filter((i) => g.slots.includes(i.slot)) : [])
  const pending = $derived(gens.filter((x) => x.draft.rigId === doc.id && g.slots.includes(x.input.slot)))
  const sel = $derived(items.find((i) => i.id === ui.selected))
  const gen = $derived(genOf(ui.selected))
  const tileK = $derived(44)
</script>

<div class="panel">
  {#if ui.tab === 'wardrobe'}
    <div class="slot-chips" role="tablist" aria-label="Slots">
      {#each GROUPS as s (s.id)}
        <button role="tab" class="slot-chip" aria-selected={ui.group === s.id} onclick={() => (ui.group = s.id)}>
          <GroupIcon group={s.id} size={18} /><span>{s.id}</span>
        </button>
      {/each}
    </div>
    {#if m && view.project}
      {#if items.length || pending.length}
        <div class="tiles" role="group" aria-label="{g.id} items">
          <button class="tile" aria-pressed={!items.some((i) => doc.items[i.slot] === i.id)} onclick={() => clearSlots(g.slots)}>
            <span class="tile-art none"><X size={18} /></span><span class="tile-name">None</span>
          </button>
          {#each items as it (it.id)}
            <button class="tile" aria-pressed={doc.items[it.slot] === it.id} onclick={() => wear(it.id)}>
              <span class="tile-art"><Thumb project={view.project} item={it} size={tileK} /></span><span class="tile-name">{it.name}</span>
            </button>
          {/each}
          {#each pending as x (x.draft.spec.id)}
            {@const p = genProgress(x, $queue.jobs)}
            <button class="tile" class:sel={ui.selected === `gen:${x.draft.spec.id}`} aria-label="{x.input.name}, {p.label}" onclick={() => (ui.selected = `gen:${x.draft.spec.id}`)}>
              <span class="tile-art none"><span class="ring" class:spin={x.phase === 'running' && !p.pct} style:--p={p.pct}></span></span><span class="tile-name">{p.short}</span>
            </button>
          {/each}
          <button class="tile new" onclick={() => openNewItem(g.id)}>
            <span class="tile-art"><Plus size={20} /></span><span class="tile-name">New</span>
          </button>
        </div>
        {#if gen}
          <GenCard g={gen} />
        {:else if sel}
          {@const h = healthOf(m, sel)}
          <div class="sel-row">
            <span class="sel-name">{sel.name}</span>
            <span class="badge {h}">{HEALTH_LABEL[h]}</span>
            <button class="btn icon plain" aria-label="{sel.name} details" onclick={() => (ui.sheet = 'item')}><Info size={20} /></button>
          </div>
          <Colours only={sel.id} heading={false} />
        {/if}
      {:else}
        <div class="empty">
          <GroupIcon group={g.id} size={28} />
          <p class="empty-title">No {g.empty} yet</p>
          <button class="btn primary" onclick={() => openNewItem(g.id)}><Plus size={16} />Make one</button>
        </div>
      {/if}
    {/if}
  {:else if ui.tab === 'colours'}
    <Colours />
  {:else}
    <Moves />
  {/if}
</div>
