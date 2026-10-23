<script lang="ts">
  let { body, frame }: { body: number; frame: number } = $props()
  let canvas: HTMLCanvasElement
  $effect(() => {
    const ctx = canvas.getContext('2d')!
    const cell = Math.max(32, Math.min(256, frame || 80)), size = Math.max(1, Math.min(cell, body || 64))
    canvas.width = canvas.height = cell
    ctx.clearRect(0, 0, cell, cell)
    ctx.fillStyle = '#afbad1'
    const u = size / 16, x = Math.floor((cell - size) / 2), y = Math.max(0, cell - size - 4)
    const rect = (a: number, b: number, w: number, h: number) => ctx.fillRect(x + Math.round(a * u), y + Math.round(b * u), Math.max(1, Math.round(w * u)), Math.max(1, Math.round(h * u)))
    rect(6, 1, 4, 4); rect(5, 6, 6, 5); rect(3, 6, 2, 6); rect(11, 6, 2, 6); rect(5, 11, 2, 5); rect(9, 11, 2, 5)
  })
</script>

<div class="size-guide" role="img" aria-label="Size guide: {body || '—'} pixel body canvas inside a {frame || '—'} pixel frame">
  <div class="preview-box"><canvas bind:this={canvas}></canvas></div>
  <div class="sizes"><span>Body <b>{body || '—'} px</b></span><span>Frame <b>{frame || '—'} × {frame || '—'} px</b></span></div>
</div>

<style>
  .size-guide { height:130px; display:grid; grid-template-columns:minmax(0,128px) 88px; align-items:start; gap:12px; padding-top:2px; }
  .preview-box { width:100%; aspect-ratio:1; border:1px solid var(--line-strong); border-radius:4px; background:repeating-conic-gradient(var(--bg-hover) 0% 25%, var(--bg-side) 0% 50%) 50% / 16px 16px; }
  canvas { display:block; width:100%; height:100%; image-rendering:pixelated; }
  .sizes { display:flex; flex-direction:column; align-items:flex-start; gap:10px; color:var(--text-3); font-size:var(--fs-sm); line-height:1.3; font-variant-numeric:tabular-nums; }
  .sizes > span { display:flex; flex-direction:column; gap:2px; }
  b { color:var(--text-2); font-weight:400; white-space:nowrap; }
</style>
