<script lang="ts">
  import Icon from './Icon.svelte'
  import Sheet from './Sheet.svelte'
  import { GROUPS } from '../data'
  import { gk } from '../state.svelte'
  let { group = 'Head', onclose }: { group?: string; onclose: () => void } = $props()
  let where = $state('Head')
  $effect.pre(() => { where = group })
  let what = $state('an iron crown with three points and a red gem')
  const hints = ['#c43a3f', '#e0a83a', '#3b5dc9', '#38b764', '#566c86']
  let hint = $state(1)
</script>

<Sheet title="New item" {onclose}>
  <div class="form">
    <label class="field">
      <span class="label">Where does it go?</span>
      <span class="select-wrap boxed"><select class="select {gk('glass-select')}" bind:value={where}>{#each GROUPS as g}<option>{g.id}</option>{/each}</select><Icon name="chevron-down" size={12} /></span>
    </label>
    <label class="field">
      <span class="label">What is it?</span>
      <textarea class="input {gk('glass-textarea')}" rows="2" bind:value={what}></textarea>
    </label>
    <div class="chips" aria-label="Ideas">
      {#each ['Wizard hat', 'Hood', 'Bandana', 'Feathered cap'] as c}<button class="chip {gk('glass-badge glass-badge--interactive')}" onclick={() => (what = c.toLowerCase())}>{c}</button>{/each}
    </div>
    <div class="field">
      <span class="label">Main colour <span class="muted">(optional)</span></span>
      <div class="dots" role="radiogroup" aria-label="Main colour">
        {#each hints as c, i}<button class="dot-swatch" role="radio" aria-checked={hint === i} aria-label="Colour {c}" style:background={c} onclick={() => (hint = i)}></button>{/each}
        <button class="dot-swatch auto" role="radio" aria-checked={hint === -1} aria-label="Automatic" onclick={() => (hint = -1)}>Auto</button>
      </div>
    </div>
    <details class="disclosure">
      <summary><Icon name="chevron-right" size={14} />Details <span class="muted">· Walk and Punch · budget mode · key colour auto</span></summary>
      <dl class="kv"><dt>Moves</dt><dd>Walk, Punch (4 directions)</dd><dt>Budget mode</dt><dd>On for rigid items · 10 gens</dd><dt>Key colour</dt><dd>Auto (green)</dd><dt>Seed</dt><dd>Random</dd></dl>
    </details>
  </div>
  {#snippet footer()}
    <p class="foot-note"><Icon name="sparkles" size={14} />About 5 min. You can keep working.</p>
    <button class="btn primary lg {gk('glass-btn glass-btn--primary glass-btn--auto')}" onclick={onclose}><span>Make</span><span class="cost">30 gens</span></button>
  {/snippet}
</Sheet>
