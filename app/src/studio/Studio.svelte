<script lang="ts">
  import './studio.css'
  import './share.css'
  import './experience/theme.css'
  import './experience/layout.css'
  import { rememberActivation } from './experience/focus.ts'
  import Experience from './experience/Experience.svelte'
  import { onMount, untrack } from 'svelte'
  import { app, refreshBalance } from '../lib/app.svelte.ts'
  import { queue } from '../lib/pixellab/queue.ts'
  import Stage from './Stage.svelte'
  import Sheet from './Sheet.svelte'
  import Lazy from './Lazy.svelte'
  import RenameSheet from './RenameSheet.svelte'
  import DeleteSheet from './DeleteSheet.svelte'
  import { moveDirs } from '../lib/dress/dress.ts'
  import { ui, doc, store, view, gens, creating, settingUp, initUi, refreshProjects, refreshFits, openProject, lastProject, loadGens, toast, resumeCreate, resumeMove, resumeSetup, resumeFitStages, startupResumed, prefetchFlows, clearPendingConnection, cancelWaitingForTab, undo, redo } from './state.svelte.ts'
  import { lazy } from '../lib/lazy.ts'
  import { WifiOff } from './icons.ts'
  import { PREVIEW_NOTICE } from './previewNotice.ts'
  import Toast from './Toast.svelte'

  // On-demand parts, out of the startup bundle (GenCard renders in PhonePanel).
  const parts = {
    connect: () => import('./ConnectSheet.svelte'), create: () => import('./CreateSheet.svelte'), newitem: () => import('./NewItemSheet.svelte'),
    export: () => import('./ExportSheet.svelte'), activity: () => import('./ActivitySheet.svelte'), move: () => import('./MoveSheet.svelte'),
    import: () => import('./ImportSheet.svelte'), setup: () => import('./SetupSheet.svelte'), savedesign: () => import('./DesignSaveSheet.svelte'),
    fitdesign: () => import('./FitDesignSheet.svelte'), item: () => import('./ItemPane.svelte'), notes: () => import('./StageNote.svelte'),
    gen: () => import('./GenCard.svelte'),
  }

  // once on mount (an $effect would re-run on every state it reads, e.g. the theme)
  onMount(() => {
    document.documentElement.dataset.app = 'studio'
    if (import.meta.env.DEV) (window as unknown as { __studio: unknown }).__studio = { ui, doc, store, gens, creating, loadGens }
    const off = initUi()
    toast(PREVIEW_NOTICE.description, PREVIEW_NOTICE)
    void (async () => {
      await refreshProjects()
      await openProject(lastProject())
      // A failed read keeps item work stopped (startItem and Clear finished wait for it); create and moves still resume.
      await loadGens().catch((e: Error) => { console.error('drafts', e); toast(`Saved item drafts could not be read: ${e.message}. Reload to try again.`, { tone: 'danger' }) })
      await resumeCreate()
      await resumeMove()
      await resumeSetup()
      if (queue.role !== 'follower') await resumeFitStages()
      await refreshFits()
      startupResumed()
      // Once startup is done, fetch the on-demand code so it keeps working if the connection drops or a deploy replaces its
      // files. Production only: the dev server would transform every module on each page load. lazy() logs failures.
      if (import.meta.env.PROD) void Promise.allSettled([...Object.values(parts).map((load) => lazy<unknown>(load)), prefetchFlows()])
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

  // Back (browser button, Android gesture) closes an open sheet first: one history entry while any sheet is open.
  // ponytail: not reactive on purpose (plain flag); a sheet -> sheet switch keeps the same entry.
  let sheetEntry = false
  $effect(() => {
    const open = !!ui.sheet
    if (open && !sheetEntry) { history.pushState({ pixeldollSheet: 1 }, ''); sheetEntry = true }
    else if (!open && sheetEntry) { sheetEntry = false; history.back() }
  })
  // Closing Connect cancels its spending action, also when the sheet closes before its code loaded (ConnectSheet never mounted).
  $effect(() => { if (ui.sheet !== 'connect') clearPendingConnection() })
  // Leaving Activity by any route (Done, Back, another sheet) cancels a click waiting there for the other tab.
  $effect(() => { if (ui.sheet !== 'activity') cancelWaitingForTab() })
  const onpop = () => {
    if (!sheetEntry) return
    // An atomic local save/publish has the same disabled-close rule for browser Back as for Cancel/Escape.
    if (ui.sheetBusy) { history.pushState({ pixeldollSheet: 1 }, ''); return }
    sheetEntry = false; ui.sheet = null
  }

  // balance after every settled job (like TopBar)
  const settled = $derived($queue.counts.done + $queue.counts.failed)
  let observedFinished = new Set<string>()
  $effect(() => {
    void settled
    // One balance read may serve several jobs that finished together. Link it to all their peeks.
    const fresh = untrack(() => {
      const finished = $queue.jobs.filter((job) => job.state === 'done' || job.state === 'failed' || job.state === 'lost')
      const added = finished.filter((job) => !observedFinished.has(job.id))
      observedFinished = new Set(finished.map((job) => job.id))
      return added
    })
    if (app.key) void refreshBalance({ background: true, label: 'Update account balance', relatedQueueIds: fresh.map((job) => job.id), relatedScopes: [...new Set(fresh.flatMap((job) => job.activityScope ? [job.activityScope] : []))] })
  })
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
    if ((ui.sheet && ui.sheet!=='inspect') || t.closest('input, textarea, select, [contenteditable]')) return
    const mod = e.ctrlKey || e.metaKey
    const m = store.project?.manifest
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
    if (mod && e.altKey && e.key.toLowerCase() === 'i') { e.preventDefault(); if (m) ui.sheet = ui.sheet === 'inspect' ? null : 'inspect'; return }
    if (mod || e.altKey || !m) return
    if (ui.sheet!=='inspect') return
    if (e.key === ' ' && !t.closest('button, a')) { e.preventDefault(); ui.playing = !ui.playing }
    else if (e.key === ',' || e.key === '.') { ui.playing = false; ui.frame += e.key === '.' ? 1 : (view.anim?.frames.length ?? 1) - 1 }
    else if (e.key === '0') ui.all = !ui.all
    else if (/^[1-8]$/.test(e.key) && m.rig.directions[+e.key - 1] && moveDirs(m, ui.anim).includes(m.rig.directions[+e.key - 1].id)) { ui.dir = m.rig.directions[+e.key - 1].id; ui.all = false }
  }

  // B15: offline (browser says so, or PixelLab got no answer and the queue paused): a small banner, never a blocker
  let online = $state(navigator.onLine)
  const offline = $derived(!online || $queue.paused === 'offline')

</script>

<svelte:window onkeydown={onkey} onpopstate={onpop} ononline={() => (online = true)} onoffline={() => (online = false)} />

<div class="studio-app" onclickcapture={rememberActivation}>
  <Experience />
  {#if offline}<div class="offline-banner" role="status"><WifiOff size={14} aria-hidden="true" />You’re offline — generation paused; everything else works</div>{/if}
  {#if !ui.sheet}<Toast />{/if}

  {#if ui.sheet === 'inspect'}<Sheet title="Inspect character" cancel="Done" className="inspection-sheet" wide onclose={()=>ui.sheet=null}><div class="inspection-stage"><Stage/><Lazy load={parts.notes} sheet={false} /></div></Sheet>{/if}
  {#if ui.sheet === 'connect'}<Lazy load={parts.connect} />{/if}
  {#if ui.sheet === 'create'}<Lazy load={parts.create} />{/if}
  {#if ui.sheet === 'newitem'}<Lazy load={parts.newitem} />{/if}
  {#if ui.sheet === 'export'}<Lazy load={parts.export} />{/if}
  {#if ui.sheet === 'activity'}<Lazy load={parts.activity} />{/if}
  {#if ui.sheet === 'move'}<Lazy load={parts.move} />{/if}
  {#if ui.sheet === 'rename'}<RenameSheet />{/if}
  {#if ui.sheet === 'import'}<Lazy load={parts.import} />{/if}
  {#if ui.sheet === 'delete'}<DeleteSheet />{/if}
  {#if ui.sheet === 'setup'}<Lazy load={parts.setup} />{/if}
  {#if ui.sheet === 'savedesign'}<Lazy load={parts.savedesign} />{/if}
  {#if ui.sheet === 'fitdesign'}<Lazy load={parts.fitdesign} />{/if}
  {#if ui.sheet === 'item' && store.project?.manifest.items.some((i) => i.id === ui.selected)}
    <Sheet title="Item" cancel="Done" onclose={() => (ui.sheet = null)}><Lazy load={parts.item} id={ui.selected} /></Sheet>
  {/if}
</div>
