<script lang="ts">
  import Icon from './Icon.svelte'
  import Sheet from './Sheet.svelte'
  import { gk } from '../state.svelte'
  let { onclose }: { onclose: () => void } = $props()
  const engines = [
    { id: 'godot', name: 'Godot', sub: '4.x · SpriteFrames' },
    { id: 'unity', name: 'Unity', sub: '6 · Sprite Library' },
    { id: 'phaser', name: 'Phaser', sub: '3 / 4 · atlas JSON' },
    { id: 'png', name: 'PNG sheets', sub: 'Any engine · JSON' },
  ]
  let pick = $state('godot')
</script>

<Sheet title="Export" {onclose}>
  <div class="form">
    <div class="field">
      <span class="label">For which engine?</span>
      <div class="engines" role="radiogroup" aria-label="Engine">
        {#each engines as e (e.id)}
          <button class="engine" role="radio" aria-checked={pick === e.id} onclick={() => (pick = e.id)}>
            <span class="engine-icon"><Icon name={e.id === 'png' ? 'image' : 'gamepad-2'} size={20} /></span>
            <span class="engine-name">{e.name}</span>
            <span class="engine-sub">{e.sub}</span>
            <span class="radio" aria-hidden="true"></span>
          </button>
        {/each}
      </div>
    </div>
    <p class="includes"><Icon name="package" size={14} /><span>4 directions · 2 moves · 6 items · 3 outfits</span></p>
    <div class="notice warn {gk('glass-status')}" role="status">
      <Icon name="triangle-alert" size={16} />
      <span>The longsword touches the frame edge in 2 punch frames.</span>
      <button class="btn plain link sm">Show</button>
    </div>
    <details class="disclosure">
      <summary><Icon name="chevron-right" size={14} />Details <span class="muted">· one sheet per layer · baked outfits</span></summary>
      <dl class="kv"><dt>Layers</dt><dd>One sheet per item layer</dd><dt>Outfits</dt><dd>Also baked as single sheets</dd><dt>Files</dt><dd>14 PNG · manifest.json · Godot .tres</dd></dl>
    </details>
  </div>
  {#snippet footer()}
    <p class="foot-note"><Icon name="check" size={14} />No key needed. Free.</p>
    <button class="btn primary lg {gk('glass-btn glass-btn--primary glass-btn--auto')}" onclick={onclose}><Icon name="download" size={16} /><span>Download zip</span><span class="cost">340 KB</span></button>
  {/snippet}
</Sheet>
