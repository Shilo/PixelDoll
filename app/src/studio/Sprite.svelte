<script lang="ts">
  // Crisp pixel sprite: the backing store is k DEVICE px per sprite px (integer), CSS size = cell * k / devicePixelRatio,
  // so pixels stay even at DPR 1.25 / 1.5 too (D1 §3.6). The checker squares are 8 sprite px.
  import type { Img } from '../lib/image/png.ts'
  import { ui } from './state.svelte.ts'
  let { img, k, w, h, limit, checker = false, label }: { img: Img | null; k: number; w?: number; h?: number; limit?: number; checker?: boolean; label: string } = $props()
  const width = $derived(w ?? img?.w ?? 64), height = $derived(h ?? img?.h ?? 64)
  let canvas: HTMLCanvasElement
  const src = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : null
  $effect(() => {
    const g = canvas.getContext('2d')!
    g.imageSmoothingEnabled = false
    g.clearRect(0, 0, canvas.width, canvas.height)
    if (!img || !src) return
    if (src.width !== img.w || src.height !== img.h) { src.width = img.w; src.height = img.h }
    src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0)
    g.drawImage(src, 0, 0, img.w * k, img.h * k)
  })
  const px = $derived(k / ui.dpr)
  // Small UI thumbnails may shrink for display; their backing pixels and the stored/exported artwork stay intact.
  const fit = $derived(limit ? Math.min(1, limit / Math.max(width * px, height * px)) : 1)
</script>

<span class="sprite-box" role="img" aria-label={label}><canvas
  bind:this={canvas}
  class="sprite"
  class:checker
  width={width * k}
  height={height * k}
  style:width="{width * px * fit}px"
  style:height="{height * px * fit}px"
  style:--chk="{16 * px}px"
></canvas></span>
