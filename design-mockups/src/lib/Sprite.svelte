<script lang="ts" module>
  const cache = new Map<string, HTMLImageElement>()
  let loaded = $state(0)
  export function img(src: string) {
    let i = cache.get(src)
    if (!i) {
      i = new Image()
      i.onload = () => loaded++
      i.src = src
      cache.set(src, i)
    }
    return i
  }
  export const tick = () => loaded
</script>

<script lang="ts">
  import { BASE, CELL, ITEMS, MATERIALS, MOVES, ROW, sheet, type Dir, type Item, type MoveId } from '../data'
  import { ui } from '../state.svelte'

  let {
    dir: dirP, move: moveP, zoom = 4, wearing: wearP, only = null, checker = true, label = '', still = false,
  }: { dir?: Dir; move?: MoveId; zoom?: number; wearing?: Set<string>; only?: Item | null; checker?: boolean; label?: string; still?: boolean } = $props()
  const dir = $derived(dirP ?? ui.dir)
  const move = $derived(moveP ?? ui.move)
  const wearing = $derived(wearP ?? ui.wearing)

  let canvas: HTMLCanvasElement
  const filterFor = (it: Item) => {
    const m = MATERIALS.find((m) => m.id === it.material)
    return m?.options.find((o) => o.id === ui.colours[m.id])?.filter ?? 'none'
  }
  const layers = $derived.by(() => {
    if (only) return [only]
    const worn = ITEMS.filter((i) => wearing.has(i.id))
    const hidden = new Set(worn.flatMap((i) => i.hides ?? []))
    return [BASE, ...worn.filter((i) => !hidden.has(i.slot))].sort((a, b) => a.z - b.z)
  })
  const n = $derived(MOVES.find((m) => m.id === move)!.frames)

  $effect(() => {
    tick()
    const f = still ? 0 : ui.frame % n
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, CELL, CELL)
    for (const it of layers) {
      const im = img(sheet(it, move))
      if (!im.complete || !im.naturalWidth) continue
      ctx.save()
      ctx.filter = filterFor(it)
      if (dir === 'west') { ctx.translate(CELL, 0); ctx.scale(-1, 1) }
      const ff = it.moves.includes(move) ? f : f % 8
      ctx.drawImage(im, ff * CELL, ROW[dir] * CELL, CELL, CELL, 0, 0, CELL, CELL)
      ctx.restore()
    }
  })
</script>

<canvas
  bind:this={canvas}
  width={CELL}
  height={CELL}
  class="sprite"
  class:checker
  style:--z={zoom}
  role="img"
  aria-label={label || `Adventurer, ${MOVES.find((m) => m.id === move)!.name.toLowerCase()}, facing ${dir}`}
></canvas>
