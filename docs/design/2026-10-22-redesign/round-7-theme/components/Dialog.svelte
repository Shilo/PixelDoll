<script>
  let { open = $bindable(false), title, children, footer, busy = false, returnTo } = $props();
  const id = $props.id();
  let dialog, opener;
  $effect(() => {
    if (open && !dialog.open) {
      // WebKit does not necessarily focus a button on pointer activation.
      opener = returnTo ?? document.activeElement;
      const popover = opener?.closest('[popover]');
      if (popover?.id) opener = document.querySelector(`[aria-controls="${CSS.escape(popover.id)}"], [popovertarget="${CSS.escape(popover.id)}"]`) ?? opener;
      dialog.showModal();
    }
    else if (!open && dialog.open) { dialog.close(); (opener?.isConnected ? opener : document.querySelector('main'))?.focus(); }
  });
  function close() { if (!busy) open = false; }
</script>
<dialog bind:this={dialog} class="pd-dialog" aria-labelledby={id} oncancel={e => { e.preventDefault(); close(); }} onclose={() => { open = false; }}>
  <header class="pd-dialog-head"><h2 {id}>{title}</h2><button class="pd-btn" data-variant="quiet" onclick={close} disabled={busy}>Close</button></header>
  <div class="pd-dialog-body">{@render children()}</div>
  {#if footer}<footer class="pd-dialog-foot">{@render footer()}</footer>{/if}
</dialog>
