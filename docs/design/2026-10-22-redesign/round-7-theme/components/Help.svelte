<script>
  import { onMount, tick } from 'svelte';
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  let { label, text } = $props();
  const id = $props.id();
  let trigger, tip, open = $state(false), timer;
  function hide() { clearTimeout(timer); open = false; tip?.hidePopover(); }
  function deferHide() { clearTimeout(timer); timer = setTimeout(hide, 150); }
  async function show() {
    clearTimeout(timer); open = true; tip.showPopover(); await tick();
    const r = trigger.getBoundingClientRect(), t = tip.getBoundingClientRect();
    tip.style.left = Math.max(12, Math.min(r.left, innerWidth - t.width - 12)) + 'px';
    tip.style.top = Math.max(12, r.bottom + t.height + 8 < innerHeight ? r.bottom + 6 : r.top - t.height - 6) + 'px';
  }
  onMount(() => {
    const key = e => { if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); } };
    const outside = e => { if (open && !trigger.contains(e.target) && !tip.contains(e.target)) hide(); };
    document.addEventListener('keydown', key, true); document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', hide); window.addEventListener('scroll', hide, true);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', key, true); document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', hide); window.removeEventListener('scroll', hide, true); };
  });
</script>
<span class="pd-help">
  <button bind:this={trigger} class="pd-btn" data-icon data-variant="quiet" aria-label={label} aria-describedby={open ? id : undefined} onpointerenter={e => { if (e.pointerType === 'mouse') show(); }} onpointerleave={e => { if (e.pointerType === 'mouse') deferHide(); }} onfocus={() => { if (trigger.matches(':focus-visible')) show(); }} onblur={hide} onclick={show}><CircleHelp /></button>
  <span bind:this={tip} {id} role="tooltip" popover="manual" class="pd-tooltip" onpointerenter={() => clearTimeout(timer)} onpointerleave={deferHide}>{text}</span>
</span>
