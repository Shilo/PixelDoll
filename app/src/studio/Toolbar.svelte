<script lang="ts">
  import { app } from '../lib/app.svelte.ts'
  import { popoverFocus } from './experience/focus.ts'
  import { experience, characters } from './experience/state.svelte.ts'
  import CharacterThumb from './experience/CharacterThumb.svelte'
  import ApiPeek from './ApiPeek.svelte'
  import { queue } from '../lib/pixellab/queue.ts'
  import { fmtNum } from './model.ts'
  import { ui, doc, store, creating, settingUp, gens, openProject, undo, redo, toggleTheme, isDemo } from './state.svelte.ts'
  import { Github, Check, ChevronLeft, ExternalLink, ChevronRight, Download, Ellipsis, KeyRound, Plus, Redo2, Sun, Moon, Undo2, House, Activity, Pencil, Trash, PersonStanding } from './icons.ts'

  const m = $derived(store.project?.manifest)
  const devRigs = $derived(store.projects.filter((p) => p.dev))
  const active = $derived($queue.counts.running + $queue.counts.pending)
  const busy = $derived(active > 0 || gens.some((g) => g.phase === 'running') || (!!creating.spec && !creating.projectId && !creating.error) || (!!settingUp.spec && !settingUp.done && !settingUp.error))
  const undoLabel = $derived(doc.undo.at(-1)?.label)
  const redoLabel = $derived(doc.redo.at(-1)?.label)
  let menu: HTMLElement
  const close = () => menu?.hidePopover?.()
  const pick = (id: string) => { close(); if (id !== doc.id) void openProject(id) }
  const sheet = (s: typeof ui.sheet) => { close(); ui.sheet = s }
</script>

