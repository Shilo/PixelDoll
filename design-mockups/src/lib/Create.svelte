<script lang="ts">
  // Create character: full-page flow, 3 steps (Describe → Moves → Generate/Review). D1 §6.3.
  import Icon from './Icon.svelte'
  import Sprite from './Sprite.svelte'
  import Connect from './Connect.svelte'
  import { DIRS, MOVES } from '../data'
  import { ui, view, gk, glass } from '../state.svelte'
  const step = $derived(ui.screen === 'create' ? 1 : 3)
  const phone = $derived(view.size === 'compact' || view.size === 'landscape')
  const none = new Set<string>()
  let desc = $state('a sturdy adventurer with tan skin and a friendly face')
  let build = $state('average')
  let skin = $state(2)
  const skins = ['#f6d6bd', '#e8b796', '#c98e6b', '#9c6449', '#6b4130', '#4a2c20']
  const labels = ['Describe', 'Moves', 'Generate']
  let connect = $state(true)
</script>

<div class="flow">
  <header class="flow-head">
    <button class="btn icon plain {gk('glass-pill')}" aria-label="Close"><Icon name="x" size={18} /></button>
    <h1 class="flow-title">New character</h1>
    {#if glass()}
      <ol class="glass-steps" aria-label="Steps">
        {#each labels as l, i}
          {#if i}<li class="glass-steps__line" aria-hidden="true"></li>{/if}
          <li class="glass-steps__item {i + 1 < step ? 'glass-steps__item--done' : ''} {i + 1 === step ? 'glass-steps__item--current' : ''}" aria-current={i + 1 === step ? 'step' : undefined}>
            <span class="glass-steps__num">{#if i + 1 < step}<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10" /></svg>{:else}{i + 1}{/if}</span><span class="glass-steps__label">{l}</span>
          </li>
        {/each}
      </ol>
    {:else}
      <ol class="steps" aria-label="Steps">
        {#each labels as l, i}
          {#if i}<li class="step-line" aria-hidden="true"></li>{/if}
          <li class="step" class:done={i + 1 < step} class:current={i + 1 === step} aria-current={i + 1 === step ? 'step' : undefined}>
            <span class="step-num">{#if i + 1 < step}<Icon name="check" size={12} />{:else}{i + 1}{/if}</span><span class="step-label">{l}</span>
          </li>
        {/each}
      </ol>
    {/if}
  </header>

  {#if step === 1}
    <div class="flow-body describe">
      <div class="flow-form">
        <h2 class="flow-h">Describe the body</h2>
        <p class="muted">Clothes and hair come later, as items you can swap.</p>
        <label class="field"><span class="sr">Description</span><textarea class="input big {gk('glass-textarea')}" rows="3" bind:value={desc}></textarea></label>
        <div class="field">
          <span class="label">Skin</span>
          <div class="dots" role="radiogroup" aria-label="Skin">
            {#each skins as c, i}<button class="dot-swatch" role="radio" aria-checked={skin === i} aria-label="Skin tone {i + 1}" style:background={c} onclick={() => (skin = i)}></button>{/each}
          </div>
        </div>
        <div class="field">
          <span class="label">Build</span>
          <div class="seg {gk('glass-segmented')}" role="group" aria-label="Build">
            {#each ['slim', 'average', 'stocky'] as b}<button class={gk('glass-segmented__item')} aria-pressed={build === b} onclick={() => (build = b)}>{b[0].toUpperCase() + b.slice(1)}</button>{/each}
          </div>
        </div>
        <details class="disclosure">
          <summary><Icon name="chevron-right" size={14} />Details <span class="muted">· view, size 48 px, seed</span></summary>
          <dl class="kv"><dt>View</dt><dd>Low top-down</dd><dt>Size</dt><dd>48 px body in a 64 px frame</dd><dt>Seed</dt><dd>Random</dd></dl>
        </details>
      </div>
      <figure class="flow-preview">
        <div class="preview-box"><Sprite wearing={none} zoom={phone ? 3 : 5} checker={true} label="Example base body, walking south" /></div>
        <figcaption class="muted small">Example body. Yours is drawn in this size and pose, in 4 directions.</figcaption>
      </figure>
    </div>
    <footer class="flow-foot">
      <span class="muted small">Next: pick moves (Idle and Walk are included)</span>
      <button class="btn primary lg {gk('glass-btn glass-btn--primary glass-btn--auto')}"><span>Next</span><Icon name="chevron-right" size={16} /></button>
    </footer>
  {:else}
    <div class="flow-body review">
      <div class="review-head">
        <h2 class="flow-h">{ui.screen === 'connect' ? 'Ready to draw your character' : 'Here’s your character'}</h2>
        <p class="muted review-sub">{ui.screen === 'connect' ? 'Idle and Walk in 4 directions. About 6 minutes, and you can keep working.' : 'Check every direction. You can still try again.'}</p>
        {#if ui.screen === 'review'}
        <div class="notice warn" role="status"><Icon name="triangle-alert" size={16} /><span>Little room above the head. Tall hats may be cut off.</span></div>
      {/if}
      </div>
      <div class="review-grid" aria-label="Walk in 4 directions">
        {#each DIRS as d}
          <figure class="rg-cell" class:ghost={ui.screen === 'connect'}>
            <Sprite wearing={none} dir={d} zoom={view.size === 'expanded' || view.size === 'medium' ? 3 : 2} checker={true} />
            <figcaption>{d[0].toUpperCase() + d.slice(1)}</figcaption>
          </figure>
        {/each}
      </div>

    </div>
    <footer class="flow-foot">
      {#if ui.screen === 'review'}
        <button class="btn {gk('glass-btn glass-btn--secondary glass-btn--auto')}"><Icon name="refresh-cw" size={14} /><span>Try another</span><span class="cost">2 gens</span></button>
        <button class="btn primary lg {gk('glass-btn glass-btn--primary glass-btn--auto')}"><Icon name="check" size={16} /><span>Looks good</span></button>
      {:else}
        <span class="muted small">Balance: not connected</span>
        <button class="btn primary lg {gk('glass-btn glass-btn--primary glass-btn--auto')}"><Icon name="sparkles" size={16} /><span>Generate</span><span class="cost">12 gens</span></button>
      {/if}
    </footer>
  {/if}
</div>

{#if ui.screen === 'connect' && connect}<Connect onclose={() => (connect = false)} />{/if}
