<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { pwa, startPwa, setPwaActions, applyUpdate, installApp } from '../lib/pwa.ts'
  import { prepareForUpdate, updateBlocked } from './state.svelte.ts'
  import { restoreTrigger } from './experience/focus.ts'

  let dialog: HTMLDialogElement
  let mode = $state<'update' | 'install' | null>(null)
  let busy = $state(false), error = $state('')
  let from: HTMLElement | null = null
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  async function show(next: 'update' | 'install') {
    if (busy || mode) return
    from = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.querySelectorAll<HTMLElement>('[popover]:popover-open').forEach(el => el.hidePopover())
    error = ''; mode = next
    await tick()
    if (mode !== next || (next === 'install' && $pwa.installed)) return
    dialog.showModal()
    if (next === 'update') {
      const reason = updateBlocked()
      if (reason) { error = reason; return }
      if (!$pwa.ready) { error = 'The update is still downloading. Reconnect and try again when it is ready.'; return }
      busy = true
      try { await applyUpdate(prepareForUpdate) }
      catch (e) { error = (e as Error).message; busy = false }
    }
  }
  function close() {
    if (busy) return
    dialog.close(); mode = null; restoreTrigger(from)
  }
  async function install() { if (await installApp() && mode === 'install') close() }
  $effect(() => { if (mode === 'install' && $pwa.installed) close() })
  onMount(() => {
    const stop = startPwa()
    const off = setPwaActions(() => { void show('update') }, () => { void show('install') })
    // With Close disabled, native Tab can focus BODY outside the modal. Shield global Studio shortcuts there too.
    const shield = (event: Event) => {
      if (dialog.open && (!(event.target instanceof Node) || !dialog.contains(event.target))) {
        event.stopImmediatePropagation()
        if (event.cancelable) event.preventDefault()
      }
    }
    window.addEventListener('keydown', shield, true)
    window.addEventListener('wheel', shield, { capture: true, passive: false })
    return () => {
      window.removeEventListener('keydown', shield, true); window.removeEventListener('wheel', shield, true)
      off(); stop()
    }
  })
</script>

<dialog bind:this={dialog} class="sheet center pwa-dialog" aria-labelledby="pwa-dialog-title" aria-describedby="pwa-dialog-description" onkeydown={e => e.stopPropagation()} onwheel={e => e.stopPropagation()} oncancel={e => { e.preventDefault(); close() }}>
  {#if mode}
  <header class="sheet-head"><span></span><h2 id="pwa-dialog-title" class="sheet-title">{mode === 'install' ? 'Installation help' : busy ? 'Updating PixelDoll' : 'Update paused'}</h2><button class="bu-action" data-variant="quiet" disabled={busy} onclick={close}>Close</button></header>
  <div class="sheet-body" id="pwa-dialog-description">
    {#if mode === 'install'}
      {#if $pwa.installError}<p role="alert">{$pwa.installError}</p>{/if}
      {#if $pwa.installable || $pwa.installing}
        <p>Your browser is ready to install PixelDoll on this device.</p>
        <button class="bu-action" data-variant="primary" disabled={$pwa.installing} onclick={install}>Install PixelDoll</button>
      {:else}
        <p>A browser install prompt isn’t available in this window. If PixelDoll is already installed, open it from your apps.</p>
        {#if ios}<p>On iPhone or iPad, open PixelDoll in Safari, tap Share, then Add to Home Screen and Open as Web App if offered.</p>
        {:else}<p>If your browser offers Install app, Add to Dock, or Add to Home Screen, use that command. You can also open PixelDoll in a browser that supports installation.</p>{/if}
      {/if}
      <p>Saved characters, dressing, recoloring, device import, and export work offline after the app files finish downloading. PixelLab generation, account information, and its library need a connection.</p>
      <p role="status">{$pwa.offlineReady ? 'App files are ready for offline launches.' : 'Offline files are not ready yet. Keep PixelDoll open while connected.'}</p>
      {#if $pwa.error}<p role="status">{$pwa.error}</p>{/if}
    {:else if error}<p role="alert">{error}</p><p>Your work is still open. Use the update notice when you are ready.</p>
    {:else}<p role="status">Saving your outfit and verifying the complete update. Keep this tab open.</p>{/if}
  </div>
  {/if}
</dialog>

<style>
  .pwa-dialog { max-width:min(32rem, calc(100vw - 32px)); }
  .pwa-dialog .sheet-head { grid-template-columns: 1fr auto 1fr; }
  .pwa-dialog .sheet-head button { justify-self:end; }
  .pwa-dialog .sheet-body { display:grid; gap:12px; }
  .pwa-dialog p { margin:0; }
</style>
