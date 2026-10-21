<script lang="ts">
  // Item thumbnail: the item's south walk frame 0, cropped to its pixels, drawn at the largest integer scale that fits.
  import { CELL, MATERIALS, sheet, type Item } from '../data'
  import { ui } from '../state.svelte'
  import { img, tick } from './Sprite.svelte'
  let { item, size = 40 }: { item: Item; size?: number } = $props()
  let canvas: HTMLCanvasElement
  const tmp = document.createElement('canvas')
  tmp.width = tmp.height = CELL

  $effect(() => {
    tick()
    const im = img(sheet(item, 'walk'))
    const m = MATERIALS.find((m) => m.id === item.material)
    const filter = m?.options.find((o) => o.id === ui.colours[m.id])?.filter ?? 'none'
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, size, size)
    if (!im.complete || !im.naturalWidth) return
    const t = tmp.getContext('2d', { willReadFrequently: true })!
    t.clearRect(0, 0, CELL, CELL)
    t.drawImage(im, 0, 0, CELL, CELL, 0, 0, CELL, CELL)
    const d = t.getImageData(0, 0, CELL, CELL).data
    let x0 = CELL, y0 = CELL, x1 = -1, y1 = -1
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (d[(y * CELL + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
    }
    if (x1 < 0) return
    const w = x1 - x0 + 1, h = y1 - y0 + 1
    const k = Math.max(1, Math.floor(Math.min(size / w, size / h)))
    ctx.imageSmoothingEnabled = false
    ctx.filter = filter
    ctx.drawImage(tmp, x0, y0, w, h, Math.floor((size - w * k) / 2), Math.floor((size - h * k) / 2), w * k, h * k)
  })
</script>

<canvas bind:this={canvas} width={size} height={size} class="thumb" style:width="{size}px" style:height="{size}px" role="img" aria-label={item.name}></canvas>
