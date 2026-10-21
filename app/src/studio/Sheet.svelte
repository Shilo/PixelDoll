<script lang="ts">
  // One sheet at a time (HIG): centred on desktop, bottom sheet with a grabber on phones, trailing panel in phone landscape.
  import type { Snippet } from 'svelte'
  import { ui } from './state.svelte.ts'
  let { title, children, footer, onclose, cancel = 'Cancel', wide = false }: {
    title: string; children: Snippet; footer?: Snippet; onclose: () => void; cancel?: string; wide?: boolean
  } = $props()
  let dlg: HTMLDialogElement
  // The native `close` event from our own unmount fires after a replacement sheet is already set; ignore it.
  let unmounting = false
  $effect(() => {
    dlg.showModal()
    return () => { unmounting = true; dlg.close() }
  })
  const kind = $derived(ui.size === 'compact' ? 'bottom' : ui.size === 'landscape' ? 'side' : 'center')
</script>

<dialog bind:this={dlg} class="sheet {kind}" class:wide aria-labelledby="sheet-title" onclose={() => { if (!unmounting) onclose() }} oncancel={(e) => { e.preventDefault(); onclose() }}
  onclick={(e) => { if (e.target === dlg) onclose() }}>
  {#if kind === 'bottom'}<div class="grabber" aria-hidden="true"></div>{/if}
  <header class="sheet-head">
    <button class="btn plain link" onclick={onclose}>{cancel}</button>
    <h2 id="sheet-title" class="sheet-title">{title}</h2>
    <span></span>
  </header>
  <div class="sheet-body">{@render children()}</div>
  {#if footer}<footer class="sheet-foot">{@render footer()}</footer>{/if}
</dialog>
