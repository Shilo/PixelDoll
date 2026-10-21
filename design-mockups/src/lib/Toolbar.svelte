<script lang="ts">
  import Icon from './Icon.svelte'
  import Logo from './Logo.svelte'
  import { ui, view, gk, JOBS } from '../state.svelte'
  let { onexport, onactivity }: { onexport: () => void; onactivity: () => void } = $props()
  const phone = $derived(view.size === 'compact' || view.size === 'landscape')
</script>

<header class="toolbar" class:phone>
  <div class="tb-lead">
    {#if phone}
      <button class="btn icon plain {gk('glass-pill')}" aria-label="Projects" title="Projects"><Icon name="chevron-left" size={20} /></button>
    {:else}
      <button class="btn icon plain {gk('glass-pill')}" aria-label="Toggle wardrobe" title="Toggle wardrobe (⌘⌥S)" aria-pressed={ui.sidebar} onclick={() => (ui.sidebar = !ui.sidebar)}><Icon name="panel-left" size={18} /></button>
      <Logo />
      <span class="tb-sep" aria-hidden="true"></span>
    {/if}
    <button class="btn plain project">Adventurer <Icon name="chevron-down" size={14} /></button>
  </div>

  {#if !phone}
    <div class="tb-center" role="group" aria-label="History">
      <button class="btn icon plain {gk('glass-pill')}" aria-label="Undo colour change" title="Undo Colour Change (⌘Z)"><Icon name="undo-2" size={18} /></button>
      <button class="btn icon plain {gk('glass-pill')}" aria-label="Redo" title="Redo (⇧⌘Z)" disabled><Icon name="redo-2" size={18} /></button>
    </div>
  {/if}

  <div class="tb-trail">
    {#if phone}
      <button class="btn icon plain {gk('glass-pill')}" aria-label="Undo colour change"><Icon name="undo-2" size={20} /></button>
      {#if view.size === 'landscape' && JOBS()}
        <button class="btn icon plain activity-btn {gk('glass-pill')}" aria-label="2 items generating" onclick={onactivity}><span class="ring sm" style:--p="62"></span></button>
      {/if}
      <button class="btn primary {view.size === 'landscape' ? '' : 'icon'} {gk('glass-btn glass-btn--primary glass-btn--auto glass-btn--sm')}" aria-label="Export" onclick={onexport}><Icon name="download" size={18} />{#if view.size === 'landscape'}<span>Export</span>{/if}</button>
    {:else}
      <button class="btn plain activity {gk('glass-badge glass-badge--interactive')}" onclick={onactivity} aria-label={JOBS() ? '2 items generating, balance 1,840 generations' : 'Balance 1,840 generations'}>
        {#if JOBS()}<span class="ring sm" style:--p="62" aria-hidden="true"></span><span>2</span><span class="dot-sep" aria-hidden="true">·</span>{:else}<Icon name="coins" size={15} />{/if}
        <span class="num">1,840 gens</span>
      </button>
      <button class="btn primary {gk('glass-btn glass-btn--primary glass-btn--auto')}" onclick={onexport}><Icon name="download" size={16} /><span>Export</span></button>
      <button class="btn icon plain {gk('glass-pill')}" aria-label="Toggle inspector" title="Toggle inspector (⌘⌥I)" aria-pressed={ui.inspector} onclick={() => (ui.inspector = !ui.inspector)}><Icon name="panel-right" size={18} /></button>
    {/if}
  </div>
</header>
