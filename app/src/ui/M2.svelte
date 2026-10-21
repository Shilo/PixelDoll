<script lang="ts">
  import { queue, type JobRec } from '../lib/pixellab/queue.ts'
  import { routes, png as b64png } from '../lib/pixellab/routes.ts'
  import { app } from '../lib/app.svelte.ts'
  import { decodePng, makeImg, bytesToBase64, type Img } from '../lib/image/png.ts'
  import { encodePngBytes } from '../lib/image/pngraw.ts' // pure encoder: canvas convertToBlob crawls when the tab is throttled
  import * as db from '../lib/store/db.ts'
  import { zip, type ZipEntry } from '../lib/store/zip.ts'
  import type { Manifest, Provenance, CellKey } from '../lib/store/manifest.ts'
  import { ANCHORS, DIRECTIONS, baseHashOf, cellHash, cellKey, cellKeys, validateRig, type DirectionName, type RigAnimation, type Sha256 } from '../lib/rig/rig.ts'
  import { opaqueBox } from '../lib/rig/normalize.ts'
  import type { DirMode } from '../lib/rig/mirror.ts'
  import { parseSkeleton, type Skeleton } from '../lib/rig/skeleton.ts'
  import { buildRig, anchorTracks, skeletonOf, type Built, type Cell, type SourceAnim, type TrackStat } from '../lib/rig/freeze.ts'

  // IndexedDB 'projects' record written by "Freeze rig". Cells live in 'blobs' keyed by the RGBA sha256 hex.
  interface StoredRig {
    id: string
    savedAt: string
    manifest: Manifest
    skeletons: Record<string, Skeleton> // cell key -> keypoints (mirrored cells flipped)
    rigQa: { warnings: string[]; pivotFrom: string; tracks: Omit<TrackStat, 'points'>[] }
  }

  let sources = $state.raw<SourceAnim[]>([])
  let provenance = $state.raw<Provenance[]>([])
  let sourceLabel = $state('')
  let mode = $state<DirMode>('4')
  let size = $state(64)
  let built = $state.raw<Built | null>(null)
  let skel = $state.raw<Record<string, Skeleton>>({}) // cell hash -> skeleton
  let ov = $state({ pivot: true, skel: false, anchors: true, bbox: false })
  let scale = $state(3)
  let msg = $state('')
  let busy = $state('')
  let name = $state('base')
  let opened = $state<{ id: string; verified: boolean; stored: string } | null>(null)
  let stored = $state.raw<StoredRig[]>([])
  let sheetAnim = $state('walk'), sheetDirs = $state('south,east,north'), sheetCell = $state(64)

  // every button action: errors land in msg, busy always clears
  async function safe(fn: () => Promise<unknown>) {
    try { await fn() } catch (e) { msg = `error: ${(e as Error).message}` } finally { busy = '' }
  }

  // ---- sources ----
  let characters = $derived(
    $queue.jobs.filter((r) => r.tag === 'm1-base' && r.state === 'done').map((r) => (r.response as { character_id?: string })?.character_id).filter((x): x is string => !!x),
  )
  let charId = $state('')
  $effect(() => { if (!charId && characters.length) charId = characters.at(-1)! })

  const byIdle = (a: SourceAnim, b: SourceAnim) => +(a.id !== 'idle') - +(b.id !== 'idle') || a.id.localeCompare(b.id)
  const iso = (t?: number) => new Date(t ?? Date.now()).toISOString()

  async function loadM1(id: string) {
    busy = 'loading M1 frames'
    const recs = $queue.jobs.filter((r) => r.tag === 'm1-anim' && r.state === 'done' && (r.params as { character_id?: string }).character_id === id)
    const latest = new Map<string, JobRec>()
    for (const r of recs) latest.set((r.params as { animation_name?: string }).animation_name ?? r.label, r) // jobs are sorted by createdAt
    const anims: SourceAnim[] = [], prov: Provenance[] = []
    const baseRec = $queue.jobs.find((r) => r.tag === 'm1-base' && (r.response as { character_id?: string })?.character_id === id)
    if (baseRec) prov.push(provOf(baseRec, baseRec.jobs[0]?.id, baseRec.gens, baseRec.usd, []))
    for (const [animId, r] of latest) {
      const p = r.params as { mode?: string; template_animation_id?: string }
      const a: SourceAnim = { id: animId, dirs: {}, source: { endpoint: r.endpoint, mode: p.mode, template_animation_id: p.template_animation_id } }
      for (const s of r.jobs) {
        const produced: CellKey[] = []
        for (const res of s.results) {
          const [dir, i] = res.label.split('/') as [DirectionName, string]
          const blob = await db.getBlob(res.sha)
          if (!blob) continue
          ;(a.dirs[dir] ??= [])[+i] = await decodePng(blob)
          produced.push(cellKey(animId, dir, +i) as CellKey)
        }
        prov.push(provOf(r, s.id, s.usage?.generations ?? 0, s.usage?.usd ?? 0, produced))
      }
      anims.push(a)
    }
    provenance = prov
    setSources(anims, `M1 character ${id.slice(0, 8)}: ${anims.map((a) => `${a.id} (${Object.keys(a.dirs).join(', ')})`).join(' · ')}`)
  }
  function provOf(r: JobRec, jobId: string | undefined, gens: number, usd: number, produced: CellKey[]): Provenance {
    const params = r.params as Record<string, unknown>
    return { endpoint: r.endpoint, params, seed: (params.seed as number) ?? 0, requestHash: `sha256:${r.requestHash}`, jobId, usage: { generations: gens, usd }, createdAt: iso(r.submittedAt), produced }
  }

  const NAME = /^(.+?)[_-](south-east|south-west|north-east|north-west|south|east|north|west)[_-](\d+)\.png$/i
  async function importFiles(files: File[]) {
    busy = 'importing'
    const map = new Map<string, SourceAnim>()
    const anim = (id: string) => map.get(id) ?? (map.set(id, { id, dirs: {} }), map.get(id)!)
    const skipped: string[] = []
    for (const f of files) {
      if (!/\.png$/i.test(f.name)) { skipped.push(f.name); continue }
      const img = await decodePng(f)
      const m = NAME.exec(f.name)
      if (m) { (anim(m[1].toLowerCase()).dirs[m[2].toLowerCase() as DirectionName] ??= [])[+m[3]] = img; continue }
      // grid sheet: rows = sheetDirs, cols = frames
      const dirs = sheetDirs.split(',').map((d) => d.trim()) as DirectionName[]
      const bad = dirs.find((d) => !DIRECTIONS.includes(d))
      if (bad || img.h !== dirs.length * sheetCell || img.w % sheetCell) { skipped.push(`${f.name} (sheet ${img.w}x${img.h} does not fit ${dirs.length} rows of ${sheetCell}px${bad ? `, bad dir ${bad}` : ''})`); continue }
      const a = anim(sheetAnim.trim().toLowerCase())
      dirs.forEach((d, row) => (a.dirs[d] = Array.from({ length: img.w / sheetCell }, (_, c) => crop(img, c * sheetCell, row * sheetCell, sheetCell))))
    }
    provenance = []
    setSources([...map.values()], `import: ${[...map.values()].map((a) => `${a.id} (${Object.entries(a.dirs).map(([d, f]) => `${d} ${f!.length}`).join(', ')})`).join(' · ')}${skipped.length ? ` · skipped ${skipped.join(', ')}` : ''}`)
  }
  function crop(im: Img, x0: number, y0: number, s: number): Img {
    const o = makeImg(s, s)
    for (let y = 0; y < s; y++) o.data.set(im.data.subarray(((y0 + y) * im.w + x0) * 4, ((y0 + y) * im.w + x0 + s) * 4), y * s * 4)
    return o
  }
  function setSources(a: SourceAnim[], label: string) {
    opened = null
    sources = [...a].sort(byIdle)
    sourceLabel = label
    busy = ''
  }

  // ---- build (re-runs on source / mode / size change) ----
  $effect(() => {
    const [s, m, z] = [sources, mode, size]
    if (!s.length) return
    void buildRig(s, { size: z, mode: m }).then((b) => {
      built = b
      useCachedSkeletons(b)
    })
  })
  let tracks = $derived(built ? anchorTracks(built, skel) : null)
  let generated = $derived(built ? Object.values(built.cells).filter((c) => !c.mirrorOf) : [])
  let missingSkel = $derived([...new Set(generated.filter((c) => !skel[c.hash]).map((c) => c.hash))])
  $effect(() => {
    if (import.meta.env.DEV) (window as unknown as { __m2: unknown }).__m2 = { built, skel, tracks }
  })

  // ---- skeletons via the queue (sync route, ~6 s, 0.1 gen each). Results stay in the ledger, keyed by label. ----
  const skelLabel = (h: string) => `skeleton ${h}`
  const terminal = (r: JobRec) => !['queued', 'submitting', 'running'].includes(r.state)
  function useCachedSkeletons(b: Built) {
    const next = { ...skel }
    for (const c of Object.values(b.cells)) {
      const r = $queue.jobs.find((j) => j.tag === 'm2-skel' && j.state === 'done' && j.label === skelLabel(c.hash))
      if (r && !next[c.hash]) next[c.hash] = parseSkeleton((r.response as { keypoints: never[] }).keypoints, b.rig.cell.w, b.rig.cell.h)
    }
    skel = next
  }
  const settled = (id: string) =>
    new Promise<JobRec>((res) => {
      let done = false
      const un = queue.subscribe((s) => {
        const r = s.jobs.find((j) => j.id === id)
        if (!done && r && terminal(r)) { done = true; res(r); queueMicrotask(() => un()) }
      })
    })
  async function runSkeletons() {
    if (!built) return
    const b = built
    const todo = generated.filter((c, i, all) => !skel[c.hash] && all.findIndex((x) => x.hash === c.hash) === i)
    let ok = 0, failed = 0
    busy = `skeletons: 0/${todo.length}`
    await Promise.all(
      todo.map(async (c) => {
        const bytes = await encodePngBytes(c.img)
        const rec = await settled((await queue.enqueue(routes.estimateSkeleton(b64png(bytesToBase64(bytes))), { label: skelLabel(c.hash), tag: 'm2-skel' })).id)
        const kps = (rec.response as { keypoints?: never[] } | undefined)?.keypoints
        if (rec.state === 'done' && kps) { skel = { ...skel, [c.hash]: parseSkeleton(kps, b.rig.cell.w, b.rig.cell.h) }; ok++ }
        else failed++
        busy = `skeletons: ${ok + failed}/${todo.length}${failed ? ` (${failed} failed)` : ''}`
      }),
    )
    busy = ''
    msg = `skeletons done: ${ok} ok, ${failed} failed`
  }

  // ---- freeze / store / export ----
  async function makeRecord(b: Built): Promise<StoredRig> {
    const rig = { ...b.rig, anchors: tracks?.anchors }
    const cells: Record<string, Partial<Record<DirectionName, Sha256[]>>> = {}
    const skeletons: Record<string, Skeleton> = {}
    for (const k of cellKeys(rig)) {
      const [a, d, i] = k.split('/') as [string, DirectionName, string]
      ;((cells[a] ??= {})[d] ??= [])[+i] = b.cells[k].hash
      const s = skeletonOf(b, k, skel)
      if (s) skeletons[k] = s
    }
    const manifest: Manifest = {
      format: 'pixeldoll/1',
      name,
      app: 'PixelDoll 0.1.0',
      rig,
      materials: [],
      slots: [{ id: 'body', z: 10, class: 'base', required: true }],
      items: [{ id: 'base', name: 'Base body', slot: 'body', status: 'accepted', mirror: 'flip', materials: [], prompt: '', baseHash: rig.baseHash, layers: [{ id: 'main', role: 'fg', z: 10, cells }], provenance }],
      presets: [{ id: 'default', name: 'Base', items: { body: 'base' }, variants: {} }],
    }
    return {
      id: `rig-${rig.baseHash.slice(7, 19)}`,
      savedAt: iso(),
      manifest,
      skeletons,
      rigQa: { warnings: b.warnings, pivotFrom: b.pivotFrom, tracks: (tracks?.stats ?? []).map(({ points: _, ...t }) => t) },
    }
  }
  async function freeze() {
    if (!built || built.errors.length) return
    busy = 'freezing'
    const rec = await makeRecord(built)
    const errs = validateRig(rec.manifest.rig, Object.fromEntries(Object.entries(built.cells).map(([k, c]) => [k, c.hash])))
    if (errs.length) { msg = `not frozen: ${errs.join('; ')}`; busy = ''; return }
    for (const c of Object.values(built.cells)) {
      const blob = new Blob([(await encodePngBytes(c.img)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
      if ((await cellHash(await decodePng(blob))) !== c.hash) { msg = `PNG round trip changed a cell (${c.hash})`; busy = ''; return }
      await db.put('blobs', c.hash.slice(7), blob)
    }
    await db.put('projects', rec.id, $state.snapshot(rec))
    db.askPersist()
    msg = `frozen as ${rec.id} · ${rec.manifest.rig.baseHash}`
    busy = ''
    await refreshStored()
  }
  async function refreshStored() {
    stored = (await db.all<StoredRig>('projects')).filter((p) => p?.manifest?.format === 'pixeldoll/1' && p.id?.startsWith('rig-'))
  }
  void refreshStored()

  async function openStored(p: StoredRig) {
    busy = `opening ${p.id}`
    const rig = p.manifest.rig
    const layer = p.manifest.items.find((i) => i.slot === 'body')!.layers[0].cells!
    const cells: Record<string, Cell> = {}
    let bad = 0
    for (const k of cellKeys(rig)) {
      const [a, d, i] = k.split('/') as [string, DirectionName, string]
      const h = layer[a][d]![+i]!
      const blob = await db.getBlob(h.slice(7))
      const img = blob ? await decodePng(blob) : makeImg(rig.cell.w, rig.cell.h)
      const hh = await cellHash(img)
      if (hh !== h) bad++
      cells[k] = { img, hash: hh, box: opaqueBox(img), mirrorOf: rig.directions.find((x) => x.id === d)?.mirrorOf, offset: [0, 0] }
    }
    const recomputed = await baseHashOf(rig, Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, c.hash])))
    const s: Record<string, Skeleton> = {}
    for (const [k, sk] of Object.entries(p.skeletons ?? {})) if (!cells[k].mirrorOf) s[cells[k].hash] = sk
    sources = []
    skel = s
    built = { rig: { ...rig, anchors: undefined }, cells, errors: bad ? [`${bad} cells failed the hash check`] : [], warnings: p.rigQa.warnings, pivotFrom: p.rigQa.pivotFrom }
    provenance = p.manifest.items[0].provenance
    name = p.manifest.name
    opened = { id: p.id, verified: !bad && recomputed === rig.baseHash, stored: rig.baseHash }
    sourceLabel = `frozen ${p.id} (saved ${p.savedAt})`
    busy = ''
  }

  async function exportZip() {
    if (!built) return
    busy = 'zipping'
    const rec = await makeRecord(built)
    const entries: ZipEntry[] = [{ name: 'rig.json', data: new TextEncoder().encode(JSON.stringify({ ...rec, errors: built.errors }, null, 2)) }]
    for (const k of cellKeys(rec.manifest.rig))
      entries.push({ name: `cells/${k.replaceAll('/', '_')}.png`, data: await encodePngBytes(built.cells[k].img) })
    const bytes = await zip(entries)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
    a.download = `${name}-rig-debug.zip`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    busy = ''
    msg = `zip: ${entries.length} files, ${bytes.length} bytes`
  }

  // ---- playback: one clock for every animation and direction ----
  let t = $state(0)
  let playing = $state(true)
  $effect(() => {
    if (!playing) return
    const t0 = performance.now() - t
    const id = setInterval(() => (t = performance.now() - t0), 25)
    return () => clearInterval(id)
  })
  function frameAt(a: RigAnimation, now: number) {
    let m = now % a.frames.reduce((n, f) => n + f.ms, 0)
    for (const f of a.frames) { if (m < f.ms) return f.cell; m -= f.ms }
    return 0
  }

  // ---- drawing ----
  const bitmaps = new Map<string, OffscreenCanvas>()
  function bitmap(c: Cell) {
    let b = bitmaps.get(c.hash)
    if (!b) {
      b = new OffscreenCanvas(c.img.w, c.img.h)
      b.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(c.img.data), c.img.w, c.img.h), 0, 0)
      bitmaps.set(c.hash, b)
    }
    return b
  }
  const ANCHOR_COLOR: Record<string, string> = { head: '#f0f', neck: '#0ff', hand_r: '#f80', hand_l: '#fd0', hip: '#0f0', foot_r: '#08f', foot_l: '#80f' }
  const draw = (key: string) => (cv: HTMLCanvasElement) => {
    const b = built
    if (!b) return
    const W = b.rig.cell.w, s = scale, c = b.cells[key]
    cv.width = cv.height = W * s
    const g = cv.getContext('2d')!
    g.imageSmoothingEnabled = false
    g.lineWidth = 1
    if (!c) return
    g.drawImage(bitmap(c), 0, 0, W * s, W * s)
    if (ov.bbox && c.box) { g.strokeStyle = '#0a0'; g.strokeRect(c.box.x0 * s + 0.5, c.box.y0 * s + 0.5, (c.box.x1 - c.box.x0 + 1) * s - 1, (c.box.y1 - c.box.y0 + 1) * s - 1) }
    if (ov.pivot) {
      const { x, y } = b.rig.pivot
      g.fillStyle = '#f00'
      g.fillRect(x * s - 4 * s, y * s, 8 * s, 1)
      g.fillRect(x * s, y * s - 4 * s, 1, 8 * s)
    }
    if (ov.skel) {
      const sk = skeletonOf(b, key, skel)
      for (const k of Object.values(sk ?? {})) { g.fillStyle = k.z < 0 ? '#06f' : '#ff0'; g.fillRect(k.x * s - 1, k.y * s - 1, 3, 3) }
    }
    if (ov.anchors && tracks?.anchors) {
      const [a, d, i] = key.split('/') as [string, DirectionName, string]
      for (const id of ANCHORS) {
        const p = tracks.anchors[id]?.[a]?.[d]?.[+i]
        if (!p) continue
        g.strokeStyle = ANCHOR_COLOR[id]
        g.lineWidth = 2
        g.strokeRect((p[0] - 1) * s, (p[1] - 1) * s, 3 * s, 3 * s) // box around the anchor pixel
      }
    }
  }
  const headStats = $derived((tracks?.stats ?? []).filter((x) => x.anchor === 'head'))
