<script lang="ts">
  import Icon from './Icon.svelte'
  import Sprite from './Sprite.svelte'
  import Colours from './Colours.svelte'
  import Moves from './Moves.svelte'
  import GenCard from './GenCard.svelte'
  import { DIRS, ITEMS } from '../data'
  import { ui, gk } from '../state.svelte'
  const it = $derived(ITEMS.find((i) => i.id === ui.selected))
  const below = $derived(it?.slot === 'head' ? 'Hair' : it?.slot === 'back' ? 'Body' : 'Base body')
</script>

<div class="inspector">
  <div class="seg full {gk('glass-segmented glass-segmented--full')}" role="group" aria-label="Inspector">
    {#each [['item', 'Item'], ['colours', 'Colours'], ['moves', 'Moves']] as [id, label]}
      <button class={gk('glass-segmented__item')} aria-pressed={ui.inspTab === id} onclick={() => (ui.inspTab = id as typeof ui.inspTab)}>{label}</button>
    {/each}
  </div>

  <div class="insp-body">
    {#if ui.inspTab === 'colours'}
      <Colours />
    {:else if ui.inspTab === 'moves'}
      <Moves />
    {:else if ui.selected === 'gen'}
      <GenCard />
    {:else if it}
      <header class="insp-head">
        <h2 class="insp-title">{it.name}</h2>
        <p class="insp-sub"><span>{it.group}</span><span class="badge ok {gk('glass-badge glass-badge--success')}"><Icon name="circle-check" size={12} />Clean</span></p>
      </header>

      <div class="dir-strip" aria-label="{it.name} in all directions">
        {#each DIRS as d}<Sprite dir={d} zoom={1} still={false} />{/each}
      </div>

      {#if it.material}<Colours only={it.material} />{/if}

      <div class="field-row">
        <span class="label">Layer</span>
        <label class="select-wrap boxed"><span class="sr">Layer order</span><select class="select {gk('glass-select')}"><option>In front of {below}</option><option>Behind {below}</option></select><Icon name="chevron-down" size={12} /></label>
      </div>

      <div class="insp-actions">
        <button class="btn {gk('glass-btn glass-btn--secondary glass-btn--sm')}"><Icon name="refresh-cw" size={14} /><span>Try again</span><span class="cost">30 gens</span></button>
        <button class="btn plain danger {gk('glass-btn glass-btn--tertiary glass-btn--sm')}"><Icon name="trash-2" size={14} /><span>Remove</span></button>
      </div>

      <details class="disclosure">
        <summary><Icon name="chevron-right" size={14} />Details</summary>
        <dl class="kv">
          <dt>Checks</dt><dd>8 of 8 passed</dd>
          <dt>Version</dt><dd>2 of 2 · 30 gens</dd>
          <dt>Prompt</dt><dd>“{it.name.toLowerCase()}”</dd>
        </dl>
      </details>
    {/if}
  </div>
</div>
