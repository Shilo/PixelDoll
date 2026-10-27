<script lang="ts">
  import { Notice } from '@shilo/bronze-ui/svelte'
  import { onDestroy } from 'svelte'
  import { ui, doc, dismissToast, pauseToast, resumeToast } from './state.svelte.ts'
  import { experience } from './experience/state.svelte.ts'
  import { restoreTrigger } from './experience/focus.ts'

  let host = $state<HTMLDivElement>()
  let focusFrom: HTMLElement | null = null
  function dismiss() {
    const focused = host?.contains(document.activeElement)
    dismissToast()
    if (focused) restoreTrigger(focusFrom)
  }
  $effect(() => {
    if (!host) return
    void ui.size; void experience.screen; void doc.id
    const el = host
    const dialog = el.closest('dialog')
    const anchors = [...(dialog ?? document).querySelectorAll<HTMLElement>(dialog ? '.sheet-head' : '.experience-header,.scene-identity,.selection-import,.selection-create,.cast-library>.bu-input')]
    const position = () => {
      const box = el.getBoundingClientRect()
      let top = Math.max(16, Math.min(160, innerHeight * .14))
      const obstacles = anchors.filter(a => a.getClientRects().length).map(a => a.getBoundingClientRect()).sort((a,b) => a.top - b.top)
      // Intrinsic height keeps a clipped long message from oscillating between two positions.
      for (const a of obstacles) if (a.left < box.right && a.right > box.left && a.bottom > top && a.top < top + el.scrollHeight) top = a.bottom + 12
      top = Math.min(top, innerHeight - 60)
      const panel = !dialog && document.querySelector('.equipment-rail')?.getBoundingClientRect()
      const bottom = panel && panel.width > innerWidth * .8 && panel.top > top ? panel.top - 12 : innerHeight - 16
      el.style.setProperty('--toast-top', `${top}px`)
      el.style.setProperty('--toast-height', `${Math.max(44, Math.min(innerHeight * .45, bottom - top))}px`)
    }
    let frame = 0
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(position) }
    const observer = new ResizeObserver(schedule)
    for (const a of [el, ...anchors]) observer.observe(a)
    position(); addEventListener('resize', schedule)
    return () => { observer.disconnect(); cancelAnimationFrame(frame); removeEventListener('resize', schedule) }
  })
  onDestroy(() => { resumeToast('pointer'); resumeToast('focus') })
</script>

{#if ui.toast && (ui.toastTone === 'danger' || !ui.sheet || ui.toastSheet === ui.sheet)}
  <div class="toast" bind:this={host} role="presentation" onpointerenter={() => pauseToast('pointer')} onpointerleave={() => resumeToast('pointer')}
    onfocusin={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) focusFrom = e.relatedTarget as HTMLElement | null; pauseToast('focus') }}
    onfocusout={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) resumeToast('focus') }}>
    <Notice class="bu-toast" title={ui.toastTitle || undefined} tone={ui.toastTone} live ondismiss={dismiss}>{ui.toast}</Notice>
  </div>
{/if}
