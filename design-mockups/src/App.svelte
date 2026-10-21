<script lang="ts">
  import Toolbar from './lib/Toolbar.svelte'
  import Wardrobe from './lib/Wardrobe.svelte'
  import Stage from './lib/Stage.svelte'
  import Inspector from './lib/Inspector.svelte'
  import Panel from './lib/Panel.svelte'
  import TabBar from './lib/TabBar.svelte'
  import Sheet from './lib/Sheet.svelte'
  import NewItem from './lib/NewItem.svelte'
  import Export from './lib/Export.svelte'
  import ActivityList from './lib/ActivityList.svelte'
  import Create from './lib/Create.svelte'
  import Home from './lib/Home.svelte'
  import Icon from './lib/Icon.svelte'
  import { ui, view, gk, go, LOOKS, SCREENS } from './state.svelte'

  if (ui.screen === 'generating' || ui.screen === 'activity') { ui.selected = 'gen'; ui.group = 'Body' }
  let sheet = $state<null | 'newitem' | 'export' | 'activity'>(
    ui.screen === 'newitem' ? 'newitem' : ui.screen === 'export' ? 'export' : ui.screen === 'activity' ? 'activity' : null,
  )
  let newGroup = $state('Head')
  const desk = $derived(view.size === 'expanded' || view.size === 'medium')
  const onnew = (g: string) => { newGroup = g; sheet = 'newitem' }
  const scheme = document.documentElement.dataset.scheme
</script>

{#if ui.screen === 'empty'}
  <Home />
{:else if ui.screen === 'create' || ui.screen === 'review' || ui.screen === 'connect'}
  <Create />
{:else}
  <div class="studio {view.size}">
    {#if view.size !== 'landscape'}
      <Toolbar onexport={() => (sheet = 'export')} onactivity={() => (sheet = sheet === 'activity' ? null : 'activity')} />
    {/if}
    <div class="main">
      {#if view.size === 'expanded' && ui.sidebar}<aside class="side pane">
        <Wardrobe {onnew} />
      </aside>{/if}
      <main class="stage-wrap" aria-label="Preview"><Stage /></main>
      {#if desk && ui.inspector}<aside class="insp pane" aria-label="Inspector"><Inspector /></aside>{/if}
      {#if view.size === 'compact'}<section class="phone-panel"><Panel {onnew} /></section>{/if}
      {#if view.size === 'landscape'}
        <section class="land-col">
          <Toolbar onexport={() => (sheet = 'export')} onactivity={() => (sheet = 'activity')} />
          <div class="seg full {gk('glass-segmented glass-segmented--full')}" role="group" aria-label="Studio">
            {#each [['wardrobe', 'Wardrobe'], ['colours', 'Colours'], ['moves', 'Moves']] as [id, label]}
              <button class={gk('glass-segmented__item')} aria-pressed={ui.tab === id} onclick={() => (ui.tab = id as typeof ui.tab)}>{label}</button>
            {/each}
          </div>
          <Panel {onnew} />
        </section>
      {/if}
    </div>
    {#if view.size === 'compact'}<TabBar onactivity={() => (sheet = 'activity')} />{/if}

    {#if sheet === 'activity' && desk}
      <div class="popover" role="dialog" aria-label="Activity"><ActivityList /></div>
    {/if}
  </div>
{/if}

{#if sheet === 'newitem'}<NewItem group={newGroup} onclose={() => (sheet = null)} />{/if}
{#if sheet === 'export'}<Export onclose={() => (sheet = null)} />{/if}
{#if sheet === 'activity' && !desk}<Sheet title="Activity" cancel="Close" detent="medium" onclose={() => (sheet = null)}><ActivityList /></Sheet>{/if}

{#if !ui.shot}
  <details class="switcher">
    <summary aria-label="Mockup settings"><Icon name="layers" size={16} /></summary>
    <div class="switcher-body">
      <label>Look <select value={ui.look} onchange={(e) => go({ look: e.currentTarget.value })}>{#each LOOKS as l}<option>{l}</option>{/each}</select></label>
      <label>Scheme <select value={scheme} onchange={(e) => go({ scheme: e.currentTarget.value })}><option>light</option><option>dark</option></select></label>
      <label>Screen <select value={ui.screen} onchange={(e) => go({ screen: e.currentTarget.value })}>{#each SCREENS as s}<option>{s}</option>{/each}</select></label>
    </div>
  </details>
{/if}
