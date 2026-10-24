<script lang="ts">
  // Shared customization content for the desktop rail and mobile sheet.
  import { popoverFocus } from './experience/focus.ts'
  import { GROUPS, HEALTH_LABEL, healthOf } from './model.ts'
  import { ui, doc, store, view, gens, pick, clearSlots, genOf, genProgress, openNewItem, randomize, isDemo } from './state.svelte.ts'
  import { queue } from '../lib/pixellab/queue.ts'
  import Thumb from './Thumb.svelte'
  import GroupIcon from './GroupIcon.svelte'
  import Colors from './Colors.svelte'
  import Moves from './Moves.svelte'
  import GenCard from './GenCard.svelte'
  import Outfits from './Outfits.svelte'
  import { Bookmark, Ellipsis, Info, Plus, Shuffle, X, Check } from './icons.ts'

  const m = $derived(store.project?.manifest)
  let more=$state<HTMLElement>()
  const mainGroups = GROUPS.filter(g => ['Head','Hair','Body'].includes(g.id))
  const extraGroups = GROUPS.filter(g => !['Head','Hair','Body'].includes(g.id))
  const g = $derived(GROUPS.find((x) => x.id === ui.group) ?? GROUPS[0])
  const items = $derived(m ? m.items.filter((i) => g.slots.includes(i.slot)) : [])
  const pending = $derived(gens.filter((x) => x.draft.rigId === doc.id && g.slots.includes(x.input.slot)))
  const sel = $derived(items.find((i) => i.id === ui.selected) ?? items.find((i) => doc.items[i.slot] === i.id))
  const gen = $derived(genOf(ui.selected))
  const tileK = $derived(ui.size === 'compact' ? 56 : 80)
  const categoryName = $derived(g.id === 'Head' ? 'Headwear' : g.id === 'Hands' ? 'Held items' : g.id)
  // T2: keep the selected slot chip in view (Body was half under the Random button on a 375 px phone)
  let chips = $state<HTMLElement>()
  $effect(() => { void ui.group; chips?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) })
</script>

<div class="panel">
  {#if ui.tab === 'wardrobe'}
    <div class="chip-row">
      <div class="slot-chips" role="tablist" aria-label="Slots" bind:this={chips}>
        {#each mainGroups as s (s.id)}
          {@const itemCount = m?.items.filter((i) => s.slots.includes(i.slot)).length ?? 0}
          {@const pendingCount = gens.filter((x) => x.draft.rigId === doc.id && s.slots.includes(x.input.slot)).length}
          <button role="tab" class="bu-action slot-chip" data-variant="tab" aria-selected={ui.group === s.id} tabindex={ui.group === s.id ? 0 : -1} onclick={() => (ui.group = s.id)}>
            <GroupIcon group={s.id} size={18} /><span>{s.id}</span>
            {#if m}<span class="category-count small num">{itemCount + pendingCount}<span class="sr"> items{pendingCount ? ` (${pendingCount} pending)` : ''}</span></span>{/if}
          </button>
        {/each}
        <button class="slot-chip bu-action" data-variant="tab" aria-pressed={extraGroups.some(g=>g.id===ui.group)} popovertarget="more-equipment"><Ellipsis size={18}/><span>More</span></button>
        <div id="more-equipment" class="menu more-equipment bu-floating" popover bind:this={more} ontoggle={popoverFocus}><p class="menu-sec">Additional equipment</p>{#each extraGroups as group}<button class="row bu-action" data-variant="quiet" aria-pressed={ui.group===group.id} onclick={()=>{ui.group=group.id;more?.hidePopover()}}><GroupIcon group={group.id}/><span>{group.id==='Hands'?'Held item':group.id}</span></button>{/each}</div>
      </div>
    </div>
    {#if m && view.project}
      <div class="equipment-heading"><h2>{categoryName}</h2><span class="muted small">{items.length + pending.length} {items.length + pending.length === 1 ? 'item' : 'items'}</span><button class="bu-action btn icon plain" data-variant="quiet" aria-label="Random look" title="Random look" onclick={randomize}><Shuffle size={18}/></button></div>
      {#if items.length || pending.length}
        <div class="tiles" role="group" aria-label="{g.id} items">
          {#each items as it (it.id)}
            <button data-variant="tile" class="bu-action tile" class:sel={ui.selected === it.id} aria-pressed={doc.items[it.slot] === it.id} onclick={() => pick(it.id)}>
              <span class="tile-art" aria-hidden="true"><Thumb project={view.project} item={it} size={tileK} /></span><span class="tile-name">{it.name}</span>
              {#if doc.items[it.slot] === it.id}<span class="equipped-check" aria-hidden="true"><Check size={16}/></span>{/if}
            </button>
          {/each}
          {#each pending as x (x.draft.spec.id)}
            {@const p = genProgress(x, $queue.jobs)}
            <button data-variant="tile" class="bu-action tile" class:sel={ui.selected === `gen:${x.draft.spec.id}`} aria-label="{x.input.name}, {p.label}" onclick={() => (ui.selected = `gen:${x.draft.spec.id}`)}>
              <span class="tile-art none"><span class="ring" class:spin={x.phase === 'running' && !p.pct} style:--p={p.pct}></span></span><span class="tile-name">{p.short}</span>
            </button>
          {/each}
          <button data-variant="outline" class="bu-action equipment-none" aria-pressed={!items.some((i) => doc.items[i.slot] === i.id)} onclick={() => clearSlots(g.slots)}><X size={18}/><span>None</span></button>
        </div>
        {#if gen}
          <GenCard g={gen} />
        {:else if sel}
          {@const h = healthOf(m, sel)}
          <div class="sel-row">
            <span class="sel-name">{sel.name}</span>
            {#if h !== 'demo' || isDemo()}<span class="badge {h}">{HEALTH_LABEL[h]}</span>{/if}
            <button class="bu-action btn icon plain" data-variant="quiet" aria-label="{sel.name} details" onclick={() => { ui.selected = sel.id; ui.sheet = 'item' }}><Info size={20} /></button>
          </div>
          <Colors only={sel.id} heading={false} />
        {/if}
      {:else}
        <div class="category-empty" role="group" aria-label="{g.id} items">
          <span class="muted">No saved items</span>
        </div>
      {/if}
      <button class="bu-action equipment-create" data-variant="primary" onclick={() => openNewItem(g.id)}><Plus size={18}/><span>New {g.id === 'Hands' ? 'held' : g.id.toLowerCase()} item</span></button>
      <button class="bu-action equipment-saved" data-variant="quiet" onclick={() => openNewItem(g.id, undefined, 'designs')}><Bookmark size={18}/><span>Use a saved design</span></button>
    {/if}
  {:else if ui.tab === 'outfits'}
    <Outfits />
  {:else if ui.tab === 'colors'}
    <Colors />
  {:else}
    <Moves />
  {/if}
</div>
