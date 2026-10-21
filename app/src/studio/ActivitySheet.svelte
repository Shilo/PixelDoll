<script lang="ts">
  import Sheet from './Sheet.svelte'
  import { queue, type JobRec } from '../lib/pixellab/queue.ts'
  import { app, refreshBalance } from '../lib/app.svelte.ts'
  import { fmtNum } from './model.ts'
  import { ui } from './state.svelte.ts'
  import { ChevronRight, CircleAlert, CircleCheck, Coins, RefreshCw } from './icons.ts'

  let now = $state(Date.now())
  $effect(() => { const t = setInterval(() => (now = Date.now()), 1000); return () => clearInterval(t) })
  const jobs = $derived([...$queue.jobs].reverse())
  const running = $derived(jobs.filter((r) => r.state === 'running' || r.state === 'submitting'))
  const queued = $derived(jobs.filter((r) => r.state === 'queued'))
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
      <p class="notice warn small"><CircleAlert size={14} />{$queue.paused === 'auth' ? "PixelLab didn't accept the key. Jobs wait until you connect again." : 'Out of generations. Jobs wait until you top up.'}
        <button class="btn sm" onclick={() => ($queue.paused === 'auth' ? (ui.sheet = 'connect') : queue.resume())}>{$queue.paused === 'auth' ? 'Connect' : 'Resume'}</button></p>
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
            <span class="act-main"><b>{nice(r)}</b><span class="muted small">{r.state === 'done' ? (r.finishedAt && r.submittedAt ? mins(r.finishedAt - r.submittedAt) : 'done') : r.state}</span></span>
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
          <button class="btn sm" onclick={() => queue.clearFinished()}>Clear finished</button>
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
