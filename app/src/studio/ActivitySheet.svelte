<script lang="ts">
  import Sheet from './Sheet.svelte'
  import { queue, type JobRec } from '../lib/pixellab/queue.ts'
  import { app, refreshBalance } from '../lib/app.svelte.ts'
  import { fmtNum } from './model.ts'
  import { ui, store, cleanUp, toast, equipment, refreshFits, openFit } from './state.svelte.ts'
  async function clear() {
    const n = await cleanUp()
    toast(`Cleared ${n.jobs} finished job${n.jobs === 1 ? '' : 's'}${n.blobs ? ` and ${n.blobs} unused images` : ''}. Jobs your drafts or a running create or move still use are kept.`)
  }
  import { ChevronRight, CircleAlert, CircleCheck, Coins, RefreshCw } from './icons.ts'

  let now = $state(Date.now())
  $effect(() => { const t = setInterval(() => (now = Date.now()), 1000); return () => clearInterval(t) })
  const refreshEquipment = () => { void refreshFits().catch(() => toast('Could not load saved equipment fits.')) }
  $effect(() => { refreshEquipment() })
  const fits = $derived(equipment.fits.filter((f) => f.stage !== 'accepted' && f.stage !== 'discarded'))
  const fitLabel = (stage: string) => ({ ready: 'Ready to preview', 'rest-running': 'Fitting at rest', 'rest-review': 'Review rest fit', 'pose-running': 'Animating fit', 'fit-review': 'Review fitted copy', 'needs-attention': 'Needs attention' })[stage] ?? stage
  const jobs = $derived([...$queue.jobs].reverse())
  const running = $derived(jobs.filter((r) => r.state === 'running' || r.state === 'submitting'))
  const queued = $derived(jobs.filter((r) => r.state === 'queued'))
  $effect(() => {
    if (!equipment.running.length && !fits.some((f) => f.stage.endsWith('running')) && !running.length && !queued.length) return
    const t = setInterval(refreshEquipment, 2000)
    return () => clearInterval(t)
  })
  const done = $derived(jobs.filter((r) => !['running', 'submitting', 'queued'].includes(r.state)).slice(0, 12))
  const nice = (r: JobRec) => r.label.replace(/^M3 /, '').replace(/^skeleton sha256:.{8}.*/, 'Finding joints')
  const pct = (r: JobRec) => { const ps = r.jobs.map((s) => (s.done ? 1 : Math.min(1, s.progress ?? 0))); return ps.length ? Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 100) : 0 }
  const mins = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
  const cost = (r: JobRec) => [r.gens ? `${+r.gens.toFixed(2)} gens` : '', r.usd ? `$${r.usd.toFixed(3)}` : ''].filter(Boolean).join(' + ')
</script>