<header class="experience-header">
  <div class="header-start">
    {#if experience.screen === 'studio'}<button class="bu-action header-back" data-variant="quiet" onclick={characters}><ChevronLeft size={18} />Characters</button>{:else}<span class="brand"><PersonStanding size={20}/>PixelDoll</span>{/if}
  </div>
  <div class="header-actions">
    {#if experience.screen === 'characters'}
      <button class="bu-action selection-import" data-variant="outline" onclick={() => { ui.importSource='device'; ui.sheet='import' }}><Download size={16} /><span>Import</span></button>
      <button class="bu-action selection-create" data-variant="outline" aria-label="New character" onclick={() => ui.sheet='create'}><Plus size={16} /><span class="desktop-name">New character</span><span class="mobile-name">New</span></button>
    {:else}
      <button class="bu-action header-undo" data-variant="quiet" aria-label={undoLabel ? 'Undo '+undoLabel : 'Undo'} disabled={!undoLabel} onclick={undo}><Undo2 size={18} /></button>
      <button class="bu-action header-redo" data-variant="quiet" aria-label={redoLabel ? 'Redo '+redoLabel : 'Redo'} disabled={!redoLabel} onclick={redo}><Redo2 size={18} /></button>
      <button class="bu-action" data-variant="outline" onclick={() => ui.sheet='export'} disabled={!m}><Download size={16} /><span>Export</span></button>
    {/if}
    {#if busy}<button class="bu-action" data-variant="quiet" aria-label="Activity" onclick={() => ui.sheet='activity'}><span class="ring spin"></span><span class="num">{active || ''}</span></button>{/if}
    <button class="bu-action" data-variant="quiet" aria-label="More options" popovertarget="experience-options"><Ellipsis size={20} /></button>
  </div>
</header>
<div id="experience-options" class="menu options-menu bu-floating" popover ontoggle={popoverFocus}>
  <button class="row bu-action" data-variant="quiet" onclick={() => { toggleTheme(); document.getElementById('experience-options')?.hidePopover() }}>{#if ui.theme==='dark'}<Sun size={18}/>{:else}<Moon size={18}/>{/if}<span class="row-name">{ui.theme==='dark'?'Light mode':'Dark mode'}</span></button>
  {#if experience.screen==='studio'}<button class="row bu-action mobile-redo" data-variant="quiet" disabled={!redoLabel} onclick={() => { document.getElementById('experience-options')?.hidePopover(); redo() }}><Redo2 size={18}/><span class="row-name">{redoLabel?'Redo '+redoLabel:'Redo'}</span></button>{/if}
  <button class="row bu-action" data-variant="quiet" onclick={() => { document.getElementById('experience-options')?.hidePopover(); ui.sheet='connect' }}><KeyRound size={18}/><span class="row-name">{app.key ? app.keyRejected ? 'Key not accepted' : 'PixelLab account' : 'Connect PixelLab'}</span></button>
  <button class="row bu-action" data-variant="quiet" onclick={() => { document.getElementById('experience-options')?.hidePopover(); ui.sheet='activity' }}><Activity size={18}/><span class="row-name">Activity</span>{#if $queue.role==='follower'}<span class="small">Other tab</span>{/if}</button>
  <ApiPeek scope="all" all />
  <a class="row bu-action" data-variant="quiet" href="https://github.com/Shilo/PixelDoll" target="_blank" rel="noreferrer"><Github size={18}/><span class="row-name">GitHub</span><ExternalLink size={16}/></a>
</div>

<div id="project-menu" class="menu" popover bind:this={menu} role="menu" aria-label="Characters"
  ontoggle={popoverFocus}>
  <p class="menu-sec">Characters</p>
  {#snippet proj(p: (typeof store.projects)[number])}
    <button class="row" role="menuitemradio" aria-checked={p.id === doc.id} aria-label={p.name} onclick={() => pick(p.id)}>
      <CharacterThumb id={p.id} name={p.name} size={48}/><span class="row-name">{p.name}</span>{#if p.id === doc.id}<Check size={14} />{/if}
    </button>
  {/snippet}
  {#each store.projects.filter((p) => !p.dev) as p (p.id)}{@render proj(p)}{/each}
  <button class="row" role="menuitem" aria-label="New character…" onclick={() => sheet('create')}><Plus size={16} /><span class="row-name">New character…</span></button>
  <button class="row" role="menuitem" aria-label="Import character…" onclick={() => { ui.importSource = 'device'; sheet('import') }}><Download size={16} /><span class="row-name">Import character…</span></button>
  {#if !isDemo()}<button class="row" role="menuitem" aria-label="Rename character…" onclick={() => sheet('rename')}><Pencil size={16} /><span class="row-name">Rename…</span></button>{/if}
  {#if !isDemo()}<button class="row" role="menuitem" aria-label="Set up character…" onclick={() => sheet('setup')}><PersonStanding size={16} /><span class="row-name">Set up character…</span></button>{/if}
  {#if !isDemo()}<button class="row" role="menuitem" aria-label="Delete character…" onclick={() => sheet('delete')}><Trash size={16} /><span class="row-name">Delete character…</span></button>{/if}
  <hr />
  <button class="row" role="menuitem" aria-label={app.key ? 'PixelLab key' : 'Connect PixelLab…'} onclick={() => sheet('connect')}><KeyRound size={16} /><span class="row-name">{app.key ? 'PixelLab key' : 'Connect PixelLab…'}</span>
    {#if app.balance}<span class="faint small num">{fmtNum(app.balance.subscription.generations)} gens</span>{/if}</button>
  <button class="row" role="menuitem" aria-label="Activity" onclick={() => sheet('activity')}><Activity size={16} /><span class="row-name">Activity</span>{#if active}<span class="badge accent">{active}</span>{/if}</button>
  <button class="row" role="menuitem" aria-label="Character selection" onclick={() => { close(); characters() }}><House size={16} /><span class="row-name">Character selection</span></button>
  {#if import.meta.env.DEV}<a class="row" role="menuitem" aria-label="Developer pages" href="#/dev" onclick={close} style="text-decoration:none"><Ellipsis size={16} /><span class="row-name">Developer pages (M1–M5)</span></a>{/if}
  <!-- T2: rigs frozen on the M2 dev pages stay out of the main list; reachable here for developers only -->
  {#if devRigs.length}
    <details class="dev-rigs">
      <summary class="row"><ChevronRight size={16} /><span class="row-name">Developer rigs</span><span class="faint small num">{devRigs.length}</span></summary>
      {#each devRigs as p (p.id)}{@render proj(p)}{/each}
    </details>
  {/if}
</div>
