<script lang="ts">
  import Sprite from './Sprite.svelte'
  import ApiPeek from './ApiPeek.svelte'
  import { composeCell } from '../lib/compose/compose.ts'
  import { ui, doc, view, DEMO, openProject, dismissWelcome, toggleTheme } from './state.svelte.ts'
  import { Moon, Sun, Sparkles, Download } from './icons.ts'

  let vw = $state(innerWidth), vh = $state(innerHeight)
  // short phones (320 x 568): the hero gives way so the buttons stay above the fold
  const heroPx = $derived(ui.size === 'landscape' ? 192 : vw < 900 ? Math.min(256, Math.floor(vw * 0.7), Math.floor(vh * 0.3)) : 384)
  const k = $derived(Math.max(1, Math.floor((heroPx * ui.dpr) / 64)))
  const img = $derived(view.project && view.anim ? composeCell(view.project, doc.items, ui.anim, 'south', view.cell) : null)
  function create() { dismissWelcome(); ui.sheet = 'create' }
  function demo() { dismissWelcome(); if (doc.id !== DEMO) void openProject(DEMO) }
  const STEPS = [['Create', 'Describe the body'], ['Add items', 'Hats, tops, weapons'], ['Dress up', 'Wear, recolour, play'], ['Export', 'Any game engine']]
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} />

<div class="welcome">
  <div class="welcome-bar">
    <span class="logo"><span class="mark" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="5" y="1" width="4" height="4" rx="1" /><rect x="3" y="6" width="8" height="4" rx="1" /><rect x="4" y="10" width="2" height="3" /><rect x="8" y="10" width="2" height="3" /></svg></span>PixelDoll</span>
    <span class="api-action"><ApiPeek scope="all" all /><button class="bu-action btn icon plain" data-variant="quiet" aria-label={ui.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onclick={toggleTheme}>{#if ui.theme === 'dark'}<Sun size={18} />{:else}<Moon size={18} />{/if}</button></span>
  </div>
  <main class="welcome-main">
    <div class="hero-stage" style:width="{heroPx + 32}px" style:height="{heroPx + 32}px">
      {#if img}<Sprite {img} {k} label="Demo character walking" />{:else}<span class="ring spin" aria-hidden="true"></span>{/if}
    </div>
    <div class="hero-copy">
      <h1 class="hero-title">Dress up your 2D game characters with pixel&#8209;perfect paper dolling</h1>
      <p class="hero-sub">Generate swappable, frame-aligned equipment layers with PixelLab AI and export them to any game engine.</p>
      <div class="hero-actions">
        <button class="bu-action btn primary lg" data-variant="primary" onclick={create}><Sparkles size={16} />Create your character</button>
        <button class="bu-action btn lg" data-variant="outline" onclick={demo}>Try the demo</button>
      </div>
      <button class="bu-action btn plain" data-variant="quiet" onclick={() => { ui.importSource = 'device'; ui.sheet = 'import' }}><Download size={16} />Import an existing character</button>
      <p class="faint small">The demo needs no account. Creating uses your <a href="https://pixellab.ai" target="_blank" rel="noreferrer">PixelLab</a> generations.</p>
    </div>
  </main>
  <ol class="how">
    {#each STEPS as [t, s], i (t)}
      <li><span class="how-num">{i + 1}</span><span class="how-text"><b>{t}</b><span class="muted small">{s}</span></span></li>
    {/each}
  </ol>
</div>
