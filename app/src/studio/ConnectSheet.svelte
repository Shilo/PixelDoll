<script lang="ts">
  import { app, setKey, forgetKey, refreshBalance } from '../lib/app.svelte.ts'
  import Sheet from './Sheet.svelte'
  import { ui, connected } from './state.svelte.ts'
  import { ExternalLink, KeyRound, Check } from './icons.ts'
  import { fmtNum } from './model.ts'

  let key = $state('')
  let remember = $state(false)
  let msg = $state('')
  let checking = $state(false)
  async function use(k: string, rem: boolean) {
    checking = true
    msg = ''
    setKey(k, rem)
    key = ''
    await refreshBalance()
    checking = false
    if (app.keyRejected) msg = "PixelLab didn't accept this key."
    else if (app.balanceError) msg = `Couldn't reach PixelLab: ${app.balanceError}`
    else connected()
  }
  async function devKey() {
    if (!import.meta.env.DEV) return
    const r = await fetch('/__dev/pixellab-key', { cache: 'no-store' })
    if (!r.ok) return void (msg = `No dev key (${r.status}).`)
    await use(await r.text(), false)
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
        <li><Check size={14} />Kept in memory (shared with your other open PixelDoll tabs), unless you choose Remember.</li>
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
    {#if msg}<p class="notice bad small">{msg}</p>{/if}
    <div class="field-row">
      <a class="small" href="https://pixellab.ai/account" target="_blank" rel="noreferrer">Get a key <ExternalLink size={12} style="display:inline" /></a>
      <span class="actions">
        {#if import.meta.env.DEV}<button type="button" class="btn" onclick={devKey} data-testid="dev-key">Use dev key</button>{/if}
        <button class="btn primary" type="submit" disabled={!key.trim() || checking}>{checking ? 'Checking…' : 'Connect'}</button>
      </span>
    </div>
  </form>
</Sheet>
