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

  type Target = { id: Engine; name: string; sub: string; detail: string }
  // Product order for this layered 2D workflow; asset formats are useful across engines.
  const GROUPS: { id: string; name: string; targets: Target[] }[] = [
    { id: 'engines', name: 'Engines and frameworks', targets: [
      { id: 'godot', name: 'Godot', sub: 'Scene + runtime', detail: 'Godot 4 scene and animation resources with synchronized equipment and outfit controls.' },
      { id: 'unity', name: 'Unity', sub: 'Prefab importer', detail: 'Unity Editor importer creates a layered prefab and animation assets. Requires the 2D Sprite package.' },
      { id: 'phaser', name: 'Phaser', sub: 'Atlas + runtime', detail: 'Phaser 3 / 4 atlases and a Container runtime for equipment, colours and synchronized playback.' },
      { id: 'gdevelop', name: 'GDevelop', sub: 'Editable project', detail: 'Editable GDevelop project with Sprite layers, synchronized playback and equipment controls. Preview it or copy the objects and event into your game.' },
    ] },
    { id: 'assets', name: 'Assets', targets: [
      { id: 'aseprite', name: 'Aseprite', sub: 'Editable layers', detail: 'One layered .aseprite animation with tags, timing, pivot and your current look. Open in Aseprite 1.3 or later.' },
      { id: 'generic', name: 'PNG + JSON', sub: 'Custom integration', detail: 'Layer sheets and strips with timing, pivots, equipment and palette data. Your engine needs code to read these rules.' },
    ] },
  ]
  const ENGINES = GROUPS.flatMap((group) => group.targets)
  const LS = 'pixeldoll.export.engine'
  let engine = $state<Engine>((() => { try { return ENGINES.find((e) => e.id === localStorage.getItem(LS))?.id ?? 'godot' } catch { return 'godot' } })())
  const selected = $derived(ENGINES.find((target) => target.id === engine)!)
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
  <fieldset class="export-picker" aria-label="Export format">
    {#each GROUPS as group (group.id)}
      <section aria-labelledby={`export-${group.id}`}>
        <h3 class="label" id={`export-${group.id}`}>{group.name}</h3>
        <div class="export-targets">
          {#each group.targets as e (e.id)}
            <label class="export-target" title={e.detail}>
              <span class="target-icon" aria-hidden="true" style:mask-image={`url("${import.meta.env.BASE_URL}icons/exports/${e.id}.svg")`}></span>
              <span class="target-label"><span class="engine-name">{e.name}</span><span class="engine-sub">{e.sub}</span></span>
              <input type="radio" name="export-format" value={e.id} bind:group={engine} aria-label={e.name} aria-describedby={engine === e.id ? 'export-description' : undefined} />
            </label>
          {/each}
        </div>
      </section>
    {/each}
  </fieldset>
  <p class="export-description muted small" id="export-description" aria-live="polite"><strong>{selected.name}:</strong> {selected.detail}</p>
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
  .export-picker { border:0; padding:0; margin:0; min-width:0; display:flex; flex-direction:column; gap:16px; }
  .export-picker h3 { margin:0 0 8px; }
  .export-targets { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px; }
  .export-target { display:grid; grid-template-columns:28px minmax(0, 1fr) 16px; align-items:center; gap:10px; padding:12px; min-height:68px; border:1px solid var(--line-strong); border-radius:var(--r-card); background:var(--bg); cursor:pointer; }
  .export-target:has(input:checked) { border-color:var(--accent); box-shadow:inset 0 0 0 1px var(--accent); background:var(--accent-soft); }
  .export-target:focus-within { outline:2px solid var(--accent); outline-offset:2px; }
  .export-target input { margin:0; width:16px; height:16px; accent-color:var(--accent); }
  .target-icon { display:block; width:28px; height:28px; background:currentColor; mask-size:contain; mask-position:center; mask-repeat:no-repeat; color:var(--text-2); }
  .target-label { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .engine-name { font-weight:600; }
  .engine-sub { font-size:var(--fs-sm); color:var(--text-2); }
  .engine-name, .engine-sub { overflow-wrap:anywhere; }
  .export-description { margin:0; min-height:3em; }
  @media (max-width:420px) {
    .export-target { grid-template-columns:24px minmax(0, 1fr) 16px; gap:8px; padding:10px; }
    .target-icon { width:24px; height:24px; }
  }
  @media (max-width:359px) { .export-targets { grid-template-columns:1fr; } }
</style>
