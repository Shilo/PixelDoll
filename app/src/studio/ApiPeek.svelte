<script lang="ts">
  import { tick } from 'svelte'
  import { apiActivity, activityRetention, activityTotals, exportActivityJson, sanitizeActivityValue, type ApiCall } from '../lib/pixellab/activity.ts'
  import type { PeekCall } from './apiPlans.ts'
  import RequestFields from './RequestFields.svelte'
  import { queue } from '../lib/pixellab/queue.ts'
  import { CodeXml, Copy, Check, ListPlus, ListMinus, X, ChevronRight } from './icons.ts'

  let { scope, plan = [], label = '', queueIds = [], activityScope, all = false, menu = false }: {
    scope: string; plan?: PeekCall[]; label?: string; queueIds?: string[];
    activityScope?: string; all?: boolean; menu?: boolean // menu: a labeled row inside an options menu
  } = $props()
  const id = $props.id()
  let panel: HTMLDivElement
  let opener: HTMLButtonElement
  let open = $state(false)
  let backgrounds = $state(false)
  let copied = $state('')
  let inspectionError = $state(false)
  let left = $state(8), top = $state(8), height = $state(600)
  const actual = $derived($apiActivity.filter((c) => all || (activityScope && (c.activityScope === activityScope || c.relatedScopes?.includes(activityScope))) || (c.queueId && queueIds.includes(c.queueId)) || c.relatedQueueIds?.some((id) => queueIds.includes(id))))
  const recorded = $derived(actual.length > 0 || all)
  const calls = $derived(recorded ? actual : plan)
  const visible = $derived(calls.filter((c) => backgrounds || !c.background))
  const hidden = $derived(calls.length - calls.filter((c) => !c.background).length)
  const totals = $derived(activityTotals(actual))
  const unknownFinished = $derived(actual.filter((c) => c.costSource === 'unknown' && !c.usagePending).length)
  const knownEstimate = $derived(plan.reduce((sum, c) => sum + (c.generations ?? 0), 0))
  const unknownEstimate = $derived(plan.filter((c) => c.method === 'POST' && c.generations === undefined).length)
  const format = (n: number) => +n.toFixed(3)
  function price(c: ApiCall | PeekCall): string {
    if ('cost' in c) {
      if (c.costSource === 'free') return 'Free'
      const bits = [c.cost.generations !== null ? `${format(c.cost.generations)} gens` : '', c.cost.usd !== null ? `$${c.cost.usd.toFixed(3)}` : ''].filter(Boolean)
      return (bits.join(' + ') || (c.usagePending ? 'Pending' : 'Unknown')) + (c.costPartial ? ' + ?' : '')
    }
    return c.generations !== undefined ? `~${format(c.generations)} gens` : c.method === 'POST' ? 'Estimate varies' : 'Free'
  }
  function position() {
    if (!open) return
    const r = opener.getBoundingClientRect(), mobile = matchMedia('(max-width:599px), (max-height:499px)').matches
    height = Math.max(140, window.innerHeight - 24)
    const w = Math.min(440, window.innerWidth - 16)
    left = mobile ? 8 : Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))
    top = mobile ? Math.max(8, window.innerHeight - Math.min(panel?.offsetHeight || 500, height) - 8) : Math.max(8, Math.min(window.innerHeight - (panel?.offsetHeight || 400) - 8, r.top - (panel?.offsetHeight || 400) - 8))
    // A low action gets an attached peek above it; high toolbar actions open below.
    if (!mobile && r.top < 100) top = Math.min(r.bottom + 8, window.innerHeight - 140)
    if (!mobile) height = Math.max(140, window.innerHeight - top - 8)
  }
  async function toggled(e: ToggleEvent) {
    open = e.newState === 'open'
    if (open) { copied = ''; inspectionError = false; await tick(); position(); panel.querySelector<HTMLButtonElement>('[aria-label="Close API calls"]')?.focus() }
    else opener?.focus()
  }
  $effect(() => {
    if (!open || all) return
    void $queue.jobs
    void queue.inspectActivity(queueIds, activityScope).catch(() => { inspectionError = true })
  })
  $effect(() => {
    if (!open) return
    const observer = new ResizeObserver(position)
    observer.observe(panel)
    window.addEventListener('resize', position)
    return () => { observer.disconnect(); window.removeEventListener('resize', position) }
  })
  function close() { panel.hidePopover() }
  function keydown(e: KeyboardEvent) {
    // Keep Studio playback, direction and undo shortcuts outside this inspector.
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return }
    if (e.key !== 'Tab') return
    const controls = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), summary, [tabindex="0"]')].filter((x) => x.getClientRects().length)
    const first = controls[0], last = controls.at(-1)
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
  }
  async function copy() {
    const text = recorded ? exportActivityJson(actual) : JSON.stringify({ format: 'pixeldoll-calls/1', scope, costBasis: 'estimated', total: { generations: knownEstimate, unknown: unknownEstimate }, calls: sanitizeActivityValue(plan) }, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      copied = `Copied ${calls.length} call${calls.length === 1 ? '' : 's'}`
    } catch {
      // Still usable when clipboard permissions are unavailable (including some mobile browsers).
      const blob = new Blob([text], { type: 'application/json' }), url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'pixeldoll-calls.json'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      copied = 'Saved calls as JSON'
    }
  }
