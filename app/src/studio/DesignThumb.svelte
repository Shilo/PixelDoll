<script lang="ts">
  import { designPreview, type EquipmentDesign } from '../lib/equipment/index.ts'
  import type { Img } from '../lib/image/png.ts'
  import { crop, thumbCell } from './model.ts'
  import Sprite from './Sprite.svelte'
  import { ui } from './state.svelte.ts'
  let { design }: { design: EquipmentDesign } = $props()
  let image = $state.raw<Img | null>(null)
  $effect(() => {
    const d = design
    let stale = false
    void designPreview(d).then((p) => {
      const item = p.manifest.items.find((i) => i.id === d.itemId)
      if (!stale && item) { const cell = thumbCell(p, item); image = cell ? crop(cell) : null }
    }).catch(() => { /* The card still exposes a readable name and fit errors. */ })
    return () => { stale = true }
  })
  const k = $derived(image ? Math.max(1, Math.floor(Math.min(64 / image.w, 72 / image.h) * ui.dpr)) : 1)
</script>
<span class="thumb">{#if image}<Sprite img={image} {k} w={image.w} h={image.h} label="{design.name}, saved colourway" />{/if}</span>
<style>.thumb { display: grid; place-items: center; width: 80px; min-height: 80px; flex: none; border-radius: var(--r-ctl); background: var(--stage); overflow: hidden; }</style>
