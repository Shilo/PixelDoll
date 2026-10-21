<script lang="ts">
  import { app } from '../lib/app.svelte.ts'
  import { queue } from '../lib/pixellab/queue.ts'
  import { fmtNum } from './model.ts'
  import { ui, doc, store, creating, gens, openProject, undo, redo, toggleTheme, refreshProjects, isDemo } from './state.svelte.ts'
  import { Check, ChevronDown, Coins, Download, Ellipsis, KeyRound, PanelLeft, PanelRight, Plus, Redo2, Sun, Moon, Undo2, House, Activity } from './icons.ts'

  let { phone = false }: { phone?: boolean } = $props()
  const m = $derived(store.project?.manifest)
  const active = $derived($queue.counts.running + $queue.counts.pending)
  const busy = $derived(active > 0 || gens.some((g) => g.phase === 'running') || (!!creating.spec && !creating.projectId && !creating.error))
  const undoLabel = $derived(doc.undo.at(-1)?.label)
  const redoLabel = $derived(doc.redo.at(-1)?.label)
  let menu: HTMLElement
  const close = () => menu?.hidePopover?.()
  const pick = (id: string) => { close(); if (id !== doc.id) void openProject(id) }
  const sheet = (s: typeof ui.sheet) => { close(); ui.sheet = s }
</script>

<header class="toolbar" class:phone>
  <div class="tb-lead">
    {#if ui.size === 'expanded' || ui.size === 'medium'}
      <button class="btn icon plain" aria-label="Wardrobe" title="Show / hide the wardrobe" aria-pressed={ui.size === 'medium' ? ui.drawer : ui.sidebar}
        onclick={() => (ui.size === 'medium' ? (ui.drawer = !ui.drawer) : (ui.sidebar = !ui.sidebar))}><PanelLeft size={18} /></button>
      <span class="logo" aria-label="PixelDoll"><span class="mark" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="5" y="1" width="4" height="4" rx="1" /><rect x="3" y="6" width="8" height="4" rx="1" /><rect x="4" y="10" width="2" height="3" /><rect x="8" y="10" width="2" height="3" /></svg></span>{#if ui.size === 'expanded'}PixelDoll{/if}</span>
      <span class="tb-sep" aria-hidden="true"></span>
    {/if}
    <button class="btn plain project-btn" popovertarget="project-menu" aria-haspopup="menu" onclick={() => void refreshProjects()} title="Switch character">
      <span>{store.projects.find((p) => p.id === doc.id)?.name ?? m?.name ?? 'PixelDoll'}</span><ChevronDown size={14} />
    </button>
  </div>

  {#if !phone}
    <div class="tb-center">
      <button class="btn icon plain" aria-label={undoLabel ? `Undo ${undoLabel}` : 'Undo'} title={undoLabel ? `Undo ${undoLabel} (Ctrl+Z)` : 'Nothing to undo'} disabled={!undoLabel} onclick={undo}><Undo2 size={18} /></button>
      <button class="btn icon plain" aria-label={redoLabel ? `Redo ${redoLabel}` : 'Redo'} title={redoLabel ? `Redo ${redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo'} disabled={!redoLabel} onclick={redo}><Redo2 size={18} /></button>
    </div>
  {/if}

  <div class="tb-trail">
    {#if phone}
      <button class="btn icon plain" aria-label={undoLabel ? `Undo ${undoLabel}` : 'Undo'} disabled={!undoLabel} onclick={undo}><Undo2 size={20} /></button>
    {:else}
      {#if busy}
        <button class="btn plain balance" onclick={() => (ui.sheet = 'activity')} title="Activity"><span class="ring spin" aria-hidden="true"></span><span class="num">{active || ''}</span><span class="sr">jobs running</span></button>
      {/if}
      <button class="btn plain balance" onclick={() => (ui.sheet = app.key ? 'activity' : 'connect')} title={app.key ? 'Generations left on your PixelLab account' : 'Connect PixelLab'}>
        {#if !app.key}<KeyRound size={15} /><span>Connect</span>
        {:else if app.keyRejected}<KeyRound size={15} /><span style="color:var(--bad)">Key rejected</span>
        {:else}<Coins size={15} /><span class="num">{app.balance ? `${fmtNum(app.balance.subscription.generations)} gens` : '…'}</span>{/if}
      </button>
    {/if}
    <button class="btn icon plain" aria-label={ui.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={ui.theme === 'dark' ? 'Light mode' : 'Dark mode'} onclick={toggleTheme}>
      {#if ui.theme === 'dark'}<Sun size={18} />{:else}<Moon size={18} />{/if}
    </button>
    {#if phone}
      <button class="btn icon primary" aria-label="Export" title="Export" onclick={() => (ui.sheet = 'export')} disabled={!m}><Download size={20} /></button>
    {:else}
      <button class="btn primary" onclick={() => (ui.sheet = 'export')} disabled={!m}><Download size={15} />Export</button>
      {#if ui.size === 'expanded' || ui.size === 'medium'}
        <button class="btn icon plain" aria-label="Inspector" title="Show / hide the inspector (Ctrl+Alt+I)" aria-pressed={ui.inspector} onclick={() => (ui.inspector = !ui.inspector)}><PanelRight size={18} /></button>
      {/if}
    {/if}
  </div>
</header>

<div id="project-menu" class="menu" popover bind:this={menu} role="menu" aria-label="Characters">
  <p class="menu-sec">Characters</p>
  {#each store.projects as p (p.id)}
    <button class="row" role="menuitemradio" aria-checked={p.id === doc.id} onclick={() => pick(p.id)}>
      <span class="row-name">{p.name}</span>{#if p.id === doc.id}<Check size={14} />{/if}
    </button>
  {/each}
  <button class="row" role="menuitem" onclick={() => sheet('create')}><Plus size={16} /><span class="row-name">New character…</span></button>
  <hr />
  <button class="row" role="menuitem" onclick={() => sheet('connect')}><KeyRound size={16} /><span class="row-name">{app.key ? 'PixelLab key' : 'Connect PixelLab…'}</span>
    {#if app.balance}<span class="faint small num">{fmtNum(app.balance.subscription.generations)} gens</span>{/if}</button>
  <button class="row" role="menuitem" onclick={() => sheet('activity')}><Activity size={16} /><span class="row-name">Activity</span>{#if active}<span class="badge accent">{active}</span>{/if}</button>
  <button class="row" role="menuitem" onclick={() => { close(); ui.welcome = true }}><House size={16} /><span class="row-name">Welcome screen</span></button>
  <a class="row" role="menuitem" href="#/dev" onclick={close} style="text-decoration:none"><Ellipsis size={16} /><span class="row-name">Developer pages (M1–M5)</span></a>
</div>
