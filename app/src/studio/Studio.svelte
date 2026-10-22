<script lang="ts">
  import './studio.css'
  import { onMount } from 'svelte'
  import { app, refreshBalance } from '../lib/app.svelte.ts'
  import { queue } from '../lib/pixellab/queue.ts'
  import Toolbar from './Toolbar.svelte'
  import Wardrobe from './Wardrobe.svelte'
  import Stage from './Stage.svelte'
  import Inspector from './Inspector.svelte'
  import PhonePanel from './PhonePanel.svelte'
  import Welcome from './Welcome.svelte'
  import Sheet from './Sheet.svelte'
  import ItemPane from './ItemPane.svelte'
  import ConnectSheet from './ConnectSheet.svelte'
  import CreateSheet from './CreateSheet.svelte'
  import NewItemSheet from './NewItemSheet.svelte'
  import ExportSheet from './ExportSheet.svelte'
  import ActivitySheet from './ActivitySheet.svelte'
  import MoveSheet from './MoveSheet.svelte'
  import RenameSheet from './RenameSheet.svelte'
  import ImportSheet from './ImportSheet.svelte'
  import DeleteSheet from './DeleteSheet.svelte'
  import SetupSheet from './SetupSheet.svelte'
  import StageNote from './StageNote.svelte'
  import { moveDirs } from '../lib/dress/dress.ts'
  import { ui, doc, store, view, gens, creating, settingUp, initUi, refreshProjects, openProject, lastProject, loadGens, resumeCreate, resumeMove, resumeSetup, undo, redo, genProgress } from './state.svelte.ts'
  import { Palette, PersonStanding, Shirt, WifiOff } from './icons.ts'

  // once on mount (an $effect would re-run on every state it reads, e.g. the theme)
  onMount(() => {
    document.documentElement.dataset.app = 'studio'
    if (import.meta.env.DEV) (window as unknown as { __studio: unknown }).__studio = { ui, doc, store, gens, creating }
    const off = initUi()
    void (async () => {
      await refreshProjects()
      await openProject(lastProject())
      await loadGens()
      await resumeCreate()
      await resumeMove()
      await resumeSetup()
    })()
    return () => { off(); delete document.documentElement.dataset.app }
  })

  // one playback clock for every visible sprite (D1 §3.6 rule 5)
  $effect(() => {
    const a = view.anim
    if (!a || !ui.playing) return
    const t = setTimeout(() => ui.frame++, a.frames[ui.frame % a.frames.length].ms)
    return () => clearTimeout(t)
  })

  // a move without the current view (demo cross punch: south only) switches to one it has
  $effect(() => {
    const m = store.project?.manifest
    const made = m ? moveDirs(m, ui.anim) : []
    if (made.length && !made.includes(ui.dir)) ui.dir = made[0]
  })

  // Back (browser button, Android gesture) closes an open sheet first: one history entry while any sheet is open.
  // ponytail: not reactive on purpose (plain flag); a sheet -> sheet switch keeps the same entry.
  let sheetEntry = false
  $effect(() => {
    const open = !!ui.sheet
    if (open && !sheetEntry) { history.pushState({ pixeldollSheet: 1 }, ''); sheetEntry = true }
    else if (!open && sheetEntry) { sheetEntry = false; history.back() }
  })
  const onpop = () => { if (sheetEntry) { sheetEntry = false; ui.sheet = null } }

  // balance after every settled job (like TopBar)
  const settled = $derived($queue.counts.done + $queue.counts.failed)
  $effect(() => { void settled; if (app.key) void refreshBalance() })
  // the page title shows running work
  const running = $derived(gens.filter((g) => g.phase === 'running').length + (creating.spec && !creating.projectId && !creating.error ? 1 : 0) + (settingUp.spec && !settingUp.done && !settingUp.error ? 1 : 0))
  $effect(() => { document.title = running ? `(${running}) PixelDoll` : 'PixelDoll' })

  function onkey(e: KeyboardEvent) {
    const t = e.target as HTMLElement
    // T2: arrow keys (Home/End) move between the options of a segmented control, tab list or radio group (selection follows
    // focus, WAI-ARIA) and between the rows of the character menu (focus only)
    const group = t.closest?.('[role=tablist], [role=radiogroup], .seg[role=group], [role=menu]')
    if (group && /^(Arrow(Left|Right|Up|Down)|Home|End)$/.test(e.key)) {
      const menu = group.getAttribute('role') === 'menu'
      const opts = [...group.querySelectorAll<HTMLElement>(menu ? '.row' : 'button')].filter((o) => !(o as HTMLButtonElement).disabled && o.getClientRects().length)
      const i = opts.indexOf(t)
      if (i < 0) return
      e.preventDefault()
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? opts.length - 1 : (i + (/Right|Down/.test(e.key) ? 1 : -1) + opts.length) % opts.length
      opts[n].focus()
      if (!menu) opts[n].click()
      return
    }
    if (ui.sheet || ui.welcome || t.closest('input, textarea, select, [contenteditable]')) return
    const mod = e.ctrlKey || e.metaKey
    const m = store.project?.manifest
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
    if (mod && e.altKey && e.key.toLowerCase() === 'i') { e.preventDefault(); if (ui.size === 'medium' && ui.drawer) { ui.drawer = false; ui.inspector = true } else ui.inspector = !ui.inspector; return }
    if (mod || e.altKey || !m) return
    if (e.key === ' ' && !t.closest('button, a')) { e.preventDefault(); ui.playing = !ui.playing }
    else if (e.key === ',' || e.key === '.') { ui.playing = false; ui.frame += e.key === '.' ? 1 : (view.anim?.frames.length ?? 1) - 1 }
    else if (e.key === '0') ui.all = !ui.all
    else if (/^[1-8]$/.test(e.key) && m.rig.directions[+e.key - 1] && moveDirs(m, ui.anim).includes(m.rig.directions[+e.key - 1].id)) { ui.dir = m.rig.directions[+e.key - 1].id; ui.all = false }
  }

  // B15: offline (browser says so, or PixelLab got no answer and the queue paused): a small banner, never a blocker
  let online = $state(navigator.onLine)
  const offline = $derived(!online || $queue.paused === 'offline')

  const desk = $derived(ui.size === 'expanded' || ui.size === 'medium')
  const firstGen = $derived(gens.find((g) => g.draft.rigId === doc.id && g.phase !== 'failed'))
  const creatingNow = $derived(!!creating.spec && !creating.projectId)
  const TABS = [['wardrobe', 'Wardrobe', Shirt], ['colours', 'Colours', Palette], ['moves', 'Moves', PersonStanding]] as const
