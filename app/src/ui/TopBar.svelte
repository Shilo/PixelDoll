<script lang="ts">
  import { app, refreshBalance } from '../lib/app.svelte.ts'
  import { queue } from '../lib/pixellab/queue.ts'
  import ApiPeek from '../studio/ApiPeek.svelte'

  // refresh balance whenever a job settles
  let settled = $derived($queue.counts.done + $queue.counts.failed)
  $effect(() => {
    void settled
    if (app.key) void refreshBalance()
  })
  const fmt = (n: number) => (Math.round(n * 100) / 100).toString()
</script>

<header>
  <a href="#/"><b>PixelDoll</b></a>
  <ApiPeek scope="all" all />
  <nav><a href="#/m1">M1</a> <a href="#/m2">M2</a> <a href="#/m3">M3</a> <a href="#/m4">M4</a> <a href="#/m5">M5</a> <a href="#/selftest">tests</a></nav>
  <span data-testid="key-status">
    key:
    {#if !app.key}<b class="bad">none</b>
    {:else if app.keyRejected}<b class="bad">rejected (401)</b>
    {:else}<b class="ok">set{app.remembered ? ' (remembered)' : ' (memory)'}</b>{/if}
  </span>
  <span data-testid="balance">
    {#if app.balance}
      {fmt(app.balance.subscription.generations)}/{app.balance.subscription.total} gens · ${fmt(app.balance.credits.usd)}
    {:else if app.balanceError}<span class="bad" title={app.balanceError}>balance error</span>
    {:else}balance —{/if}
    <button onclick={refreshBalance} disabled={!app.key}>↻</button>
  </span>
  <span data-testid="queue-status">
    queue: {$queue.counts.running} running · {$queue.counts.pending} pending · {$queue.counts.failed} failed · conc {$queue.current}/{$queue.concurrency}
    {#if $queue.paused}<b class="bad">paused ({$queue.paused})</b> <button onclick={() => queue.resume()}>resume</button>{/if}
    · session: {fmt($queue.sessionGens)} gens{$queue.sessionUsd ? ` + $${$queue.sessionUsd.toFixed(3)}` : ''}
  </span>
</header>

<style>
  header { display: flex; flex-wrap: wrap; gap: 0.4rem 1.2rem; align-items: center; padding: 0.4rem 0.8rem; border-bottom: 1px solid #8884; font-size: 0.85rem; }
  nav a { margin-right: 0.4rem; }
  .bad { color: #c33; }
  .ok { color: #2a2; }
  button { padding: 0 0.4rem; }
</style>
