<script lang="ts">
  // One sheet at a time (HIG): centered on desktop, bottom sheet with a grabber on phones, trailing panel in phone landscape.
  import { openingTrigger,restoreTrigger } from './experience/focus.ts'
  import type { Snippet } from 'svelte'
  import { WORLDS } from './experience/config.ts'
  import { ui } from './state.svelte.ts'
  import Toast from './Toast.svelte'
  let { title, children, footer, heading, leading, trailing, onclose, cancel = 'Cancel', cancelDisabled = false, wide = false, className = '' }: {
    title: string; children: Snippet; footer?: Snippet; heading?: Snippet; leading?: Snippet; trailing?: Snippet; onclose: () => void; cancel?: string; cancelDisabled?: boolean; wide?: boolean; className?: string
  } = $props()
  let dlg: HTMLDialogElement
  // The native `close` event from our own unmount fires after a replacement sheet is already set; ignore it.
  let unmounting = false
  $effect(() => { ui.sheetBusy = cancelDisabled; return () => { ui.sheetBusy = false } })
  $effect(() => {
    // focus goes back to what opened the sheet (a menu item -> its menu button); text sheets start in their first field
    const from = openingTrigger(), pop = from?.closest<HTMLElement>('[popover]')
    const opener = pop ? document.querySelector<HTMLElement>(`[popovertarget="${pop.id}"]`) : from
    dlg.showModal()
    if (matchMedia('(pointer: fine)').matches) dlg.querySelector<HTMLElement>(':is(.sheet-heading, .sheet-body) :is(textarea, input:is([type=text], [type=password], :not([type])))')?.focus()
    return () => {
      unmounting = true
      dlg.close()
      restoreTrigger(opener)
    }
  })
  // HIG: Done/Close confirm and sit trailing; Cancel/Hide sit leading
  const cancelTrailing = $derived(cancel === 'Done' || cancel === 'Close')
  const kind = $derived(ui.size === 'compact' ? 'bottom' : ui.size === 'landscape' ? 'side' : 'center')
</script>

<dialog style:--creator-world="url('{WORLDS[ui.theme].backgrounds.creation}')" bind:this={dlg} class="sheet {kind} {className}" class:wide aria-labelledby="sheet-title" onclose={() => { if (!unmounting && !cancelDisabled) onclose() }} oncancel={(e) => { e.preventDefault(); if (!cancelDisabled) onclose() }}
  onclick={(e) => { if (e.target === dlg && !cancelDisabled) onclose() }}>
  {#if kind === 'bottom'}<div class="grabber" aria-hidden="true"></div>{/if}
  <header class="sheet-head">
    {#if leading}{@render leading()}{:else if cancelTrailing}<span></span>{:else}<button class="bu-action btn plain link" data-variant="quiet" disabled={cancelDisabled} onclick={onclose}>{cancel}</button>{/if}
    <div class="sheet-heading"><h2 id="sheet-title" class="sheet-title">{title}</h2>{#if heading}{@render heading()}{/if}</div>
    {#if trailing}{@render trailing()}{:else if cancelTrailing}<button class="bu-action btn plain link done" data-variant="quiet" disabled={cancelDisabled} onclick={onclose}>{cancel}</button>{:else}<span></span>{/if}
  </header>
  <div class="sheet-body">{@render children()}</div>
  {#if footer}<footer class="sheet-foot">{@render footer()}</footer>{/if}
  <Toast />
</dialog>

<style>
  .sheet-head { grid-template-columns: minmax(52px, 1fr) minmax(0, auto) minmax(52px, 1fr); }
  .sheet-title { min-width: 0; overflow-wrap: anywhere; }
  .sheet-heading { min-width:0; display:flex; align-items:center; justify-content:center; gap:12px; }
</style>