</script>

<svelte:window onkeydown={onkey} onpopstate={onpop} ononline={() => (online = true)} onoffline={() => (online = false)} />

<div class="studio-app">
  {#if ui.welcome}
    <Welcome />
  {:else}
    <div class="studio {ui.size}">
      {#if ui.size !== 'landscape'}<Toolbar phone={ui.size === 'compact'} />{/if}
      <div class="main">
        <!-- B10 (T1 P1-3): medium width pushes the stage instead of covering it; portrait tablets use the stacked layout -->
        {#if (ui.size === 'expanded' && ui.sidebar) || (ui.size === 'medium' && ui.drawer)}<aside class="side pane" aria-label="Wardrobe"><Wardrobe /></aside>{/if}
        <main class="stage-wrap" aria-label="Preview"><Stage /><StageNote /></main>
        {#if desk && ui.inspector && (ui.size !== 'medium' || !ui.drawer)}<aside class="insp pane" aria-label="Inspector"><Inspector /></aside>{/if}
        {#if ui.size === 'compact'}<section class="phone-panel" aria-label={ui.tab}><PhonePanel /></section>{/if}
        {#if ui.size === 'landscape'}
          <section class="land-col">
            <Toolbar phone />
            <div class="seg full" role="tablist" aria-label="Studio">
              {#each TABS as [id, label] (id)}<button role="tab" aria-selected={ui.tab === id} onclick={() => (ui.tab = id)}>{label}</button>{/each}
            </div>
            <PhonePanel />
          </section>
        {/if}
      </div>
      {#if ui.size === 'compact'}
        <div class="dock">
          {#if (firstGen && !(ui.tab === 'wardrobe' && ui.selected === `gen:${firstGen.draft.spec.id}`)) || creatingNow}
            {@const p = firstGen ? genProgress(firstGen, $queue.jobs) : null}
            <button class="accessory" onclick={() => { if (firstGen) { ui.selected = `gen:${firstGen.draft.spec.id}`; ui.tab = 'wardrobe' } else ui.sheet = 'create' }}>
              <span class="ring" class:spin={!p || !p.pct} style:--p={p?.pct ?? 0}></span>
              <span class="acc-text"><b>{firstGen ? firstGen.input.name : creating.spec?.name}</b><span>{p ? p.label : creating.error ? 'Needs attention' : 'Creating your character'}</span></span>
            </button>
          {/if}
          <div class="tabbar" role="tablist" aria-label="Studio">
            {#each TABS as [id, label, I] (id)}
              <button class="tab" role="tab" aria-selected={ui.tab === id} onclick={() => (ui.tab = id)}><I size={20} /><span class="tab-label">{label}</span></button>
            {/each}
          </div>
        </div>
      {/if}
      {#if offline}<div class="offline-banner" role="status"><WifiOff size={14} aria-hidden="true" />You're offline — generation paused; everything else works</div>{/if}
      {#if ui.toast}<div class="toast" role="status">{ui.toast}</div>{/if}
    </div>
  {/if}

  {#if ui.sheet === 'connect'}<ConnectSheet />{/if}
  {#if ui.sheet === 'create'}<CreateSheet />{/if}
  {#if ui.sheet === 'newitem'}<NewItemSheet />{/if}
  {#if ui.sheet === 'export'}<ExportSheet />{/if}
  {#if ui.sheet === 'activity'}<ActivitySheet />{/if}
  {#if ui.sheet === 'move'}<MoveSheet />{/if}
  {#if ui.sheet === 'rename'}<RenameSheet />{/if}
  {#if ui.sheet === 'import'}<ImportSheet />{/if}
  {#if ui.sheet === 'delete'}<DeleteSheet />{/if}
  {#if ui.sheet === 'setup'}<SetupSheet />{/if}
  {#if ui.sheet === 'item' && store.project?.manifest.items.some((i) => i.id === ui.selected)}
    <Sheet title="Item" cancel="Done" onclose={() => (ui.sheet = null)}><ItemPane id={ui.selected} /></Sheet>
  {/if}
</div>
