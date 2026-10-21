<script lang="ts">
  import Icon from './Icon.svelte'
  import Sprite from './Sprite.svelte'
  import { MOVES } from '../data'
  import { ui, gk } from '../state.svelte'
</script>

<div class="moves">
  <h3 class="sec-title">Moves</h3>
  <ul class="move-list">
    {#each MOVES as m (m.id)}
      <li>
        <button class="move-row" class:sel={ui.move === m.id} aria-pressed={ui.move === m.id} onclick={() => (ui.move = m.id)}>
          <span class="move-thumb"><Sprite move={m.id} zoom={1} checker={false} label="{m.name} preview" /></span>
          <span class="move-text"><span class="row-name">{m.name}</span><span class="muted small">{m.frames} frames · {m.dirs}</span></span>
          <Icon name={ui.move === m.id && ui.playing ? 'pause' : 'play'} size={14} />
        </button>
      </li>
    {/each}
  </ul>
  <p class="sec-title sub">Add a move <span class="muted small">· from 20 gens</span></p>
  <div class="chips">
    {#each ['Idle', 'Run', 'Jump', 'Kick', 'Cast'] as c}<button class="chip {gk('glass-badge glass-badge--interactive')}"><Icon name="plus" size={12} />{c}</button>{/each}
  </div>
</div>
