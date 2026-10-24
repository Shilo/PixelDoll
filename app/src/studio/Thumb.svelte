<script lang="ts">
  // Item thumbnail: opaque crop of the item's first non-empty cell, integer-scaled to fit `size` CSS px.
  import type { Item, Project } from '../lib/store/manifest.ts'
  import { crop, thumbCell } from './model.ts'
  import { ui } from './state.svelte.ts'
  import Sprite from './Sprite.svelte'
  let { project, item, size }: { project: Project; item: Item; size: number } = $props()
  const im = $derived.by(() => { const c = thumbCell(project, item); return c && crop(c) })
  const k = $derived(im ? Math.max(1, Math.floor((size * ui.dpr) / Math.max(im.w, im.h))) : 1)
</script>

{#if im}<Sprite img={im} {k} w={im.w} h={im.h} limit={size} label={item.name} />{/if}