<Sheet title="Activity" cancel="Done" onclose={() => (ui.sheet = null)}>
  <div class="act-list">
    <div class="field-row">
      <span class="balance" style="display:flex;gap:6px;align-items:center"><Coins size={16} />
        {#if app.balance}<b class="num">{fmtNum(app.balance.subscription.generations)}</b> of {fmtNum(app.balance.subscription.total)} gens left{app.balance.credits.usd ? ` · $${app.balance.credits.usd.toFixed(2)}` : ''}
        {:else if app.key}Balance unavailable{:else}Not connected{/if}</span>
      {#if app.key}<button class="btn icon plain" aria-label="Refresh balance" onclick={refreshBalance}><RefreshCw size={14} /></button>{:else}<button class="btn sm" onclick={() => (ui.sheet = 'connect')}>Connect</button>{/if}
    </div>
    {#if $queue.role === 'follower'}
      <p class="notice small"><CircleAlert size={14} />Running in another tab. PixelDoll is open twice: the other tab sends and checks the jobs (also the ones you start here). Keep it open, or close it to run them here.</p>
    {/if}
    {#if $queue.paused}
      <p class="notice warn small"><CircleAlert size={14} />{$queue.paused === 'auth' ? "PixelLab didn't accept the key. Jobs wait until you connect again." : $queue.paused === 'offline' ? "You're offline. Jobs wait and continue by themselves when the connection is back." : 'Out of generations. Jobs wait until you top up.'}
        {#if $queue.paused !== 'offline'}<button class="btn sm" onclick={() => ($queue.paused === 'auth' ? (ui.sheet = 'connect') : queue.resume())}>{$queue.paused === 'auth' ? 'Connect' : 'Resume'}</button>{/if}</p>
    {/if}
    {#if fits.length}
      <section class="act-group"><span class="sec-title">Equipment fits</span><ul>{#each fits as fit (fit.id)}
        <li><CircleAlert size={16} /><span class="act-main"><b>{fit.name}</b><span class="muted small">{store.projects.find((p) => p.id === fit.targetId)?.name ?? 'Character'} · {fitLabel(fit.stage)} · {+fit.spentGens.toFixed(2)} gens{fit.spentUsd && fit.spentUsd > 0 ? ` + $${fit.spentUsd.toFixed(3)}` : ''} spent</span></span><button class="btn sm" onclick={() => openFit(fit.id)}>{fit.stage.endsWith('running') ? 'View' : 'Continue'}</button></li>
      {/each}</ul></section>
    {/if}
    {#if !running.length && !queued.length}<p class="muted">Nothing generating.</p>{/if}
    {#if running.length}
      <section class="act-group"><span class="sec-title">Generating</span>
        <ul>{#each running as r (r.id)}
          <li><span class="ring" style:--p={pct(r)}></span><span class="act-main"><b>{nice(r)}</b><span class="muted small">{pct(r)}%{r.jobs[0]?.queuePosition ? ` · #${r.jobs[0].queuePosition} in line` : ''}</span></span>
            <span class="act-meta num">{r.submittedAt ? mins(now - r.submittedAt) : ''}<br /><button class="btn link small" onclick={() => queue.cancel(r.id)}>Stop</button></span></li>
        {/each}</ul>
      </section>
    {/if}
    {#if queued.length}
      <section class="act-group"><span class="sec-title">Waiting</span>
        <ul>{#each queued as r (r.id)}
          <li><span class="ring"></span><span class="act-main"><b>{nice(r)}</b><span class="muted small">{r.nextAt > now ? `retry in ${Math.ceil((r.nextAt - now) / 1000)} s` : !app.key ? 'needs your key' : 'queued'}</span></span>
            <span class="act-meta"><button class="btn link small" onclick={() => queue.cancel(r.id)}>Cancel</button></span></li>
        {/each}</ul>
      </section>
    {/if}
    {#if done.length}
      <section class="act-group"><span class="sec-title">Recent</span>
        <ul>{#each done as r (r.id)}
          <li>{#if r.state === 'done'}<CircleCheck size={16} style="color:var(--ok)" />{:else}<CircleAlert size={16} style="color:var(--bad)" />{/if}
            <span class="act-main"><b>{nice(r)}</b><span class="muted small">{r.state === 'done' ? (r.finishedAt && r.submittedAt ? mins(r.finishedAt - r.submittedAt) : 'done') : r.state === 'lost' ? 'unknown: may have run, check pixellab.ai' : r.state}</span></span>
            <span class="act-meta num muted">{cost(r)}</span></li>
        {/each}</ul>
      </section>
    {/if}
    <p class="faint small">This session: {+$queue.sessionGens.toFixed(2)} gens{$queue.sessionUsd ? ` + $${$queue.sessionUsd.toFixed(3)}` : ''}. Some moves are billed in dollars instead of gens; your balance above is the real total.</p>
    <details class="disclosure">
      <summary><ChevronRight size={14} />Details</summary>
      <div>
        <div class="field-row small">
          <label class="check">Parallel calls <input class="input" style="width:64px" type="number" min="1" max="8" value={$queue.concurrency} onchange={(e) => queue.setConcurrency(+e.currentTarget.value)} /></label>
          <button class="btn sm" onclick={clear} disabled={$queue.role === 'follower'} title={$queue.role === 'follower' ? 'Clear it in the PixelDoll tab that runs the jobs' : undefined}>Clear finished</button>
        </div>
        <div style="overflow:auto;max-height:240px">
          <table class="ledger">
            <thead><tr><th>Job</th><th>Endpoint</th><th>State</th><th>Cost</th></tr></thead>
            <tbody>{#each jobs.slice(0, 50) as r (r.id)}<tr><td>{r.label}</td><td class="mono">{r.endpoint}</td><td>{r.state}{r.attempts > 1 ? ` (try ${r.attempts})` : ''}{r.error ? ` · ${r.error.slice(0, 80)}` : ''}</td><td class="num">{cost(r)}</td></tr>{/each}</tbody>
          </table>
        </div>
      </div>
    </details>
  </div>
</Sheet>
