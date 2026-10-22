<script lang="ts">
  // Export (M5): one engine at a time; the zip is built when the sheet opens so the button can name its size.
  import Sheet from './Sheet.svelte'
  import { exportZip } from '../lib/export/export.ts'
  import { coverageGaps, moveDirs, storeVariants } from '../lib/dress/dress.ts'
  import * as db from '../lib/store/db.ts'
  import type { StoredProject } from '../lib/store/project.ts'
  import type { Engine, Manifest, Preset } from '../lib/store/manifest.ts'
  import { ui, doc, store, toast, isDemo } from './state.svelte.ts'
  import { ChevronRight, Download, TriangleAlert } from './icons.ts'

  const ENGINES: { id: Engine; name: string; sub: string }[] = [
    { id: 'godot', name: 'Godot', sub: '4.x scenes' },
    { id: 'unity', name: 'Unity', sub: '6 importer' },
    { id: 'phaser', name: 'Phaser', sub: '3 / 4 atlases' },
    { id: 'generic', name: 'PNG + JSON', sub: 'any engine' },
    { id: 'aseprite', name: 'Aseprite', sub: '.aseprite layers' },
  ]
  const LS = 'pixeldoll.export.engine'
  let engine = $state<Engine>((() => { try { return (localStorage.getItem(LS) as Engine) || 'godot' } catch { return 'godot' } })())
  let baked = $state(true)
  let result = $state.raw<{ zip: Uint8Array | null; files: string[]; warnings: string[]; errors: string[] } | null>(null)
  let busy = $state(false)
  const m = $derived(store.project?.manifest)
  const items = $derived(m ? m.items.filter((i) => i.slot !== 'body') : [])
  const nice = (id: string) => id[0].toUpperCase() + id.slice(1).replace(/-/g, ' ')
  // B10 (T1 P1-1): views a move or an item doesn't have are empty in the sheets; say so before the download
  const gaps = $derived.by(() => {
    if (!m) return []
    const out: string[] = []
    for (const a of m.rig.animations) { const d = moveDirs(m, a.id); if (d.length < m.rig.directions.length) out.push(`${nice(a.id)} has ${d.join(' and ')} only`) }
    for (const it of items) { const g = coverageGaps(m, it); if (g.length) out.push(`${it.name} has no ${g.map((x) => x.replace('-', ' ').replace('/', ' ')).join(', ')} frames`) }
    return out
  })

  $effect(() => {
    const e = engine, b = baked, p = store.project
    const projectId = doc.id, demo = isDemo()
    if (!p) return
    try { localStorage.setItem(LS, e) } catch { /* ignore */ }
    busy = true
    result = null
    const presets: Preset[] = [{ id: 'current', name: 'Current look', items: $state.snapshot(doc.items), variants: $state.snapshot(doc.variants) }, ...p.manifest.presets.filter((x) => x.id !== 'current')]
    const manifest = structuredClone({ ...p.manifest, presets }) as Manifest
    storeVariants(manifest, ...presets.map((x) => x.variants))
    let stale = false
    void (async () => {
      const rec = demo ? undefined : await db.get<StoredProject>('projects', projectId)
      return exportZip({ manifest, images: p.images }, { engines: [e], baked: b, projectData: rec ? { character: rec.character, skeletons: rec.skeletons, rigQa: rec.rigQa } : undefined })
    })().then((r) => {
      if (stale) return
      result = { zip: r.zip, files: r.entries.map((x) => x.name), warnings: r.warnings, errors: r.errors }
      busy = false
    }).catch(() => {
      if (stale) return
      result = { zip: null, files: [], warnings: [], errors: ['Could not prepare this export. Please try again.'] }
      busy = false
    })
    return () => { stale = true }
  })
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`
  const kb = $derived(result?.zip ? Math.max(1, Math.round(result.zip.length / 1024)) : 0)
  function download() {
    if (!result?.zip || !m) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([result.zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
    a.download = `${(store.projects.find((p) => p.id === doc.id)?.name ?? m.name).replace(/\s*\(demo\)/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${engine}.pixeldoll.zip`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    toast(`Downloaded ${a.download}`) // T1 P3: confirm, and get out of the way
    ui.sheet = null
  }
</script>

<Sheet title="Export" onclose={() => (ui.sheet = null)}>
  <div class="field">
    <span class="label" id="eng">For which engine?</span>
    <div class="engines" role="radiogroup" aria-labelledby="eng">
      {#each ENGINES as e (e.id)}
        <button class="engine" role="radio" aria-checked={engine === e.id} onclick={() => (engine = e.id)}>
          <span class="radio" aria-hidden="true"></span>
          <span class="engine-name">{e.name}</span><span class="engine-sub">{e.sub}</span>
        </button>
      {/each}
    </div>
  </div>
  {#if m}
    <p class="muted">Includes {n(m.rig.directions.length, 'direction')} · {n(m.rig.animations.length, 'move')} · {n(items.length, 'item')} · {m.presets.filter((x) => x.id !== 'current').length ? `${n(m.presets.filter((x) => x.id !== 'current').length, 'outfit')} + your current look` : 'your current look'}, each item on its own layer sheet.</p>
    {#if gaps.length}<p class="notice small"><TriangleAlert size={14} /><span>{gaps.join(' · ')}. Those frames stay empty in the sheets; manifest.json lists the directions of each move.</span></p>{/if}
  {/if}
  {#if result?.errors.length}
    {#each result.errors as e (e)}<p class="notice bad small"><TriangleAlert size={14} />{e}</p>{/each}
  {/if}
  {#each result?.warnings ?? [] as w (w)}<p class="notice warn small"><TriangleAlert size={14} />{w}</p>{/each}
  <details class="disclosure">
    <summary><ChevronRight size={14} />Details</summary>
    <div>
      <label class="check"><input type="checkbox" bind:checked={baked} />Also export finished characters (one sheet per outfit)</label>
      {#if result}<p class="faint small">{result.files.length} files:</p><pre class="mono faint" style="max-height:160px;overflow:auto;margin:0">{result.files.join('\n')}</pre>{/if}
    </div>
  </details>
  {#snippet footer()}
    <span class="foot-note">Free · includes an editable copy</span>
    <button class="btn primary lg" onclick={download} disabled={busy || !result?.zip}><Download size={16} />{busy ? 'Preparing…' : `Download zip · ${kb} KB`}</button>
  {/snippet}
</Sheet>

<style>
  @media (min-width: 600px) { .engines { grid-template-columns: repeat(5, 1fr); } } /* B11: 5 targets in one row */
</style>
