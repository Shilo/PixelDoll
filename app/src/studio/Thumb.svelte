<script lang="ts">
  // Static item-only art. Crop once per source change; CSS fits the native pixels without resize observers or playback work.
  import type { Item, Project } from '../lib/store/manifest.ts'
  import { crop, groupOf, thumbCell } from './model.ts'
  import Sprite from './Sprite.svelte'
  import GroupIcon from './GroupIcon.svelte'
  let { project, item }: { project: Project; item: Item } = $props()
  const im = $derived.by(() => { const c = thumbCell(project, item); return c && crop(c) })
</script>

{#if im}<Sprite img={im} k={1} w={im.w} h={im.h} fitToBox label={item.name} />{:else}<GroupIcon group={groupOf(item.slot).id} size={24} />{/if}
