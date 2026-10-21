<script lang="ts">
  import Icon from './Icon.svelte'
  import Thumb from './Thumb.svelte'
  import { GROUPS, ITEMS, OUTFITS, GEN } from '../data'
  import { ui, toggleWear, pixelGlyphs, gk, JOBS } from '../state.svelte'
  let { onnew }: { onnew: (group: string) => void } = $props()
</script>

<nav class="wardrobe" aria-label="Wardrobe">
  <div class="side-head">
    <h2 class="side-title">Wardrobe</h2>
    <button class="btn icon plain" aria-label="Search items" title="Search items"><Icon name="search" size={16} /></button>
  </div>

  <div class="side-scroll">
    {#each GROUPS as g (g.id)}
      {@const items = ITEMS.filter((i) => i.group === g.id)}
      {@const gen = JOBS() && g.id === GEN.group}
      <section class="group" aria-labelledby="g-{g.id}">
        <div class="group-head">
          <span class="glyph" aria-hidden="true">{#if pixelGlyphs()}<Icon name={g.pixel} px size={24} />{:else}<Icon name={g.icon} size={16} />{/if}</span>
          <h3 id="g-{g.id}">{g.id}</h3>
          {#if !items.length && !gen}<span class="muted small">None yet</span>{/if}
          <button class="btn icon plain add" aria-label="New {g.id.toLowerCase()} item" title="New {g.id.toLowerCase()} item" onclick={() => onnew(g.id)}><Icon name="plus" size={16} /></button>
        </div>
        {#if items.length || gen}
          <ul class="rows">
            {#each items as it (it.id)}
              {@const on = ui.wearing.has(it.id)}
              <li>
                <button class="row" class:sel={ui.selected === it.id} aria-pressed={on} onclick={() => toggleWear(it.id)}>
                  <span class="thumb-box"><Thumb item={it} size={28} /></span>
                  <span class="row-name">{it.name}</span>
                  <span class="wear" aria-hidden="true">{#if on}<Icon name="check" size={14} />{/if}</span>
                </button>
              </li>
            {/each}
            {#if gen}
              <li>
                <button class="row" class:sel={ui.selected === 'gen'} onclick={() => (ui.selected = 'gen')} aria-label="{GEN.name}, generating, about 2 minutes 40 left">
                  <span class="thumb-box pending"><span class="ring" style:--p="62"></span></span>
                  <span class="row-name">{GEN.name}</span>
                  <span class="muted small num">2:40</span>
                </button>
              </li>
            {/if}
          </ul>
        {/if}
      </section>
    {/each}

    <section class="group outfits" aria-labelledby="g-outfits">
      <div class="group-head">
        <span class="glyph" aria-hidden="true"><Icon name="bookmark" size={16} /></span>
        <h3 id="g-outfits">Outfits</h3>
        <button class="btn icon plain add" aria-label="Save current look" title="Save current look"><Icon name="plus" size={16} /></button>
      </div>
      <ul class="rows">
        {#each OUTFITS as o, i (o.id)}
          <li><button class="row" onclick={() => (ui.wearing = new Set(o.wear))}><span class="row-name">{o.name}</span>{#if i === 0}<span class="badge {gk('glass-badge')}">Current</span>{/if}</button></li>
        {/each}
      </ul>
    </section>
  </div>
</nav>
