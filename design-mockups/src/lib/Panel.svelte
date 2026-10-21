<script lang="ts">
  // Phone content area (portrait under the canvas, landscape in the trailing column).
  import Icon from './Icon.svelte'
  import Thumb from './Thumb.svelte'
  import Colours from './Colours.svelte'
  import Moves from './Moves.svelte'
  import GenCard from './GenCard.svelte'
  import { GROUPS, ITEMS, GEN } from '../data'
  import { ui, toggleWear, pixelGlyphs, gk, JOBS } from '../state.svelte'
  let { onnew }: { onnew: (group: string) => void } = $props()
  const items = $derived(ITEMS.filter((i) => i.group === ui.group))
  const gen = $derived(JOBS() && ui.group === GEN.group)
  const sel = $derived(ITEMS.find((i) => i.id === ui.selected && i.group === ui.group))
  const g = $derived(GROUPS.find((x) => x.id === ui.group)!)
</script>

<div class="panel">
  {#if ui.tab === 'wardrobe'}
    <div class="slot-chips" role="tablist" aria-label="Slots">
      {#each GROUPS as s (s.id)}
        <button role="tab" class="slot-chip" aria-selected={ui.group === s.id} onclick={() => (ui.group = s.id)}>
          {#if pixelGlyphs()}<Icon name={s.pixel} px size={24} />{:else}<Icon name={s.icon} size={18} />{/if}<span>{s.id}</span>
        </button>
      {/each}
    </div>

    {#if items.length || gen}
      <div class="tiles" role="group" aria-label="{ui.group} items">
        <button class="tile" aria-pressed={!items.some((i) => ui.wearing.has(i.id))} onclick={() => { for (const i of items) if (ui.wearing.has(i.id)) toggleWear(i.id) }}>
          <span class="tile-art none"><Icon name="x" size={18} /></span><span class="tile-name">None</span>
        </button>
        {#each items as it (it.id)}
          <button class="tile" aria-pressed={ui.wearing.has(it.id)} onclick={() => toggleWear(it.id)}>
            <span class="tile-art"><Thumb item={it} size={40} /></span><span class="tile-name">{it.name}</span>
          </button>
        {/each}
        {#if gen}
          <button class="tile" onclick={() => (ui.selected = 'gen')} aria-pressed={ui.selected === 'gen'}>
            <span class="tile-art pending"><span class="ring" style:--p="62"></span></span><span class="tile-name num">2:40</span>
          </button>
        {/if}
        <button class="tile new" onclick={() => onnew(ui.group)}>
          <span class="tile-art"><Icon name="plus" size={20} /></span><span class="tile-name">New</span>
        </button>
      </div>
      {#if ui.selected === 'gen' && gen}
        <GenCard />
      {:else if sel}
        <div class="sel-row">
          <span class="sel-name">{sel.name}</span>
          <span class="badge ok {gk('glass-badge glass-badge--success')}"><Icon name="circle-check" size={12} />Clean</span>
          <button class="btn icon plain" aria-label="{sel.name} details"><Icon name="info" size={20} /></button>
        </div>
        {#if sel.material}<Colours only={sel.material} title={false} />{/if}
      {/if}
    {:else}
      <div class="empty slot-empty {gk('glass-empty')}">
        <span class="empty-art {gk('glass-empty__icon')}">{#if pixelGlyphs()}<Icon name={g.pixel} px size={48} />{:else}<Icon name={g.icon} size={24} />{/if}</span>
        <p class="empty-title {gk('glass-empty__title')}">No {g.empty} yet</p>
        <div class={gk('glass-empty__action')}><button class="btn primary {gk('glass-btn glass-btn--primary glass-btn--sm glass-btn--auto')}" onclick={() => onnew(ui.group)}><Icon name="plus" size={16} /><span>Make one</span></button></div>
      </div>
    {/if}
  {:else if ui.tab === 'colours'}
    <Colours />
  {:else}
    <Moves />
  {/if}
</div>