</script>

<h1>M2 · rig freeze</h1>

<section>
  <h2>1 · Base source</h2>
  <div>
    From M1:
    <select bind:value={charId} data-testid="m1-char">
      {#each characters as c (c)}<option value={c}>{c.slice(0, 8)}</option>{/each}
    </select>
    <button onclick={() => safe(() => loadM1(charId))} disabled={!charId} data-testid="load-m1">load M1 animations</button>
    {#if !characters.length}<span class="note">no M1 base in the ledger</span>{/if}
  </div>
  <div
    class="drop"
    role="region"
    aria-label="drop PNG frames"
    ondragover={(e) => e.preventDefault()}
    ondrop={(e) => { e.preventDefault(); const f = [...(e.dataTransfer?.files ?? [])]; void safe(() => importFiles(f)) }}
  >
    Import PNGs (drop here or <input type="file" accept="image/png" multiple data-testid="import" onchange={(e) => { const f = [...(e.currentTarget.files ?? [])]; void safe(() => importFiles(f)) }} />):
    frames named <code>&lt;anim&gt;_&lt;dir&gt;_&lt;i&gt;.png</code>, or a grid sheet →
    anim <input bind:value={sheetAnim} style="width:5rem" /> rows <input bind:value={sheetDirs} style="width:10rem" /> cell <input type="number" bind:value={sheetCell} style="width:3.5rem" />
  </div>
  <div>
    directions
    <select bind:value={mode} data-testid="mode">
      <option value="4">4-dir (S, E, N + W mirrored from E)</option>
      <option value="8">8-dir (5 generated + 3 mirrored)</option>
      <option value="all">all generated directions</option>
    </select>
    cell <select bind:value={size}><option value={64}>64</option><option value={32}>32</option></select>
    zoom <input type="number" min="1" max="6" bind:value={scale} style="width:3rem" />
  </div>
  {#if sourceLabel}<p class="note" data-testid="source">{sourceLabel}</p>{/if}
  <p>{#if busy}<span data-testid="busy">{busy}…</span>{/if} {#if msg}<span class="note" data-testid="msg">{msg}</span>{/if}</p>
</section>

{#if built}
  <section>
    <h2>2 · Rig</h2>
    <p data-testid="rig-summary">
      cell {built.rig.cell.w}×{built.rig.cell.h} · pivot ({built.rig.pivot.x}, {built.rig.pivot.y}) from {built.pivotFrom} ·
      dirs {built.rig.directions.map((d) => d.id + (d.mirrorOf ? `⇐${d.mirrorOf}` : '')).join(', ')} ·
      {built.rig.animations.map((a) => `${a.id} ${a.cells} cells @ ${a.frames[0]?.ms} ms`).join(', ')} ·
      {Object.keys(built.cells).length} cells
    </p>
    <p>baseHash <code data-testid="basehash">{built.rig.baseHash}</code>
      {#if opened}<b class={opened.verified ? 'ok' : 'bad'} data-testid="verified">{opened.verified ? 'stored rig verified (cell hashes + baseHash recomputed)' : 'HASH MISMATCH'}</b>{/if}
    </p>
    <div class="row">
      <button onclick={() => safe(runSkeletons)} disabled={!app.key || !missingSkel.length || !!busy} data-testid="skeletons">
        estimate skeletons ({missingSkel.length} cells, ≈{(missingSkel.length * 0.1).toFixed(1)} gens)
      </button>
      {#if !app.key}<span class="note">set a key in <a href="#/m1">M1</a></span>{/if}
      <label>name <input bind:value={name} style="width:6rem" /></label>
      <button onclick={() => safe(freeze)} disabled={!!built.errors.length || !!busy} data-testid="freeze">Freeze rig</button>
      <button onclick={() => safe(exportZip)} disabled={!!busy} data-testid="zip">debug zip (rig.json + cells)</button>
    </div>
    <div class="row">
      overlays:
      <label><input type="checkbox" bind:checked={ov.pivot} /> pivot</label>
      <label><input type="checkbox" bind:checked={ov.skel} /> keypoints</label>
      <label><input type="checkbox" bind:checked={ov.anchors} /> anchors</label>
      <label><input type="checkbox" bind:checked={ov.bbox} /> opaque bbox</label>
      <label><input type="checkbox" bind:checked={playing} /> play</label>
      <span class="legend">{#each ANCHORS as id (id)}<span style="color:{ANCHOR_COLOR[id]}">■{id}</span> {/each}</span>
    </div>

    <h3>QA</h3>
    <ul class="qa" data-testid="qa">
      {#each built.errors as e, i (i)}<li class="bad">error: {e}</li>{/each}
      {#each built.warnings as w, i (i)}<li>warn: {w}</li>{/each}
      {#if missingSkel.length}<li>warn: {missingSkel.length} cells without skeleton (anchors incomplete)</li>{/if}
      {#if !built.errors.length && !built.warnings.length}<li class="ok">no issues</li>{/if}
    </ul>
    {#if headStats.length}
      <details open>
        <summary>head anchor tracking (keyframe {built.pivotFrom.split('/')[0]}/&lt;dir&gt;/0; dev = |tracked − keypoint| px, SAD = mean residual per px)</summary>
        <table class="small" data-testid="head-stats">
          <tbody>
            {#each headStats as s (s.animDir)}
              <tr><td>{s.animDir}</td><td>dev {s.maxDev}</td><td>SAD {s.meanSad}</td><td><code>{s.points.map((p) => p.join(',')).join(' ')}</code></td></tr>
            {/each}
          </tbody>
        </table>
      </details>
    {/if}
  </section>

  <section>
    {#each built.rig.animations as a (a.id)}
      <h3>{a.id} <small>{a.cells} cells · playlist {a.frames.map((f) => `${f.cell}:${f.ms}`).join(' ')}</small></h3>
      <table class="grid" data-testid="grid-{a.id}">
        <tbody>
          {#each built.rig.directions as d (d.id)}
            <tr>
              <th>{d.id}{d.mirrorOf ? ` ⇐ ${d.mirrorOf}` : ''}</th>
              <td class="play"><canvas {@attach draw(cellKey(a.id, d.id, frameAt(a, t)))}></canvas></td>
              {#each Array.from({ length: a.cells }, (_, i) => i) as i (i)}
                <td><canvas title={cellKey(a.id, d.id, i)} {@attach draw(cellKey(a.id, d.id, i))}></canvas><div class="note">{i}</div></td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    {/each}
  </section>
{/if}

<section>
  <h2>Frozen rigs (IndexedDB)</h2>
  <ul data-testid="stored">
    {#each stored as p (p.id)}
      <li><button onclick={() => safe(() => openStored(p))}>open</button> <code>{p.id}</code> {p.manifest.name} · {p.manifest.rig.directions.length} dirs · {p.manifest.rig.animations.map((a) => a.id).join('+')} · {p.savedAt}</li>
    {:else}<li class="note">none yet</li>{/each}
  </ul>
</section>

<style>
  section { margin: 1rem 0; }
  .row { display: flex; flex-wrap: wrap; gap: 0.4rem 0.8rem; align-items: center; margin: 0.3rem 0; }
  .drop { border: 1px dashed #8888; padding: 0.4rem; margin: 0.4rem 0; font-size: 0.85rem; }
  .note { font-size: 0.75rem; opacity: 0.8; }
  .bad { color: #c33; }
  .ok { color: #2a2; }
  .qa { font-size: 0.8rem; }
  .small { font-size: 0.75rem; border-collapse: collapse; }
  .small td { padding: 0 0.4rem; }
  .grid { border-collapse: collapse; }
  .grid td, .grid th { padding: 2px; text-align: center; font-size: 0.75rem; vertical-align: top; }
  .grid td.play { background: #fa03; }
  canvas { image-rendering: pixelated; background: repeating-conic-gradient(#ccc 0 25%, #eee 0 50%) 0 0 / 12px 12px; display: block; }
  .legend { font-size: 0.75rem; }
</style>
