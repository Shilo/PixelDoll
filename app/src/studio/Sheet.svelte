<script lang="ts">
  // One sheet at a time (HIG): centred on desktop, bottom sheet with a grabber on phones, trailing panel in phone landscape.
  import type { Snippet } from 'svelte'
  import { ui } from './state.svelte.ts'
  let { title, children, footer, onclose, cancel = 'Cancel', cancelDisabled = false, wide = false }: {
    title: string; children: Snippet; footer?: Snippet; onclose: () => void; cancel?: string; cancelDisabled?: boolean; wide?: boolean
  } = $props()
  let dlg: HTMLDialogElement
  // The native `close` event from our own unmount fires after a replacement sheet is already set; ignore it.
  let unmounting = false
  $effect(() => {
    // focus goes back to what opened the sheet (a menu item -> its menu button); text sheets start in their first field
    const from = document.activeElement as HTMLElement | null, pop = from?.closest<HTMLElement>('[popover]')
    const opener = pop ? document.querySelector<HTMLElement>(`[popovertarget="${pop.id}"]`) : from
    dlg.showModal()
    if (matchMedia('(pointer: fine)').matches) dlg.querySelector<HTMLElement>('.sheet-body :is(textarea, input:is([type=text], [type=password], :not([type])))')?.focus()
    return () => {
      unmounting = true
      dlg.close()
      if (opener?.isConnected && !document.querySelector('dialog[open]')) opener.focus()
    }
  })
  // HIG: Done/Close confirm and sit trailing; Cancel/Hide sit leading
  const trailing = $derived(cancel === 'Done' || cancel === 'Close')
  const kind = $derived(ui.size === 'compact' ? 'bottom' : ui.size === 'landscape' ? 'side' : 'center')
</script>

<dialog bind:this={dlg} class="sheet {kind}" class:wide aria-labelledby="sheet-title" onclose={() => { if (!unmounting && !cancelDisabled) onclose() }} oncancel={(e) => { e.preventDefault(); if (!cancelDisabled) onclose() }}
  onclick={(e) => { if (e.target === dlg && !cancelDisabled) onclose() }}>
  {#if kind === 'bottom'}<div class="grabber" aria-hidden="true"></div>{/if}
  <header class="sheet-head">
    {#if trailing}<span></span>{:else}<button class="btn plain link" disabled={cancelDisabled} onclick={onclose}>{cancel}</button>{/if}
    <h2 id="sheet-title" class="sheet-title">{title}</h2>
    {#if trailing}<button class="btn plain link done" disabled={cancelDisabled} onclick={onclose}>{cancel}</button>{:else}<span></span>{/if}
  </header>
  <div class="sheet-body">{@render children()}</div>
  {#if footer}<footer class="sheet-foot">{@render footer()}</footer>{/if}
</dialog>
