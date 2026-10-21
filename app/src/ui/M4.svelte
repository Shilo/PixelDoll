<script lang="ts">
  import { cellImg, composeCell, drawList, equipped, hiddenSlots } from '../lib/compose/compose.ts'
  import { exportZip } from '../lib/export/export.ts'
  import { colourCounts, toHex } from '../lib/dress/palette.ts'
  import { SWATCHES, coverageGaps, deriveMaterials, edges, randomOutfit, recolour, storeVariants, variantOf, variantRampOf } from '../lib/dress/dress.ts'
  import { listSources, openSource, saveDress } from '../lib/dress/project.ts'
  import type { DirectionName, Manifest, Material, Preset, ZOverride } from '../lib/store/manifest.ts'
  import type { Img } from '../lib/image/png.ts'

  let sources = $state<{ id: string; label: string }[]>([])
  const SRC_KEY = 'pixeldoll.m4.source'
  const firstSource = (() => { try { return localStorage.getItem(SRC_KEY) || 'fixture:s2' } catch { return 'fixture:s2' } })()
  let source = $state(firstSource)
  let manifest = $state<Manifest | null>(null) // deep state: edits (labels, links, z, hides, presets) re-render
  let images = $state.raw(new Map<string, Img>())
  let error = $state('')
  let saved = $state('')
  let items = $state<Preset['items']>({})
  let variants = $state<Preset['variants']>({})
  let anim = $state('walk')
  let dir = $state<DirectionName>('south')
  let frame = $state(0)
  let playing = $state(true)
  let zoom = $state(6)
  let outlines = $state(false)
  let tint = $state(false)
  let presetName = $state('')
  let zScope = $state<'all' | 'dir' | 'dir+anim' | 'cell'>('dir')

  const m = $derived(manifest)
  const project = $derived(manifest ? { manifest, images } : null)
  const rigAnim = $derived(m?.rig.animations.find((a) => a.id === anim))
  const cell = $derived(rigAnim ? rigAnim.frames[frame % rigAnim.frames.length].cell : 0)
  const view = $derived.by(() => {
    if (!manifest) return null
    // plain snapshot: recolour/compose over the deep-state proxy took seconds (one tracked read per cell hash)
    const t0 = performance.now(), snap = $state.snapshot(manifest) as Manifest, v = $state.snapshot(variants), t = performance.now()
    const p = recolour({ manifest: snap, images }, v)
    return { p, ms: performance.now() - t, snapMs: t - t0 }
  })
  const on = $derived(m ? equipped(m, items) : [])
  const hidden = $derived(m ? hiddenSlots(m, on) : new Set<string>())
  const order = $derived(m ? drawList(m, items, anim, dir, cell) : [])
  const big = $derived(view && rigAnim ? composeCell(view.p, items, anim, dir, cell) : null)
  const visibleMats = $derived(m ? m.materials.filter((x) => on.some((it) => it.id === x.owner)) : [])
  const slotHue = (id: string) => `hsl(${((m?.slots.findIndex((s) => s.id === id) ?? 0) * 67) % 360} 90% 50%)`

  async function refreshSources() { sources = await listSources().catch(() => []) }
  async function open(id: string) {
    error = ''
    manifest = null
    try {
      const r = await openSource(id)
      try { localStorage.setItem(SRC_KEY, id) } catch {}
      deriveMaterials(r.project) // only items that have none yet (new M3 items, fresh fixtures)
      const mm = r.project.manifest
      const pr = r.current ?? mm.presets[0] ?? { items: {}, variants: {} }
      items = { ...pr.items }
      variants = { ...pr.variants }
      tint = Object.values(variants).some((v) => v.startsWith('tint:'))
      anim = mm.rig.animations.some((a) => a.id === anim) ? anim : mm.rig.animations[0].id
      if (!mm.rig.directions.some((d) => d.id === dir)) dir = mm.rig.directions[0].id
      frame = 0
      images = r.project.images
      savedKey = null
      manifest = mm
    } catch (e) { error = (e as Error).message }
  }
  void refreshSources()
  void open(firstSource)

  // one clock for every view (same rule as the engine runtimes)
  $effect(() => {
    if (!rigAnim || !playing) return
    const t = setTimeout(() => (frame = (frame + 1) % rigAnim.frames.length), rigAnim.frames[frame % rigAnim.frames.length].ms)
    return () => clearTimeout(t)
  })

  let savedKey: string | null = null // non-reactive; null right after open
  // autosave: outfit, materials, presets, overrides, hides (debounced)
  $effect(() => {
    const key = JSON.stringify([manifest?.materials, manifest?.presets, manifest?.slots, manifest?.items.map((i) => i.hides), items, variants])
    if (!manifest || key === savedKey) return
    if (savedKey === null) { savedKey = key; return } // just opened: nothing to save yet
    savedKey = key
    const t = setTimeout(async () => {
      storeVariants(manifest!, $state.snapshot(variants)) // adds missing ramps only, so this does not re-trigger forever
      try { await saveDress(source, $state.snapshot(manifest!) as Manifest, $state.snapshot({ items, variants })); saved = `saved ${new Date().toLocaleTimeString()}` } catch (e) { error = (e as Error).message }
    }, 400)
    void key
    return () => clearTimeout(t)
  })

  const paint = (im: { w: number; h: number; data: Uint8ClampedArray } | null) => (canvas: HTMLCanvasElement) => {
    if (im) canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(im.data), im.w, im.h), 0, 0)
  }
  const small = (d: DirectionName) => (canvas: HTMLCanvasElement) => {
    if (view && rigAnim) paint(composeCell(view.p, items, anim, d, cell))(canvas)
  }
  // debug: each drawn layer's edge pixels in its slot colour
  const outline = (canvas: HTMLCanvasElement) => {
    const g = canvas.getContext('2d')!
    g.clearRect(0, 0, canvas.width, canvas.height)
    if (!outlines || !view) return
    for (const d of order) {
      const im = cellImg(view.p, d.layer, anim, dir, cell)
      if (!im) continue
      g.fillStyle = slotHue(d.slot.id)
      for (const p of edges(im)) {
        const x = (p % im.w) * zoom, y = Math.floor(p / im.w) * zoom, t = Math.max(1, zoom >> 2)
        g.fillRect(x, y, zoom, t); g.fillRect(x, y + zoom - t, zoom, t); g.fillRect(x, y, t, zoom); g.fillRect(x + zoom - t, y, t, zoom)
      }
    }
  }

  // ---- colour ----
  const vname = (name: string) => (tint ? `tint:${name}` : name)
  function pick(mat: Material, name: string | null) {
    if (name == null) delete variants[mat.id]
    else variants[mat.id] = vname(name)
  }
  function setTint(v: boolean) {
    tint = v
    for (const [k, n] of Object.entries(variants)) variants[k] = v ? (n.startsWith('tint:') ? n : `tint:${n}`) : n.replace(/^tint:/, '')
  }
  function link(mat: Material, to: string) {
    if (to) mat.linkTo = to
    else delete mat.linkTo
  }
  function rederive(itemId: string, k: number) {
    const it = m!.items.find((i) => i.id === itemId)!
    const old = new Set(it.materials)
    deriveMaterials(project!, [it], { [itemId]: k })
    for (const id of old) if (!it.materials.includes(id)) delete variants[id]
    for (const x of m!.materials) if (x.linkTo && !m!.materials.some((y) => y.id === x.linkTo)) delete x.linkTo
  }
  const rampOf = (mat: Material) => { const n = variantOf(m!, variants, mat.id); return (n && variantRampOf(mat, n)) || mat.ramp }
  const uniq = (im: typeof big) => (im ? colourCounts([im]).size : 0)

  // ---- outfit ----
  function cycle(slot: string, step: number) {
    const opts = [null, ...m!.items.filter((i) => i.slot === slot).map((i) => i.id)]
    items[slot] = opts[(opts.indexOf(items[slot] ?? null) + step + opts.length) % opts.length]
  }
  function randomize() {
    const r = randomOutfit(m!)
    items = r.items
    variants = Object.fromEntries(Object.entries(r.variants).map(([k, v]) => [k, vname(v)]))
  }
  function toggleHide(itemId: string, slot: string) {
    const it = m!.items.find((i) => i.id === itemId)!
    const cur = it.hides ?? m!.slots.find((s) => s.id === it.slot)?.hides ?? []
    it.hides = cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot]
  }
  function savePreset() {
    const name = presetName.trim() || `Outfit ${m!.presets.length + 1}`
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'outfit'
    const pr: Preset = { id, name, items: $state.snapshot(items), variants: $state.snapshot(variants) }
    const i = m!.presets.findIndex((p) => p.id === id)
    if (i >= 0) m!.presets[i] = pr
    else m!.presets.push(pr)
    presetName = ''
  }
  function loadPreset(p: Preset) { items = { ...p.items }; variants = { ...p.variants } }
  function deletePreset(id: string) { m!.presets = m!.presets.filter((p) => p.id !== id) }

  // ---- z overrides (sparse, on the slot) ----
  function setZ(slotId: string, role: 'fg' | 'bg', z: number) {
    const s = m!.slots.find((x) => x.id === slotId)!
    const o: ZOverride = { layer: role, z, ...(zScope !== 'all' ? { dir } : {}), ...(zScope === 'dir+anim' || zScope === 'cell' ? { anim } : {}), ...(zScope === 'cell' ? { cell } : {}) }
    const same = (x: ZOverride) => x.layer === o.layer && x.dir === o.dir && x.anim === o.anim && x.cell === o.cell
    s.zOverrides = [...(s.zOverrides ?? []).filter((x) => !same(x)), o]
  }
  function dropZ(slotId: string, i: number) {
    const s = m!.slots.find((x) => x.id === slotId)!
    s.zOverrides = s.zOverrides!.filter((_, j) => j !== i)
  }
  const ovText = (o: ZOverride) => `${o.layer} z ${o.z}${o.dir ? ` · ${o.dir}` : ''}${o.anim ? ` · ${o.anim}` : ''}${o.cell != null ? ` · cell ${o.cell}` : ''}`

  // ---- export (layer sheets keep source ramps; materials + preset variants go in the manifest; baked sheets are recoloured) ----
  let exporting = $state('')
  async function doExport() {
    const presets = [{ id: 'current', name: 'Current outfit', items: $state.snapshot(items), variants: $state.snapshot(variants) }, ...m!.presets.filter((p) => p.id !== 'current')]
    storeVariants(m!, ...presets.map((p) => p.variants))
    exporting = 'exporting…'
    const r = await exportZip({ manifest: { ...($state.snapshot(manifest!) as Manifest), presets }, images }, { engines: ['generic', 'godot', 'phaser', 'unity'], baked: true })
    if (!r.zip) { exporting = r.errors.join('; '); return }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([r.zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
    a.download = `${m!.name}.pixeldoll.zip`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    exporting = `${r.entries.length} files, ${(r.zip.length / 1024).toFixed(0)} KiB${r.warnings.length ? ` · ${r.warnings.join('; ')}` : ''}`
  }
</script>

<h1>M4 · dress-up</h1>

<section class="row">
  <label>Project
    <select bind:value={source} onchange={() => open(source)} onfocus={refreshSources} data-testid="source">
      {#each sources as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
    </select>
  </label>
  <button onclick={randomize} disabled={!m} data-testid="randomize">🎲 randomize</button>
  <label><input type="checkbox" bind:checked={outlines} /> layer outlines</label>
  <label><input type="checkbox" checked={tint} onchange={(e) => setTint(e.currentTarget.checked)} data-testid="tint" /> grayscale × tint (compare)</label>
  <span class="muted">{saved}</span>
</section>
{#if error}<p class="err">{error}</p>{/if}

{#if m && view && rigAnim}
  <div class="layout">
    <section class="panel">
      <h2>Slots</h2>
      {#each m.slots.filter((s) => s.id !== 'body') as s (s.id)}
        {@const it = m.items.find((i) => i.id === items[s.id])}
        <div class="slot" data-testid="slot-{s.id}">
          <span class="dot" style:background={slotHue(s.id)}></span>
          <b>{s.id}</b>
          <button class="tiny" onclick={() => cycle(s.id, -1)}>‹</button>
          <select bind:value={items[s.id]}>
            <option value={null}>none</option>
            {#each m.items.filter((i) => i.slot === s.id) as opt (opt.id)}<option value={opt.id}>{opt.name}</option>{/each}
          </select>
          <button class="tiny" onclick={() => cycle(s.id, 1)}>›</button>
          {#if it}
            {#if hidden.has(s.id)}<span class="badge warn">hidden</span>{/if}
            {#if it.baseHash !== m.rig.baseHash}<span class="badge err">stale</span>{/if}
            {#if coverageGaps(m, it).length}<span class="badge" title={coverageGaps(m, it).join(', ')}>no cells: {coverageGaps(m, it).join(', ')}</span>{/if}
            <div class="sub">
              hides:
              {#each m.slots.filter((x) => x.id !== 'body' && x.id !== s.id) as x (x.id)}
                <label class="chk"><input type="checkbox" checked={(it.hides ?? s.hides ?? []).includes(x.id)} onchange={() => toggleHide(it.id, x.id)} />{x.id}</label>
              {/each}
            </div>
          {/if}
        </div>
      {/each}

      <h2>Outfit presets</h2>
      {#each m.presets as p (p.id)}
        <div class="row tight"><button onclick={() => loadPreset(p)}>{p.name}</button><button class="tiny" onclick={() => deletePreset(p.id)} title="delete">✕</button></div>
      {/each}
      <div class="row tight">
        <input placeholder="preset name" bind:value={presetName} size="12" />
        <button onclick={savePreset} data-testid="save-preset">save current</button>
      </div>
      <div class="row tight">
        <button onclick={doExport} data-testid="export">export zip</button>
        <span class="muted">{exporting}</span>
      </div>
    </section>

    <section class="panel preview">
      <div class="row tight">
        {#each m.rig.directions as d (d.id)}<button class:on={dir === d.id} onclick={() => (dir = d.id)}>{d.id}</button>{/each}
        <select bind:value={anim} onchange={() => (frame = 0)}>
          {#each m.rig.animations as a (a.id)}<option value={a.id}>{a.id}</option>{/each}
        </select>
        <button onclick={() => (playing = !playing)}>{playing ? 'pause' : 'play'}</button>
        <button disabled={playing} onclick={() => (frame = (frame + 1) % rigAnim.frames.length)}>step</button>
        <label>zoom <input type="range" min="1" max="10" bind:value={zoom} /> {zoom}×</label>
      </div>
      <div class="stage" style:width="{m.rig.cell.w * zoom}px" style:height="{m.rig.cell.h * zoom}px">
        <canvas class="px" width={m.rig.cell.w} height={m.rig.cell.h} style:width="{m.rig.cell.w * zoom}px" {@attach paint(big)} data-testid="big"></canvas>
        <canvas class="ov" width={m.rig.cell.w * zoom} height={m.rig.cell.h * zoom} {@attach outline}></canvas>
      </div>
      <p class="muted" data-testid="stats">frame {frame % rigAnim.frames.length} · cell {cell} · {uniq(big)} colours · recolour {view.ms.toFixed(1)} ms (snapshot {view.snapMs.toFixed(1)} ms)</p>
      <div class="dirs">
        {#each m.rig.directions as d (d.id)}
          <figure class:on={dir === d.id}>
            <canvas class="px" width={m.rig.cell.w} height={m.rig.cell.h} style:width="{m.rig.cell.w * 2}px" {@attach small(d.id)} onclick={() => (dir = d.id)}></canvas>
            <figcaption>{d.id}{d.mirrorOf ? ' ⇋' : ''}</figcaption>
          </figure>
        {/each}
      </div>

      <h2>Draw order <span class="muted">({anim}/{dir}/cell {cell})</span></h2>
      <div class="row tight">
        new override applies to
        <select bind:value={zScope}>
          <option value="all">all cells</option><option value="dir">{dir}</option><option value="dir+anim">{dir} + {anim}</option><option value="cell">this cell</option>
        </select>
      </div>
      <table class="z">
        <tbody>
          {#each [...order].reverse() as d (d.item.id + d.layer.id)}
            <tr>
              <td><span class="dot" style:background={slotHue(d.slot.id)}></span>{d.slot.id}.{d.layer.role}</td>
              <td>{d.item.name}</td>
              <td><input type="number" value={d.z} onchange={(e) => setZ(d.slot.id, d.layer.role, +e.currentTarget.value)} style="width:4.5em" data-testid="z-{d.slot.id}-{d.layer.role}" /></td>
              <td class="muted">{d.z !== d.layer.z ? `override (base ${d.layer.z})` : ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#each m.slots.filter((s) => s.zOverrides?.length) as s (s.id)}
        {#each s.zOverrides! as o, i (i)}
          <div class="row tight"><span>{s.id}: {ovText(o)}</span><button class="tiny" onclick={() => dropZ(s.id, i)}>✕</button></div>
        {/each}
      {/each}
    </section>

    <section class="panel">
      <h2>Colours</h2>
      {#each on as it (it.id)}
        <div class="item">
          <b>{it.name}</b>
          <label class="muted">materials
            <select onchange={(e) => rederive(it.id, +e.currentTarget.value)}>
              <option value="0">auto ({it.materials.length})</option>{#each [1, 2, 3, 4] as k}<option value={k}>{k}</option>{/each}
            </select>
          </label>
          {#each visibleMats.filter((x) => x.owner === it.id) as mat (mat.id)}
            <div class="mat" data-testid="mat-{mat.id}">
              <input class="label" bind:value={mat.label} />
              <span class="ramp">{#each mat.ramp as c, i (i)}<i style:background={c}></i>{/each}</span>→
              <span class="ramp">{#each rampOf(mat) as c, i (i)}<i style:background={c}></i>{/each}</span>
              {#if mat.linkTo}
                <span class="muted">follows {m.materials.find((x) => x.id === mat.linkTo)?.label}</span>
              {:else}
                <div class="sw">
                  <button class="swatch src" title="source" onclick={() => pick(mat, null)}>✕</button>
                  {#each Object.entries(SWATCHES) as [name, hex] (name)}
                    <button class="swatch" class:on={variants[mat.id]?.replace(/^tint:/, '') === name} title={name} style:background={hex} onclick={() => pick(mat, name)}></button>
                  {/each}
                  <input type="color" value={variants[mat.id]?.replace(/^tint:/, '').startsWith('#') ? variants[mat.id].replace(/^tint:/, '') : toHex(0x808080)} oninput={(e) => pick(mat, e.currentTarget.value)} />
                </div>
              {/if}
              <label class="muted">link to
                <select value={mat.linkTo ?? ''} onchange={(e) => link(mat, e.currentTarget.value)}>
                  <option value="">—</option>
                  {#each m.materials.filter((x) => x.id !== mat.id) as x (x.id)}<option value={x.id}>{x.label}</option>{/each}
                </select>
              </label>
            </div>
          {/each}
        </div>
      {/each}
    </section>
  </div>
{:else if !error}
  <p>Loading…</p>
{/if}

<style>
  .row { display: flex; flex-wrap: wrap; gap: 0.5rem 0.75rem; align-items: center; margin: 0.5rem 0; }
  .tight { margin: 0.25rem 0; gap: 0.35rem; }
  .layout { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; align-items: start; }
  .preview { grid-column: span 2; min-width: 0; }
  @media (max-width: 700px) { .preview { grid-column: auto; } }
  .panel { min-width: 0; }
  .slot { padding: 0.3rem 0; border-bottom: 1px solid #8884; }
  .sub { font-size: 0.8rem; margin-top: 0.2rem; }
  .chk { margin-right: 0.4rem; white-space: nowrap; }
  .dot { display: inline-block; width: 0.7em; height: 0.7em; border-radius: 50%; margin-right: 0.3em; }
  .badge { font-size: 0.75rem; padding: 0 0.3em; border: 1px solid #8888; border-radius: 3px; }
  .warn { color: #b80; }
  .err { color: #c33; }
  .muted { opacity: 0.7; font-size: 0.85rem; }
  .tiny { padding: 0 0.4em; }
  button.on, figure.on figcaption { font-weight: bold; outline: 2px solid #48f; }
  .stage { position: relative; max-width: 100%; overflow: auto; }
  .px { image-rendering: pixelated; background: repeating-conic-gradient(#ccc 0 25%, #eee 0 50%) 0 0 / 16px 16px; display: block; }
  .ov { position: absolute; inset: 0; pointer-events: none; }
  .dirs { display: flex; flex-wrap: wrap; gap: 0.75rem; }
  figure { margin: 0; text-align: center; cursor: pointer; }
  .z td { padding: 0.1rem 0.4rem; }
  .item { margin-bottom: 0.75rem; }
  .mat { margin: 0.3rem 0 0.5rem 0.5rem; }
  .label { width: 11em; }
  .ramp { display: inline-flex; vertical-align: middle; }
  .ramp i { width: 12px; height: 16px; display: inline-block; }
  .sw { display: flex; flex-wrap: wrap; gap: 2px; align-items: center; margin: 0.2rem 0; }
  .swatch { width: 20px; height: 20px; padding: 0; border: 1px solid #0006; }
  .swatch.on { outline: 2px solid #48f; }
  .swatch.src { font-size: 0.7rem; line-height: 1; }
</style>
