<script lang="ts">
  import { Notice } from '@shilo/bronze-ui/svelte'
  import { pwa, requestUpdate } from '../lib/pwa.ts'
  import { app } from '../lib/app.svelte.ts'
</script>

{#if $pwa.available}
  <Notice class="bu-toast" title={`Update to v${$pwa.available.version}`} tone="info" live onactivate={$pwa.ready ? requestUpdate : undefined}>
    {#if $pwa.ready}Available. Reloads this tab; your saved characters and outfits stay. View and undo history reset.{:else}Downloading for offline use. Your current work can continue.{/if}
    {#if app.key && !app.remembered}Your session-only PixelLab connection will need reconnecting.{/if}
    {#if $pwa.error}<span>{$pwa.error}</span>{/if}
  </Notice>
{/if}
