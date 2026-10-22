<script lang="ts">
  // Phone content (portrait under the canvas, landscape in the side column): Wardrobe / Colours / Moves.
  import { GROUPS, HEALTH_LABEL, healthOf } from './model.ts'
  import { ui, doc, store, view, gens, pick, clearSlots, genOf, genProgress, openNewItem, randomize, isDemo } from './state.svelte.ts'
  import { queue } from '../lib/pixellab/queue.ts'
  import Thumb from './Thumb.svelte'
  import GroupIcon from './GroupIcon.svelte'
  import Colours from './Colours.svelte'
  import Moves from './Moves.svelte'
  import GenCard from './GenCard.svelte'
  import Outfits from './Outfits.svelte'
  import { Bookmark, Info, Plus, Shuffle, X } from './icons.ts'

  const m = $derived(store.project?.manifest)
  // B10 (T1 P1-2): "Outfits" is a chip after the slot groups on phones
  const outfits = $derived(ui.group === 'Outfits')
  const g = $derived(GROUPS.find((x) => x.id === ui.group) ?? GROUPS[0])
  const items = $derived(m ? m.items.filter((i) => g.slots.includes(i.slot)) : [])
  const pending = $derived(gens.filter((x) => x.draft.rigId === doc.id && g.slots.includes(x.input.slot)))
  const sel = $derived(items.find((i) => i.id === ui.selected))
  const gen = $derived(genOf(ui.selected))
  const tileK = $derived(44)
  // T2: keep the selected slot chip in view (Body was half under the Random button on a 375 px phone)
  let chips = $state<HTMLElement>()
  $effect(() => { void ui.group; chips?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) })
</script>

<div class="panel">
  {#if ui.tab === 'wardrobe'}
    <div class="chip-row">
      <div class="slot-chips" role="tablist" aria-label="Slots" bind:this={chips}>
        {#each GROUPS as s (s.id)}
          <button role="tab" class="slot-chip" aria-selected={ui.group === s.id} tabindex={ui.group === s.id ? 0 : -1} onclick={() => (ui.group = s.id)}>
            <GroupIcon group={s.id} size={18} /><span>{s.id}</span>
          </button>
        {/each}
        <button role="tab" class="slot-chip" aria-selected={outfits} tabindex={outfits ? 0 : -1} onclick={() => (ui.group = 'Outfits')}><Bookmark size={18} /><span>Outfits</span></button>
      </div>
      <button class="btn icon plain" aria-label="Random look" title="Random look" onclick={randomize} disabled={!m}><Shuffle size={20} /></button>
    </div>
    {#if outfits}
      <Outfits />
    {:else if m && view.project}
      {#if items.length || pending.length}
        <div class="tiles" role="group" aria-label="{g.id} items">
          <button class="tile" aria-pressed={!items.some((i) => doc.items[i.slot] === i.id)} onclick={() => clearSlots(g.slots)}>
            <span class="tile-art none"><X size={18} /></span><span class="tile-name">None</span>
          </button>
          {#each items as it (it.id)}
            <button class="tile" class:sel={ui.selected === it.id} aria-pressed={doc.items[it.slot] === it.id} onclick={() => pick(it.id)}>
              <span class="tile-art" aria-hidden="true"><Thumb project={view.project} item={it} size={tileK} /></span><span class="tile-name">{it.name}</span>
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
            {#if h !== 'demo' || isDemo()}<span class="badge {h}">{HEALTH_LABEL[h]}</span>{/if}
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
