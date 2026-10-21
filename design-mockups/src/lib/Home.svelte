<script lang="ts">
  // First run: no key, no project. The bundled demo character dresses up and exports with no wait and no cost (D1 §5.1).
  import Icon from './Icon.svelte'
  import Logo from './Logo.svelte'
  import Sprite from './Sprite.svelte'
  import { view, gk } from '../state.svelte'
  const phone = $derived(view.size === 'compact' || view.size === 'landscape')
  const steps = [['Describe', 'A body in your words'], ['Add items', 'Hats, capes, swords…'], ['Dress up', 'Wear, recolour, play'], ['Export', 'Godot, Unity, Phaser']]
</script>

<div class="home">
  <header class="home-bar">
    <Logo />
    <button class="btn icon plain {gk('glass-pill')}" aria-label="Settings"><Icon name="settings" size={18} /></button>
  </header>

  <main class="home-main">
    <figure class="hero-art">
      <div class="hero-stage"><Sprite zoom={view.size === 'landscape' ? 3 : phone ? 4 : 6} checker={false} label="Demo adventurer walking" /></div>
    </figure>
    <div class="hero-copy">
      <h1 class="hero-title">Make a pixel character you can dress up</h1>
      <p class="hero-sub">Describe a body, add clothes and gear, and export ready-made sprite sheets for your game.</p>
      <div class="hero-actions">
        <button class="btn primary lg {gk('glass-btn glass-btn--primary glass-btn--auto')}"><Icon name="plus" size={16} /><span>New character</span></button>
        <button class="btn lg {gk('glass-btn glass-btn--secondary glass-btn--auto')}"><Icon name="play" size={16} /><span>Try the demo</span></button>
      </div>
      <p class="muted small hero-note">The demo is free and needs no account. <button class="btn plain link sm">Import a .zip</button></p>
    </div>
  </main>

  <ol class="how" aria-label="How it works">
    {#each steps as [t, s], i}
      <li><span class="how-num">{i + 1}</span><span class="how-text"><b>{t}</b><span class="muted small">{s}</span></span></li>
    {/each}
  </ol>
</div>
