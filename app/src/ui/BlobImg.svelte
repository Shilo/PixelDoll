<script lang="ts">
  import { getBlob } from '../lib/store/db.ts'

  let { sha, scale = 2, title = '' }: { sha: string; scale?: number; title?: string } = $props()
  let url = $state('')
  let size = $state({ w: 0, h: 0 })
  $effect(() => {
    let u = ''
    getBlob(sha).then((b) => { if (b) url = u = URL.createObjectURL(b) })
    return () => { if (u) URL.revokeObjectURL(u) }
  })
</script>

{#if url}
  <img
    src={url}
    alt={title}
    {title}
    width={size.w * scale || undefined}
    onload={(e) => { const i = e.currentTarget as HTMLImageElement; size = { w: i.naturalWidth, h: i.naturalHeight } }}
  />
{/if}

<style>
  img { image-rendering: pixelated; background: repeating-conic-gradient(#ccc 0 25%, #eee 0 50%) 0 0 / 16px 16px; }
</style>
