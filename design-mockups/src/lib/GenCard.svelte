<script lang="ts">
  // A long generation (minutes): honest step label, determinate progress, live cells as they arrive (D1 §5.3).
  import Icon from './Icon.svelte'
  import { GEN } from '../data'
  import { gk } from '../state.svelte'
  const pct = Math.round((GEN.done / GEN.cells) * 100)
</script>

<section class="gen" aria-labelledby="gen-title">
  <header class="insp-head">
    <h2 class="insp-title" id="gen-title">{GEN.name}</h2>
    <p class="insp-sub"><span>{GEN.group}</span><span class="badge accent {gk('glass-badge glass-badge--primary')}"><span class="ring xs" style:--p={pct}></span>Making</span></p>
  </header>

  <div class="gen-cells" aria-label="{GEN.done} of {GEN.cells} frames ready">
    {#each Array(GEN.cells) as _, i}
      {@const c = GEN.cell(i)}
      {#if i < GEN.done}
        <span class="cell"><img src={c.base} alt="" /><img src={c.layer} alt="" /></span>
      {:else}
        <span class="cell pending {gk('glass-skeleton')}"></span>
      {/if}
    {/each}
  </div>

  <div class="progress {gk('glass-progress')}">
    <div class="progress-head {gk('glass-progress__header')}"><span class={gk('glass-progress__label')}>Adding to walk · {GEN.done} of {GEN.cells}</span><span class="num muted {gk('glass-progress__value')}">about 2:40 left</span></div>
    <div class="track {gk('glass-progress__track')}"><div class="fill {gk('glass-progress__fill')}" style:width="{pct}%"></div></div>
  </div>

  <ol class="steps-list">
    <li class="done"><Icon name="check" size={14} />Designing</li>
    <li class="now"><span class="ring xs" style:--p={pct}></span>Adding to walk and punch</li>
    <li><span class="dot"></span>Checking every frame</li>
  </ol>

  <p class="note">You can keep working, or close this tab. We’ll pick up where we left off.</p>

  <div class="insp-actions">
    <button class="btn {gk('glass-btn glass-btn--secondary glass-btn--sm')}"><Icon name="x" size={14} /><span>Stop</span></button>
    <span class="muted small num">30 gens</span>
  </div>
</section>
