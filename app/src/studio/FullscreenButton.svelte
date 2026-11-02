<script lang="ts">
  import { onMount } from 'svelte'
  import { Maximize, Minimize } from './icons.ts'
  import { toast } from './state.svelte.ts'

  let available = $state(false)
  let active = $state(false)
  let pending = $state(false)
  const label = $derived(active ? 'Exit full screen' : 'Enter full screen')

  onMount(() => {
    const display = matchMedia('(display-mode: fullscreen)')
    const sync = () => {
      active = !!document.fullscreenElement
      // Manifest fullscreen (and browser fullscreen) cannot be exited with exitFullscreen().
      available = active || (!!document.fullscreenEnabled
        && typeof document.documentElement.requestFullscreen === 'function'
        && typeof document.exitFullscreen === 'function' && !display.matches)
    }
    sync()
    document.addEventListener('fullscreenchange', sync)
    display.addEventListener('change', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      display.removeEventListener('change', sync)
    }
  })

  async function toggle() {
    if (pending) return
    pending = true
    const exiting = !!document.fullscreenElement
    try {
      if (exiting) await document.exitFullscreen()
      // Include the entire app, including native dialogs and popovers outside the scene.
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    } catch {
      toast(exiting ? 'Could not exit full screen. Try your browser’s full screen control.'
        : 'Could not enter full screen. Try again or use your browser’s full screen control.', { tone: 'danger' })
    } finally {
      pending = false
    }
  }
</script>

{#if available}
  <button class="bu-action header-fullscreen" data-variant="quiet" aria-label={label} title={label} disabled={pending} onclick={toggle}>
    {#if active}<Minimize size={20} />{:else}<Maximize size={20} />{/if}
  </button>
{/if}

<style>
  .header-fullscreen { min-width:44px; flex:none; }
</style>
