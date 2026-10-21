<script lang="ts">
  import Icon from './Icon.svelte'
  import Sheet from './Sheet.svelte'
  import { gk } from '../state.svelte'
  let { onclose }: { onclose: () => void } = $props()
  let remember = $state(false)
</script>

<Sheet title="Connect PixelLab" {onclose}>
  <div class="form">
    <div class="connect-hero"><span class="key-badge"><Icon name="key-round" size={22} /></span>
      <p>Your PixelLab key lets PixelDoll draw for you. Generations come from your PixelLab account.</p></div>
    <label class="field">
      <span class="label">PixelLab API key</span>
      <input class="input mono {gk('glass-input')}" type="password" placeholder="Paste your key" autocomplete="off" spellcheck="false" />
    </label>
    <label class="toggle-row">
      <span><b>Remember on this device</b><span class="muted small">Off: the key is forgotten when you close this tab.</span></span>
      <input type="checkbox" class="switch" bind:checked={remember} role="switch" />
    </label>
    <ul class="facts">
      <li><Icon name="lock" size={14} />Sent only to api.pixellab.ai.</li>
      <li><Icon name="coins" size={14} />This character costs about 12 gens.</li>
    </ul>
    <a class="link-out" href="https://pixellab.ai" target="_blank" rel="noreferrer">Get a key at pixellab.ai <Icon name="external-link" size={13} /></a>
  </div>
  {#snippet footer()}
    <p class="foot-note">Nothing you entered is lost.</p>
    <button class="btn primary lg {gk('glass-btn glass-btn--primary glass-btn--auto')}" disabled><span>Connect and generate</span></button>
  {/snippet}
</Sheet>
