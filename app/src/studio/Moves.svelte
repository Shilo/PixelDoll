<script lang="ts">
  import { composeCell } from '../lib/compose/compose.ts'
  import Sprite from './Sprite.svelte'
  import { makeImg, type Img } from '../lib/image/png.ts'
  import { ui, doc, store, view, isDemo, moving } from './state.svelte.ts'
  import { ChevronRight, Plus } from './icons.ts'
  const m = $derived(store.project?.manifest)
  const nice = (id: string) => id[0].toUpperCase() + id.slice(1).replace(/-/g, ' ')
  const k = $derived(Math.max(1, Math.floor(ui.dpr)))
  // fixed 56 px window (bottom-centred, no per-frame jitter) so the thumbnail is shown 1:1 instead of shrunk
  const win = (im: Img) => {
    if (im.w < 56 || im.h < 56) return im
    const o = makeImg(56, 56), x0 = (im.w - 56) >> 1, y0 = im.h - 56
    for (let y = 0; y < 56; y++) o.data.set(im.data.subarray(((y0 + y) * im.w + x0) * 4, ((y0 + y) * im.w + x0 + 56) * 4), y * 56 * 4)
    return o
  }
</script>

<div class="colours">
  <span class="sec-title">Moves</span>
  {#if m && view.project}
    <div class="move-list">
      {#each m.rig.animations as a (a.id)}
        {@const base = m.items.find((i) => i.id === m.rig.baseItem)}
        {@const dirs = m.rig.directions.filter((d) => !d.mirrorOf && base?.layers[0].cells?.[a.id]?.[d.id]?.some(Boolean))}
        <button class="move-row" aria-pressed={ui.anim === a.id} onclick={() => { ui.anim = a.id; ui.frame = 0; ui.playing = true }}>
          <span class="move-thumb"><Sprite img={win(composeCell(view.project, doc.items, a.id, dirs[0]?.id ?? 'south', a.frames[ui.frame % a.frames.length].cell))} {k} w={56} h={56} label="{nice(a.id)} preview" /></span>
          <span class="move-text"><b>{nice(a.id)}</b><span class="muted small">{a.cells} frames · {dirs.length + m.rig.directions.filter((d) => d.mirrorOf && dirs.some((x) => x.id === d.mirrorOf)).length} directions</span></span>
        </button>
      {/each}
    </div>
    <details class="disclosure">
      <summary><ChevronRight size={14} />Details</summary>
      <div>
        <dl class="kv">
          {#each m.rig.animations as a (a.id)}
            {@const src = Object.values(a.sources ?? {})[0]}
            <dt>{a.id}</dt><dd>{a.frames.map((f) => `${f.cell}:${f.ms}ms`).join(' ')}{src ? ` · ${src.route}, ${src.motion}` : a.source?.mode ? ` · ${a.source.mode}` : ''}</dd>
          {/each}
          <dt>Cell</dt><dd>{m.rig.cell.w}×{m.rig.cell.h}, pivot {m.rig.pivot.x},{m.rig.pivot.y}</dd>
          <dt>Directions</dt><dd>{m.rig.directions.map((d) => d.id + (d.mirrorOf ? ` (mirror of ${d.mirrorOf})` : '')).join(', ')}</dd>
        </dl>
      </div>
    </details>
    {#if moving.spec && moving.projectId === doc.id && !moving.done}
      <button class="move-row" onclick={() => (ui.sheet = 'move')}><span class="ring spin" aria-hidden="true"></span><span class="move-text"><b>{nice(moving.spec.id)}</b><span class="muted small">{moving.error ? 'Failed: tap for details' : `Adding… ${moving.progress?.done ?? 0}/${moving.progress?.total ?? '?'}`}</span></span></button>
    {/if}
    {#if !isDemo()}<button class="btn" onclick={() => (ui.sheet = 'move')}><Plus size={16} />Add a move</button>{/if}
  {/if}
</div>
