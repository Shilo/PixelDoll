<script lang="ts">
  import { bakedFrame, composeCell } from '../lib/compose/compose.ts'
  import type { DirectionName } from '../lib/store/manifest.ts'
  import Sprite from './Sprite.svelte'
  import { ui, doc, store, view } from './state.svelte.ts'
  import { moveDirs } from '../lib/dress/dress.ts'
  import { ChevronDown, Grid2x2, Image, Minus, Pause, Play, Plus } from './icons.ts'

  let box: HTMLElement
  let w = $state(0), h = $state(0)
  $effect(() => {
    const ro = new ResizeObserver(([e]) => { w = e.contentRect.width; h = e.contentRect.height })
    ro.observe(box)
    return () => ro.disconnect()
  })

  const m = $derived(store.project?.manifest)
  // oversize layers (96 px held items) show whole: the stage uses the union frame of every layer around the pivot
  const frame = $derived(m ? bakedFrame(m) : undefined)
  const cellW = $derived(frame?.w ?? 64)
  const cellH = $derived(frame?.h ?? 64)
  const phone = $derived(ui.size !== 'expanded') // compact bar (no zoom / background) below 1024 px
  const barH = $derived(phone ? 64 : 64)
  const allDirs = $derived(m?.rig.directions ?? [])
  // B10: views the move has (the base has frames there); the others are disabled, not silently empty
  const made = $derived(m ? moveDirs(m, ui.anim) : [])
  const dirs = $derived(allDirs.filter((d) => made.includes(d.id)))
  const cols = $derived(ui.all ? Math.max(1, Math.min(dirs.length, w > h * 1.6 ? dirs.length : 2)) : 1)
  const rows = $derived(ui.all ? Math.ceil(dirs.length / cols) : 1)
  // integer device px per sprite px: largest that fits ("fit"), or the user's zoom
  const fit = $derived(Math.max(1, Math.floor(Math.min((w - 24 - (cols - 1) * 12) / cols, (h - barH - 24 - (rows - 1) * 30) / rows) * ui.dpr / cellH, 10 * ui.dpr)))
  const k = $derived(Math.max(1, Math.min(fit, ui.zoom || fit)))
  const zoomLabel = $derived(`${+(k / ui.dpr).toFixed(1)}×`)
  const step = $derived(Math.max(1, Math.round(ui.dpr)))

  const wearing = $derived(m ? m.items.filter((it) => it.id !== m.rig.baseItem && doc.items[it.slot] === it.id).map((it) => it.name) : [])
  const name = (d: DirectionName) => d[0].toUpperCase() + d.slice(1)
  const label = (d: DirectionName) => `${store.projects.find((p) => p.id === doc.id)?.name.replace(/ \(demo\)$/, '') ?? m?.name ?? 'Character'}, ${ui.anim.replace(/-/g, ' ')}, facing ${d}${wearing.length ? `, wearing ${wearing.join(', ')}` : ''}`
  const cellImg = (d: DirectionName) => (view.project && view.anim ? composeCell(view.project, doc.items, ui.anim, d, view.cell, frame) : null)
</script>

<div class="stage" bind:this={box}>
  {#if doc.loading && !m}
    <div class="stage-msg"><span class="ring spin" aria-hidden="true"></span><span class="sr">Loading</span></div>
  {:else if m}
    <div class="stage-art" style:padding-bottom="{barH}px">
      {#if ui.all}
        <div class="all-dirs" style:--cols={cols}>
          {#each dirs as d (d.id)}
            <figure>
              <button class="btn plain" style="height:auto;padding:0" onclick={() => { ui.dir = d.id; ui.all = false }} aria-label="Show {d.id} only">
                <Sprite img={cellImg(d.id)} {k} w={cellW} h={cellH} checker={ui.bg === 'checker'} label={label(d.id)} />
              </button>
              <figcaption>{name(d.id)}{d.mirrorOf ? ' (mirrored)' : ''}</figcaption>
            </figure>
          {/each}
        </div>
      {:else}
        <Sprite img={cellImg(ui.dir)} {k} w={cellW} h={cellH} checker={ui.bg === 'checker'} label={label(ui.dir)} />
      {/if}
    </div>

    <div class="canvas-bar" role="toolbar" aria-label="Preview controls">
      <button class="btn icon plain" aria-label={ui.playing ? 'Pause' : 'Play'} title="Play / pause (Space)" onclick={() => (ui.playing = !ui.playing)}>
        {#if ui.playing}<Pause size={16} />{:else}<Play size={16} />{/if}
      </button>
      <label class="select-wrap">
        <span class="sr">Move</span>
        <select class="select" bind:value={ui.anim} onchange={() => (ui.frame = 0)}>
          {#each m.rig.animations as a (a.id)}<option value={a.id}>{a.id[0].toUpperCase() + a.id.slice(1).replace(/-/g, ' ')}</option>{/each}
        </select>
        <ChevronDown size={12} />
      </label>
      <span class="bar-sep" aria-hidden="true"></span>
      <div class="seg" role="group" aria-label="Direction">
        {#each allDirs as d, i (d.id)}
          <button aria-pressed={!ui.all && ui.dir === d.id} aria-label="Face {d.id}" disabled={!made.includes(d.id)} title={made.includes(d.id) ? `Face ${d.id} (${i + 1})` : `This move has no ${d.id} view`} onclick={() => { ui.all = false; ui.dir = d.id }}>{d.id.split('-').map((x) => x[0].toUpperCase()).join('')}</button>
        {/each}
      </div>
      <button class="btn icon plain" aria-pressed={ui.all} aria-label="All directions" title="All directions (0)" onclick={() => (ui.all = !ui.all)}><Grid2x2 size={16} /></button>
      {#if !phone}
        <span class="bar-sep" aria-hidden="true"></span>
        <button class="btn icon plain" aria-label="Zoom out" title="Zoom out (−)" disabled={k <= 1} onclick={() => (ui.zoom = Math.max(1, k - step))}><Minus size={14} /></button>
        <button class="btn plain sm zoom-val num" title="Fit" aria-label="Zoom {zoomLabel}, click to fit" onclick={() => (ui.zoom = 0)}>{zoomLabel}</button>
        <button class="btn icon plain" aria-label="Zoom in" title="Zoom in (+)" disabled={k >= fit} onclick={() => (ui.zoom = Math.min(fit, k + step))}><Plus size={14} /></button>
        <button class="btn icon plain" aria-pressed={ui.bg === 'solid'} aria-label="Background: {ui.bg}" title="Background (checker / plain)" onclick={() => (ui.bg = ui.bg === 'checker' ? 'solid' : 'checker')}><Image size={16} /></button>
      {/if}
    </div>
  {:else}
    <div class="stage-msg">{doc.error || 'Nothing to show'}</div>
  {/if}
</div>