</script>

<button bind:this={opener} type="button" class={menu ? 'row bu-action api-peek-trigger' : 'bu-action btn icon plain api-peek-trigger'} data-variant="quiet" aria-label={all ? 'Inspect all API calls' : 'Inspect API calls'} title="PixelLab API calls" aria-expanded={open} aria-controls={id} popovertarget={id}><CodeXml size={menu ? 18 : 17} />{#if menu}<span class="row-name">API calls</span>{/if}</button>
<div bind:this={panel} {id} popover="auto" class="api-peek" role="dialog" aria-label="API calls" tabindex="-1" ontoggle={toggled} onkeydown={keydown} style:left="{left}px" style:top="{top}px" style:max-height="{height}px">
  {#if open}
  <header class="peek-head">
    <div class="peek-heading"><strong>API calls</strong><span class="peek-sub" role="status">{copied || (inspectionError ? 'Saved requests unavailable' : '') || label || (all ? 'Recent API calls' : 'This action')}</span></div>
    <button type="button" class="bu-action btn icon plain" data-variant="quiet" aria-label="Copy all calls" title="Copy all calls as JSON, including background calls" disabled={!calls.length} onclick={copy}>{#if copied}<Check size={16} />{:else}<Copy size={16} />{/if}</button>
    <button type="button" class="bu-action btn icon plain" data-variant="quiet" aria-label={backgrounds ? 'Hide background calls' : 'Show background calls'} title={backgrounds ? 'Hide background calls' : `Show background calls${hidden ? ` (${hidden})` : ''}`} aria-pressed={backgrounds} onclick={() => backgrounds = !backgrounds}>{#if backgrounds}<ListMinus size={17} />{:else}<ListPlus size={17} />{/if}</button>
    <button type="button" class="bu-action btn icon plain" data-variant="quiet" aria-label="Close API calls" title="Close" onclick={close}><X size={17} /></button>
  </header>
  <div class="peek-list">
    {#each visible as c, i ('id' in c ? c.id : `${scope}:${i}:${c.path}`)}
      <details class="peek-call">
        <summary><ChevronRight size={13} /><span class="call-name"><span class="call-route"><span class="call-method">{c.method}</span><span>{'endpoint' in c ? c.endpoint : c.path}</span></span>{#if c.label}<span class="call-context">{c.label}</span>{/if}</span><span class="call-price">{price(c)}</span></summary>
        <div class="peek-request">
          {#if 'state' in c}<p class="request-status">{c.restored ? 'Saved request' : c.state === 'pending' ? 'Sending' : c.state === 'failed' ? 'Failed' : 'Sent'}{c.status ? ` · HTTP ${c.status}` : ''}{c.background ? ' · Background' : ''}{c.costSource === 'unknown' && !c.usagePending ? ' · Cost not reported' : ''}</p>{:else}<p class="request-status">Planned · Estimate{c.background ? ' · Background' : ''}</p>{/if}
          {#if 'bodyUnavailable' in c && c.bodyUnavailable}<p class="request-status">Some saved image inputs are no longer available. Copy includes stored references.</p>{/if}
          {#if c.body !== undefined && c.body !== null}<RequestFields value={'cost' in c ? c.body : sanitizeActivityValue(c.body)} />{:else}<p class="request-status">{c.method === 'POST' ? 'Request fields available when prepared.' : 'No request body.'}</p>{/if}
          {#if 'note' in c && c.note}<p class="request-status">{c.note}</p>{/if}
        </div>
      </details>
    {/each}
    {#if !visible.length}<p class="peek-empty">{hidden ? 'No foreground calls. Show background calls to see checks and downloads.' : all ? 'No calls recorded yet. Automatic calls appear here too.' : 'No API calls for this action yet.'}</p>{/if}
  </div>
  {#if recorded && ($activityRetention.droppedBackground || $activityRetention.droppedForeground)}<p class="peek-retention">Recent history · Older calls omitted{all && $activityRetention.droppedForeground ? '; total covers this list' : ''}. Copy includes this list.</p>{/if}
  <footer class="peek-total"><span>{recorded ? 'Total' : 'Estimated total'}<span class="total-caption">{calls.length} call{calls.length === 1 ? '' : 's'}{!backgrounds && hidden ? ` · ${hidden} background hidden` : ''}</span></span><strong>{#if recorded}{#if totals.generations || totals.usd || !totals.unknown}{format(totals.generations)} gens{totals.usd ? ` + $${totals.usd.toFixed(3)}` : ''}{:else}{totals.pending ? 'Pending' : 'Unknown'}{/if}{#if totals.unknown || totals.pending}<span class="total-caption">{unknownFinished > 0 ? `${unknownFinished} unknown` : ''}{unknownFinished > 0 && totals.pending ? ' · ' : ''}{totals.pending ? `${totals.pending} pending` : ''}</span>{/if}{:else}~{format(knownEstimate)} gens{#if unknownEstimate}<span class="total-caption">+ variable costs</span>{/if}{/if}</strong></footer>
  {/if}
</div>

<style>
  .api-peek-trigger { vertical-align:middle; flex:none; }
  .api-peek { position:fixed; inset:auto; margin:0; width:min(440px, calc(100vw - 16px)); padding:0; border:1px solid var(--line-strong); border-radius:12px; background:var(--bg-raised, #2c2c2e); color:var(--text, #f5f5f7); box-shadow:var(--shadow-pop); font:400 12px/1.45 var(--font-ui, system-ui); overflow:hidden; box-sizing:border-box; }
  .api-peek:popover-open { display:flex; flex-direction:column; }
  .api-peek::backdrop { background:transparent; }
  .peek-head { display:flex; align-items:center; gap:2px; padding:10px 10px 10px 14px; border-bottom:1px solid var(--line); flex:none; }
  .peek-heading { flex:1; min-width:0; display:grid; gap:2px; }
  .peek-heading strong { font-size:13px; font-weight:600; }
  .peek-sub { font-size:11px; color:var(--text-3); white-space:nowrap; text-overflow:ellipsis; overflow:hidden; }
  .peek-list { overflow:auto; overscroll-behavior:contain; min-height:0; max-height:410px; flex:1; }
  .peek-call { border-bottom:1px solid var(--line); }
  .peek-call:last-child { border-bottom:0; }
  .peek-call > summary { display:flex; align-items:center; gap:7px; padding:11px 12px; cursor:pointer; list-style:none; }
  .peek-call > summary::-webkit-details-marker { display:none; }
  .peek-call > summary:hover { background:var(--bg-hover); }
  .peek-call > summary > :global(svg) { flex:none; color:var(--text-3); }
  .peek-call[open] > summary > :global(svg) { transform:rotate(90deg); }
  .call-name { flex:1; min-width:0; display:grid; gap:3px; }
  .call-route { display:flex; gap:6px; align-items:baseline; overflow-wrap:anywhere; min-width:0; }
  .call-method { color:var(--accent-text); font-size:9px; font-weight:650; flex:none; }
  .call-route > span:last-child { min-width:0; }
  .call-context { color:var(--text-3); font-size:11px; overflow-wrap:anywhere; }
  .call-price { color:var(--text-2); font-size:11px; font-variant-numeric:tabular-nums; flex:none; max-width:95px; text-align:right; }
  .peek-request { padding:0 14px 12px 32px; font-size:11.5px; }
  .request-status { color:var(--text-3); font-size:11px; margin:0 0 8px; overflow-wrap:anywhere; }
  .request-status:last-child { margin-bottom:0; }
  .peek-empty { padding:22px 16px; color:var(--text-3); margin:0; }
  .peek-retention { padding:6px 14px; color:var(--text-3); font-size:10px; margin:0; border-top:1px solid var(--line); flex:none; }
  .peek-total { padding:12px 14px; display:flex; justify-content:space-between; gap:10px; align-items:start; border-top:1px solid var(--line-strong); flex:none; }
  .peek-total strong { text-align:right; font-weight:600; font-variant-numeric:tabular-nums; }
  .total-caption { display:block; font-size:10px; color:var(--text-3); font-weight:400; margin-top:3px; }
  @media(max-width:599px), (max-height:499px) { .api-peek { border-radius:14px; } .peek-head .btn { min-height:44px; min-width:44px; } .peek-list { max-height:none; } .peek-call > summary { min-height:48px; } .peek-request { padding-left:22px; } }
</style>
