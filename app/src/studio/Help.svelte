<script lang="ts">
  import { tick } from 'svelte'
  import CircleHelp from '@lucide/svelte/icons/circle-help'
  import PopoverArrow from './PopoverArrow.svelte'
  let { title, text, iconOnly = false, tooltipId }: { title: string; text: string; iconOnly?: boolean; tooltipId?: string } = $props()
  const generatedId = $props.id()
  const id = $derived(tooltipId ?? generatedId)
  let button: HTMLButtonElement
  let tip: HTMLDivElement
  let open = $state(false), left = $state(8), top = $state(8)
  export async function show() {
    open = true
    if (!tip.matches(':popover-open')) tip.showPopover()
    await tick()
    if (!open) return
    position()
  }
  function position() {
    const r = button.getBoundingClientRect()
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) { hide(); return }
    const width = tip.offsetWidth
    left = Math.max(8, Math.min(r.left + r.width / 2 - width / 2, innerWidth - width - 8))
    const height = tip.offsetHeight
    const below = innerHeight - r.bottom - 8, above = r.top - 8
    const side = below >= height + 8 || below >= above ? 'bottom' : 'top'
    tip.dataset.side = side
    top = Math.max(8, side === 'bottom' ? r.bottom + 8 : r.top - height - 8)
    tip.style.setProperty('--bu-arrow-x', `${Math.max(12, Math.min(width - 24, r.left + r.width / 2 - left - 6))}px`)
    tip.dataset.positioned = ''
  }
  export function hide() { open = false; if (tip) { delete tip.dataset.positioned; if (tip.matches(':popover-open')) tip.hidePopover() } }
  $effect(() => {
    if (!open) return
    window.addEventListener('scroll', position, true)
    return () => window.removeEventListener('scroll', position, true)
  })
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); hide() } }} onresize={position} />
<button bind:this={button} type="button" class="help-title" class:icon-only={iconOnly} aria-label={iconOnly ? title : undefined} aria-describedby={open ? id : undefined}
  onpointerenter={(e) => { if (e.pointerType === 'mouse') show() }} onpointerleave={(e) => { if (e.pointerType === 'mouse') hide() }}
  onfocus={() => { if (button.matches(':focus-visible')) show() }} onblur={hide} onclick={show}>
  {#if !iconOnly}{title}{/if}<CircleHelp size={iconOnly ? 17 : 13} aria-hidden="true" />
</button>
<div bind:this={tip} {id} role="tooltip" popover="manual" class="help-popover bu-popover-anchor" style:left="{left}px" style:top="{top}px"><PopoverArrow /><div class="help-tip bu-popover-surface bu-tooltip">{text}</div></div>

<style>
  .help-title { display:inline-flex; align-items:center; gap:5px; align-self:flex-start; border:0; padding:3px 0; background:none; color:var(--text-2); font:inherit; font-size:var(--fs-sm); font-weight:600; cursor:help; }
  .help-title :global(svg) { color:var(--text-3); }
  .help-title.icon-only { flex:none; align-self:center; justify-content:center; width:var(--ctl-h); height:var(--ctl-h); padding:0; }
  .help-popover:popover-open:not([data-positioned]) { visibility:hidden; }
  .help-tip { width:min(280px, calc(100vw - 16px)); padding:10px 12px; font-size:var(--fs-sm); line-height:1.5; pointer-events:none; }
  @media (pointer:coarse) { .help-title { min-height:32px; } }
</style>
