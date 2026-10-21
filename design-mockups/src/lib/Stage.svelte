<script lang="ts">
  import Icon from './Icon.svelte'
  import Sprite from './Sprite.svelte'
  import { CELL, DIRS, MOVES } from '../data'
  import { ui, view, gk } from '../state.svelte'

  let box: HTMLElement
  let w = $state(0), h = $state(0)
  const phone = $derived(view.size === 'compact' || view.size === 'landscape')
  const barH = $derived(phone ? 68 : 80)
  // Integer zoom only: largest k that fits (capped), D1 §3.6 rule 1.
  const fit = $derived(Math.max(1, Math.min(phone ? 6 : 7, Math.floor(Math.min((ui.all ? (w - 48) / (4 * CELL + 3 * 8) : (w - 32) / CELL), (h - barH - 16) / CELL)))))
  const zoom = $derived(ui.zoom || fit)

  $effect(() => {
    const ro = new ResizeObserver(([e]) => { w = e.contentRect.width; h = e.contentRect.height })
    ro.observe(box)
    return () => ro.disconnect()
  })
</script>

<div class="stage" bind:this={box} class:solid={ui.bg === 'solid'}>
  <div class="stage-art" style:padding-bottom="{barH}px">
    {#if ui.all}
      <div class="all-dirs">
        {#each DIRS as d}<figure><Sprite dir={d} {zoom} checker={ui.bg === 'checker'} /><figcaption>{d[0].toUpperCase() + d.slice(1)}</figcaption></figure>{/each}
      </div>
    {:else}
      <div class="floor-wrap"><Sprite {zoom} checker={ui.bg === 'checker'} /></div>
    {/if}
  </div>

  <div class="canvas-bar" role="toolbar" aria-label="Preview controls">
    <button class="btn icon plain" aria-label={ui.playing ? 'Pause' : 'Play'} title="Play / pause (Space)" onclick={() => (ui.playing = !ui.playing)}><Icon name={ui.playing ? 'pause' : 'play'} size={16} /></button>
    <label class="select-wrap">
      <span class="sr">Move</span>
      <select class="select plain {gk('')}" bind:value={ui.move}>{#each MOVES as m}<option value={m.id}>{m.name}</option>{/each}</select>
      <Icon name="chevron-down" size={12} />
    </label>
    <span class="bar-sep" aria-hidden="true"></span>
    <div class="seg dirs {gk('glass-segmented')}" role="group" aria-label="Direction">
      {#each DIRS as d}
        <button class="{gk('glass-segmented__item')}" aria-pressed={!ui.all && ui.dir === d} aria-label="Face {d}" title="Face {d}" onclick={() => { ui.all = false; ui.dir = d }}>{d[0].toUpperCase()}</button>
      {/each}
    </div>
    <button class="btn icon plain" aria-pressed={ui.all} aria-label="All directions" title="All directions (0)" onclick={() => (ui.all = !ui.all)}><Icon name="grid-2x2" size={16} /></button>
    {#if !phone}
      <span class="bar-sep" aria-hidden="true"></span>
      <div class="zoom" role="group" aria-label="Zoom">
        <button class="btn icon plain" aria-label="Zoom out" onclick={() => (ui.zoom = Math.max(1, zoom - 1))}><Icon name="minus" size={14} /></button>
        <span class="num zoom-val" aria-live="polite">{zoom}×</span>
        <button class="btn icon plain" aria-label="Zoom in" onclick={() => (ui.zoom = Math.min(12, zoom + 1))}><Icon name="plus" size={14} /></button>
      </div>
      <button class="btn icon plain" aria-label="Background: {ui.bg}" title="Background (checker / solid)" onclick={() => (ui.bg = ui.bg === 'checker' ? 'solid' : 'checker')}><Icon name="image" size={16} /></button>
    {/if}
  </div>
</div>
