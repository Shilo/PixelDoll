<script lang="ts">
  // One sheet at a time (HIG): centred on desktop, bottom sheet with grabber on phones, trailing panel in phone landscape.
  import type { Snippet } from 'svelte'
  import { view, gk } from '../state.svelte'
  let { title, children, footer, onclose, cancel = 'Cancel', detent = 'large' }: {
    title: string; children: Snippet; footer?: Snippet; onclose: () => void; cancel?: string; detent?: 'medium' | 'large'
  } = $props()
  let dlg: HTMLDialogElement
  $effect(() => { dlg.showModal(); (document.activeElement as HTMLElement | null)?.blur(); return () => dlg.close() })
  const kind = $derived(view.size === 'compact' ? 'bottom' : view.size === 'landscape' ? 'side' : 'center')
</script>

<dialog bind:this={dlg} class="sheet {kind} {detent}" aria-labelledby="sheet-title" onclose={onclose} oncancel={onclose}>
  {#if kind === 'bottom'}<div class="grabber {gk('glass-sheet__grip')}" aria-hidden="true"></div>{/if}
  <header class="sheet-head">
    <button class="btn plain link" onclick={onclose}>{cancel}</button>
    <h2 id="sheet-title" class="sheet-title">{title}</h2>
    <span class="sheet-head-spacer"></span>
  </header>
  <div class="sheet-body">{@render children()}</div>
  {#if footer}<footer class="sheet-foot">{@render footer()}</footer>{/if}
</dialog>
