<script lang="ts">
  import Icon from './Icon.svelte'
  import { ui, gk, JOBS } from '../state.svelte'
  import { GEN } from '../data'
  let { onactivity }: { onactivity: () => void } = $props()
  const tabs = [['wardrobe', 'Wardrobe', 'shirt'], ['colours', 'Colours', 'palette'], ['moves', 'Moves', 'person-standing']] as const
</script>

<div class="dock">
  {#if JOBS()}
    <button class="accessory" onclick={onactivity} aria-label="2 items generating. Open activity.">
      <span class="ring" style:--p="62" aria-hidden="true"></span>
      <span class="acc-text"><b>{GEN.name}</b><span class="muted">Adding 10 of 16 · 2:40 left</span></span>
      <span class="acc-count num">+1</span>
    </button>
  {/if}
  <nav class="tabbar {gk('glass-tab-bar glass-tab-bar--floating')}" aria-label="Studio">
    {#each tabs as [id, label, icon]}
      <button class="tab {gk('glass-tab-bar__item')}" class:is-active={ui.tab === id} aria-current={ui.tab === id ? 'page' : undefined} onclick={() => (ui.tab = id)}>
        <span class="tab-icon {gk('glass-tab-bar__icon')}"><Icon name={icon} size={22} /></span>
        <span class="tab-label {gk('glass-tab-bar__label')}">{label}</span>
      </button>
    {/each}
  </nav>
</div>
