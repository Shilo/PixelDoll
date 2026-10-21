<script lang="ts">
  import Icon from './Icon.svelte'
  import { MATERIALS } from '../data'
  import { ui, gk } from '../state.svelte'
  // Recolour = pick a ramp per material (free, instant). `only` limits to one material (item inspector).
  let { only = null, title = true }: { only?: string | null; title?: boolean } = $props()
  const mats = $derived(only ? MATERIALS.filter((m) => m.id === only) : MATERIALS)
  const randomize = () => { for (const m of MATERIALS) ui.colours[m.id] = m.options[Math.floor(Math.random() * m.options.length)].id }
</script>

<div class="colours">
  {#if title}
    <div class="sec-head">
      <h3 class="sec-title">Colours</h3>
      {#if !only}<button class="btn sm {gk('glass-btn glass-btn--tertiary glass-btn--auto glass-btn--sm')}" onclick={randomize}><Icon name="shuffle" size={14} /><span>Shuffle</span></button>{/if}
    </div>
  {/if}
  {#each mats as m (m.id)}
    <div class="mat" role="radiogroup" aria-label="{m.name} colour">
      <span class="mat-name">{m.name}</span>
      <div class="swatches">
        {#each m.options as o (o.id)}
          <button class="swatch" role="radio" aria-checked={ui.colours[m.id] === o.id} aria-label={o.name} title={o.name} onclick={() => (ui.colours[m.id] = o.id)}>
            {#each o.ramp as c}<i style:background={c}></i>{/each}
          </button>
        {/each}
        <button class="swatch add" aria-label="Custom {m.name.toLowerCase()} colour" title="Custom colour"><Icon name="plus" size={14} /></button>
      </div>
    </div>
  {/each}
</div>
