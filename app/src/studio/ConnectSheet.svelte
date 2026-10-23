<script lang="ts">
  import { onDestroy } from 'svelte'
  import { app, setKey, forgetKey, refreshBalance } from '../lib/app.svelte.ts'
  import Sheet from './Sheet.svelte'
  import { default as ApiPeek } from './ApiPeek.svelte'
  import { balancePlan } from './apiPlans.ts'
  import { ui, connected, clearPendingConnection } from './state.svelte.ts'
  import { ExternalLink, KeyRound, Check } from './icons.ts'
  import { fmtNum } from './model.ts'

  let key = $state('')
  let remember = $state(false)
  let msg = $state('')
  let checking = $state(false)
  let closed = false
  const activityScope = crypto.randomUUID()
  onDestroy(() => { closed = true; clearPendingConnection() })
  // R6 P1-4: a *.github.io project path (user.github.io/PixelDoll/) shares its origin, and so localStorage, with every other Pages project of that account
  const sharedOrigin = location.hostname.endsWith('.github.io') && location.pathname.split('/').filter(Boolean).length > 0
  async function use(k: string, rem: boolean) {
    checking = true
    msg = ''
    setKey(k, rem, { activityScope, label: 'Connect PixelLab', background: false })
    key = ''
    await refreshBalance({ activityScope, label: 'Connect PixelLab', background: false })
    if (closed) return
    checking = false
    if (app.keyRejected) msg = "PixelLab didn't accept this key."
    else if (app.balanceError) msg = `Couldn't reach PixelLab: ${app.balanceError}`
    else connected()
  }
</script>

<Sheet title="Connect PixelLab" onclose={() => (ui.sheet = null)}>
  <div class="connect-hero">
    <span class="key-badge" aria-hidden="true"><KeyRound size={22} /></span>
    <div class="field">
      <p style="font-weight:600">Your PixelLab key lets PixelDoll draw for you.</p>
      <ul class="facts small">
        <li><Check size={14} />Generations come from your PixelLab account.</li>
        <li><Check size={14} />Sent only to api.pixellab.ai.</li>
        <li><Check size={14} />Kept in memory for this tab (passed to the PixelDoll tab that runs your jobs when you connect here), unless you choose Remember.</li>
      </ul>
    </div>
  </div>
  {#if app.key && !app.keyRejected}
    <p class="notice ok small"><Check size={14} />Connected{app.remembered ? ' and remembered on this device' : ' for this tab'}{app.balance ? ` · ${fmtNum(app.balance.subscription.generations)} of ${fmtNum(app.balance.subscription.total)} gens left` : ''}.
      <button class="btn sm" onclick={forgetKey}>Forget key</button></p>
  {/if}
  <form class="form" onsubmit={(e) => { e.preventDefault(); if (key.trim()) void use(key, remember) }}>
    <label class="field">
      <span class="label">API key</span>
      <input class="input" type="password" bind:value={key} autocomplete="off" spellcheck="false" placeholder="Paste your key" />
    </label>
    <label class="toggle-row"><span>Remember on this device</span><input class="switch" type="checkbox" bind:checked={remember} /></label>
    {#if remember && sharedOrigin}<p class="notice warn small">This copy of PixelDoll runs in a folder of {location.host}, a site other GitHub Pages projects share. Any of their pages could read a remembered key. Leave Remember off here, or use PixelDoll from its own address.</p>{/if}
    {#if msg}<p class="notice bad small">{msg}</p>{/if}
    <div class="field-row">
      <a class="small" href="https://pixellab.ai/account" target="_blank" rel="noreferrer">Get a key <ExternalLink size={12} style="display:inline" /></a>
      <span class="actions">
        <span class="api-action"><ApiPeek scope="account-connect" label="Connect PixelLab" plan={balancePlan()} {activityScope} /><button class="btn primary" type="submit" disabled={!key.trim() || checking}>{checking ? 'Checking…' : 'Connect'}</button></span>
      </span>
    </div>
  </form>
</Sheet>
