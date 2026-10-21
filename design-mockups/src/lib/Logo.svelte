<script lang="ts">
  // Brand mark: a 12×12 pixel doll (crisp at 2×). Wordmark in the display font (Pixelify Sans in AE/E).
  let { big = false }: { big?: boolean } = $props()
</script>

<span class="logo" class:big>
  <svg class="mark" viewBox="0 0 12 12" width={big ? 48 : 24} height={big ? 48 : 24} shape-rendering="crispEdges" aria-hidden="true">
    <rect width="12" height="12" class="mark-bg" />
    <path class="mark-fg" d="M4 2h4v3H4zM3 6h6v3H3zM4 9h1v2H4zM7 9h1v2H7z" />
    <path class="mark-hi" d="M4 2h4v1H4z" />
  </svg>
  <span class="word">PixelDoll</span>
</span>
