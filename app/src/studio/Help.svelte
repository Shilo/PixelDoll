<script lang="ts">
  import { tick } from 'svelte'
  import CircleHelp from '@lucide/svelte/icons/circle-help'
  let { title, text, iconOnly = false, tooltipId }: { title: string; text: string; iconOnly?: boolean; tooltipId?: string } = $props()
  const generatedId = $props.id()
  const id = $derived(tooltipId ?? generatedId)
  let button: HTMLButtonElement
  let tip: HTMLDivElement
  let open = $state(false), left = $state(8), top = $state(8)
  export async function show() {
    open = true
    await tick()
    if (!open) return
    position()
  }
  function position() {
    const r = button.getBoundingClientRect()
    left = Math.max(8, Math.min(r.left, window.innerWidth - Math.min(280, window.innerWidth - 16) - 8))
    const height = tip.offsetHeight
    top = Math.max(8, r.bottom + height + 14 <= window.innerHeight ? r.bottom + 6 : r.top - height - 6)
  }
  export function hide() { open = false }
  $effect(() => {
    if (!open) return
    window.addEventListener('scroll', position, true)
    return () => window.removeEventListener('scroll', position, true)
  })
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); hide() } }} onresize={hide} />
<button bind:this={button} type="button" class="help-title" class:icon-only={iconOnly} aria-label={iconOnly ? title : undefined} aria-describedby={open ? id : undefined}
  onpointerenter={(e) => { if (e.pointerType === 'mouse') show() }} onpointerleave={(e) => { if (e.pointerType === 'mouse') hide() }}
  onfocus={() => { if (button.matches(':focus-visible')) show() }} onblur={hide} onclick={show}>
  {#if !iconOnly}{title}{/if}<CircleHelp size={iconOnly ? 17 : 13} aria-hidden="true" />
</button>
<div bind:this={tip} {id} role="tooltip" class="help-tip" class:visible={open} style:left="{left}px" style:top="{top}px">{text}</div>

<style>
  .help-title { display:inline-flex; align-items:center; gap:5px; align-self:flex-start; border:0; padding:3px 0; background:none; color:var(--text-2); font:inherit; font-size:var(--fs-sm); font-weight:600; cursor:help; }
  .help-title :global(svg) { color:var(--text-3); }
  .help-title.icon-only { flex:none; align-self:center; justify-content:center; width:var(--ctl-h); height:var(--ctl-h); padding:0; }
  .help-tip { display:none; position:fixed; z-index:200; width:min(280px, calc(100vw - 16px)); padding:10px 12px; border:1px solid var(--line-strong); border-radius:var(--r-ctl); background:var(--bg-raised); color:var(--text-2); box-shadow:0 8px 30px #0005; font-size:var(--fs-sm); line-height:1.5; pointer-events:none; }
  .help-tip.visible { display:block; }
  @media (pointer:coarse) { .help-title { min-height:32px; } }
</style>
