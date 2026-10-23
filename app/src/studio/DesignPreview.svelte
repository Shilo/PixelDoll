<script lang="ts">
  import type { Project } from '../lib/store/manifest.ts'
  import { bakedFrame, composeCell } from '../lib/compose/compose.ts'
  import { moveDirs, coverageGaps } from '../lib/dress/dress.ts'
  import { itemCell } from './model.ts'
  import Sprite from './Sprite.svelte'
  import { ui } from './state.svelte.ts'

  let { project, itemId, itemOnly = false }: { project: Project; itemId: string; itemOnly?: boolean } = $props()
  const item = $derived(project.manifest.items.find((i) => i.id === itemId))
  let alone = $state(false)
  $effect(() => { void itemId; alone = itemOnly })
  let move = $state('')
  let zoom = $state(ui.size === 'compact' || ui.size === 'landscape' ? 2 : 3)
  const animations = $derived(project.manifest.rig.animations)
  const clip = $derived(animations.find((a) => a.id === move) ?? animations[0])
  const frame = $derived(bakedFrame(project.manifest))
  const gaps = $derived(item ? coverageGaps(project.manifest, item) : [])
  const k = $derived(Math.max(1, Math.round(zoom * ui.dpr)))
  const rows = $derived.by(() => {
    if (!item || !clip) return []
    return moveDirs(project.manifest, clip.id).map((dir) => ({ dir, frames: Array.from({ length: clip.cells }, (_, cell) => alone
      ? itemCell(project, item, clip.id, dir, cell)
      : composeCell(project, { [item.slot]: item.id }, clip.id, dir, cell, frame)) }))
  })
</script>

{#if item && clip}
  <div class="design-preview">
    <div class="field-row">
      <label class="field small"><span class="label">Move</span><select class="input" value={clip.id} onchange={(e) => (move = e.currentTarget.value)}>{#each animations as a (a.id)}<option value={a.id}>{a.id.replace(/-/g, ' ')}</option>{/each}</select></label>
      <label class="field small"><span class="label">Review zoom</span><select class="input" bind:value={zoom}><option value={2}>2×</option><option value={3}>3×</option><option value={4}>4×</option></select></label>
      <label class="check small"><input type="checkbox" bind:checked={alone} />Item only</label>
    </div>
    <p class="faint small">Every frame is shown below. Choose each move to check its directions and alignment.</p>
    {#if gaps.length}<p class="notice warn small">No item frames for {gaps.join(', ')}. The item stays empty in those views.</p>{/if}
    <div class="frames" aria-label="{item.name}, all frames of {clip.id}">
      {#each rows as row (row.dir)}
        <div class="direction"><b class="small">{row.dir.replace(/-/g, ' ')}</b>
          <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to scroll the frame strip.) -->
          <div class="strip" tabindex="0" role="region" aria-label="{row.dir} frames">
          {#each row.frames as im, n (n)}<figure><Sprite img={im} {k} w={im.w} h={im.h} checker label="{item.name}, {clip.id}, {row.dir}, frame {n + 1}" /><figcaption class="faint small">{n + 1}</figcaption></figure>{/each}
        </div></div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .design-preview { min-width: 0; }
  .field-row { gap: 16px; }
  .field { margin: 0; }
  .frames { display: grid; gap: 12px; }
  .direction { display: grid; gap: 4px; min-width: 0; }
  .strip { display: flex; overflow-x: auto; gap: 8px; padding-bottom: 6px; }
  figure { margin: 0; flex: none; text-align: center; }
</style>
