<script lang="ts">
  import { lucide, pixel } from '../icons'
  // Lucide = UI icons (stroke). px = pixelarticons brand glyph (fill, kept at 24/48 px on the pixel grid).
  let { name, px = false, size = px ? 24 : 16, label = '' }: { name: string; px?: boolean; size?: number; label?: string } = $props()
</script>

{#if px}
  <svg class="ico px" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" shape-rendering="crispEdges" aria-hidden={!label} aria-label={label || undefined} role={label ? 'img' : undefined}>{@html pixel[name] ?? ''}</svg>
{:else}
  <svg class="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" style="stroke-width: var(--icon-stroke, 1.75)" stroke-linecap="round" stroke-linejoin="round" aria-hidden={!label} aria-label={label || undefined} role={label ? 'img' : undefined}>{@html lucide[name] ?? ''}</svg>
{/if}
