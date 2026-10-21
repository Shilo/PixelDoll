<script lang="ts">
  import { queue } from '../lib/pixellab/queue.ts'
  import { app } from '../lib/app.svelte.ts'
  import { type Img } from '../lib/image/png.ts'
  import { encodePngBytes } from '../lib/image/pngraw.ts'
  import { keyHeatmap, pickKey } from '../lib/image/chroma.ts'
  import { listProjects, loadProject, deleteItem, type StoredProject } from '../lib/store/project.ts'
  import type { Item } from '../lib/store/manifest.ts'
  import { cellKey, type DirectionName } from '../lib/rig/rig.ts'
  import { composeCell } from '../lib/compose/compose.ts'
  import { SLOTS, slotOf, planItem, planGens, canPose, recompose, contactSheet, GATES, type CellOut, type Method, type Route } from '../lib/items/items.ts'
  import {
    acceptItem, callState, evaluateItem, failsOf, gensOf, loadDrafts, newDraft, rerollCall, runItem, saveDrafts,
    type Draft, type ItemResult, type RigCtx,
  } from '../lib/items/run.ts'

  let drafts = $state<Draft[]>([])
  let results = $state.raw<Record<string, ItemResult>>({})
  let running = $state<Record<string, string>>({}) // item id -> status text
  let open = $state('')
  let msg = $state('')

  let projects = $state.raw<StoredProject[]>([])
  let rigId = $state('')
  let ctx = $state.raw<RigCtx | null>(null)
  const rec = $derived(ctx?.rec)
  const rig = $derived(rec?.manifest.rig)
  const generatedDirs = $derived((rig?.directions ?? []).filter((d) => !d.mirrorOf).map((d) => d.id))

  const persist = () => saveDrafts($state.snapshot(drafts) as Draft[])
  async function init() {
    projects = await listProjects()
    drafts = await loadDrafts()
    if (!rigId && projects.length) rigId = [...projects].sort((a, b) => a.savedAt.localeCompare(b.savedAt)).at(-1)!.id
  }
  void init()
  $effect(() => { if (rigId) void openRig(rigId) })

  async function openRig(id: string) {
    const c = await loadProject(id)
    if (id !== rigId) return // a later rig switch won the race
    ctx = c
    results = {}
    for (const d of drafts.filter((d) => d.rigId === id)) void evaluate(d)
  }
  const setResult = (id: string, r: ItemResult) => (results = { ...results, [id]: r })
  async function evaluate(d: Draft) { const r = await evaluateItem(d, ctx!); setResult(d.spec.id, r); return r }

  // ---------- form ----------
  let form = $state({ slot: 'head', name: '', prompt: '', key: 'auto' as 'auto' | Route, method: 'auto' as 'auto' | Method, anims: [] as string[], dirs: [] as DirectionName[] })
  $effect(() => {
    if (rig && !form.anims.length) { form.anims = rig.animations.map((a) => a.id); form.dirs = [...generatedDirs] }
  })
  const autoKey = $derived(pickKey(form.prompt))
  const posable = $derived(!!rig && canPose(rig, form))
  const method = $derived<Method>(form.method === 'auto' ? (posable ? 'skel' : 'anchor') : form.method)
  const plan = $derived(rig && form.anims.length && form.dirs.length ? planItem(rig, { ...form, key: form.key === 'auto' ? autoKey : form.key, method }) : [])

  async function addDraft() {
    if (!ctx || !form.prompt.trim()) return
    const d = newDraft(ctx, { name: form.name, slot: form.slot, prompt: form.prompt.trim(), key: form.key === 'auto' ? autoKey : form.key, method, anims: [...form.anims], dirs: [...form.dirs] }, drafts.filter((x) => x.rigId === rigId).map((x) => x.spec.id))
    drafts.push(d)
    await persist()
    open = d.spec.id
    void runDraft(drafts.at(-1)!)
  }

  /** Auto loop (lib/items/run.ts runItem); the UI only tracks status and results. */
  async function runDraft(d: Draft) {
    const id = d.spec.id
    if (running[id] || !ctx) return
    running = { ...running, [id]: 'starting' }
    await runItem(d, ctx, { status: (s) => (running = { ...running, [id]: s }), persist, result: (r) => setResult(id, r) })
    const { [id]: _, ...rest } = running
    running = rest
  }
  async function accept(d: Draft) {
    try {
      const { item, cells } = await acceptItem(d, ctx!, results[d.spec.id])
      await persist()
      await openRig(d.rigId)
      msg = `accepted ${item.id} into ${d.rigId} (${cells} layer cells)`
    } catch (e) { msg = (e as Error).message }
  }
  async function removeDraft(d: Draft) {
    drafts = drafts.filter((x) => x !== d)
    await persist()
  }
  const accepted = $derived(rec?.manifest.items.filter((i) => i.slot !== 'body') ?? [])
  async function unaccept(it: Item) { await deleteItem(rigId, it.id); await openRig(rigId) }

  // ---------- view ----------
  let view = $state({ input: true, out: true, heat: false, layer: true, recomp: true, final: true, scale: 2 })
  const paint = (im: Img | null | undefined) => (cv: HTMLCanvasElement) => {
    if (!im) return
    cv.width = im.w
    cv.height = im.h
    cv.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(im.data), im.w, im.h), 0, 0)
  }
  function cellRows(c: CellOut | undefined, route: Route): (Img | null)[] {
    if (!c) return []
    const rows: (Img | null)[] = []
    if (view.input) rows.push(c.input)
    if (view.out) rows.push(view.heat && route !== 'none' ? keyHeatmap(c.out, route) : c.out)
    if (view.layer) rows.push(c.layer)
    if (view.recomp) rows.push(recompose(c))
    return rows
  }
  const pct = (v: number) => (v * 100).toFixed(1) + ' %'

  /** Contact sheet per item: per clip 4 rows (key input, PixelLab composite, layer, layer over the real base) + final compose rows. */
  async function saveSheet(d: Draft) {
    const res = results[d.spec.id]
    if (!res?.qa || !res.preview) return
    const by = new Map(res.cells.map((c) => [c.key, c]))
    const rows: (Img | null)[][] = []
    for (const a of rig!.animations.filter((x) => d.spec.anims.includes(x.id))) {
      for (const dir of d.spec.dirs) {
        const cs = Array.from({ length: a.cells }, (_, i) => by.get(cellKey(a.id, dir, i)))
        rows.push(cs.map((c) => c?.input ?? null), cs.map((c) => c?.out ?? null), cs.map((c) => c?.layer ?? null), cs.map((c) => (c ? recompose(c) : null)))
      }
      for (const dir of rig!.directions) rows.push(Array.from({ length: a.cells }, (_, i) => composeCell(res.preview!, { [d.spec.slot]: d.spec.id }, a.id, dir.id, i)))
    }
    const png = await encodePngBytes(contactSheet(rows, 2))
    const name = `m3_${d.spec.method === 'skel' ? 'skel_' : ''}${d.spec.id}.png`
    const r = await fetch(`/__dev/save?name=${name}`, { method: 'POST', body: png as Uint8Array<ArrayBuffer> })
    msg = r.ok ? `saved docs/testing/img/${name}` : `save failed ${r.status}`
  }
  $effect(() => {
    if (import.meta.env.DEV) (window as unknown as { __m3: unknown }).__m3 = { drafts, results, saveSheet, runDraft, accept, evaluate }
  })
</script>

<h1>M3 · item lab (chroma mannequin)</h1>

<section class="row">
  rig
  <select bind:value={rigId} data-testid="rig">
    {#each projects as p (p.id)}<option value={p.id}>{p.id} · {p.manifest.name} · {p.manifest.rig.directions.length} dirs · {p.manifest.rig.animations.map((a) => `${a.id} ${a.cells}`).join(' + ')}{p.manifest.rig.pad ? ` · pad ${p.manifest.rig.pad.x},${p.manifest.rig.pad.y}` : ''}</option>{/each}
  </select>
  {#if !projects.length}<span class="note">no frozen rig: make a base in <a href="#/m1">M1</a> (S2 clothed 48 px preset) and freeze it in <a href="#/m2">M2</a></span>{/if}
  {#if rig}<span class="note">pivot ({rig.pivot.x}, {rig.pivot.y}) · anchors {rig.anchors ? Object.keys(rig.anchors).join(', ') : 'none (run skeletons in M2 for G8)'} · {accepted.length} accepted items</span>{/if}
  <label>concurrency <input type="number" min="1" max="8" value={$queue.concurrency} onchange={(e) => queue.setConcurrency(+e.currentTarget.value)} style="width:3rem" /></label>
  {#if !app.key}<span class="bad">no API key (set one in <a href="#/m1">M1</a>)</span>{/if}
</section>
{#if msg}<p class="note" data-testid="msg">{msg}</p>{/if}

{#if rig}
  <section class="form">
    <h2>New item</h2>
    <div class="row">
      <label>slot <select bind:value={form.slot} data-testid="slot">{#each SLOTS.filter((s) => s.id !== 'body') as s (s.id)}<option value={s.id}>{s.id} ({s.class}{s.bgZ != null ? ', split' : ''})</option>{/each}</select></label>
      <label>name <input bind:value={form.name} placeholder="Iron helmet" data-testid="name" /></label>
      <label>key
        <select bind:value={form.key} data-testid="key">
          <option value="auto">auto ({autoKey})</option><option value="green">green</option><option value="magenta">magenta</option><option value="none">none: diff fallback on the real base</option>
        </select>
      </label>
    </div>
    <textarea bind:value={form.prompt} rows="2" placeholder="a simple grey steel knight helmet covering the top and sides of the head, face visible" data-testid="prompt"></textarea>
    <div class="row">
      anims {#each rig.animations as a (a.id)}<label><input type="checkbox" value={a.id} bind:group={form.anims} /> {a.id} ({a.cells})</label>{/each}
      · dirs {#each generatedDirs as d (d)}<label><input type="checkbox" value={d} bind:group={form.dirs} /> {d}</label>{/each}
      <span class="note">west etc. = mirror of the generated direction</span>
    </div>
    <div class="row">
      <label>route
        <select bind:value={form.method} data-testid="method">
          <option value="auto">auto ({posable ? 'skeleton posing' : 'edit + anchor: rig has no keypoints'})</option>
          <option value="skel" disabled={!posable}>skeleton posing: dress S/E/N keyframes, pose per clip (S4 default)</option>
          <option value="anchor">edit-animation-v2 + anchor cell (S2)</option>
        </select>
      </label>
      <span data-testid="plan">{plan.length} calls ({plan.map((c) => `${c.kind} ${c.cells.length}`).join(' + ')}) ≈ {planGens(plan)} gens</span>
      <button onclick={addDraft} disabled={!app.key || !form.prompt.trim() || !plan.length} data-testid="generate">Generate</button>
    </div>
  </section>

  <section>
    <h2>Items</h2>
    {#each drafts.filter((d) => d.rigId === rigId) as d (d.spec.id)}
      {@const res = results[d.spec.id]}
      {@const q = res?.qa}
      <div class="item" data-testid="item-{d.spec.id}">
        <div class="row">
          <button onclick={() => (open = open === d.spec.id ? '' : d.spec.id)}>{open === d.spec.id ? '▾' : '▸'}</button>
          <b>{d.spec.name}</b> <code>{d.spec.id}</code> · {d.spec.slot} · {d.spec.method === 'skel' ? 'skeleton posing' : 'edit + anchor'} · key <b>{d.spec.key}</b>{d.keySwitched ? ' (switched)' : ''} ·
          <span class={q?.qa.status === 'pass' ? 'ok' : q?.qa.status === 'fail' ? 'bad' : 'warnc'} data-testid="status-{d.spec.id}">
            {running[d.spec.id] ? `running: ${running[d.spec.id]}` : !q ? 'no results' : d.calls.some((c) => callState(c, $queue.jobs) !== 'done') ? `partial (${d.calls.filter((c) => callState(c, $queue.jobs) === 'done').length}/${d.calls.length} calls, ${q.qa.status})` : q.qa.status}{d.acceptedAt ? ' · accepted' : ''}
          </span>
          · {gensOf(d, $queue.jobs)} gens
          <button onclick={() => runDraft(d)} disabled={!!running[d.spec.id] || !app.key}>run / resume</button>
          <button onclick={() => accept(d)} disabled={!!running[d.spec.id] || !q || d.calls.some((c) => callState(c, $queue.jobs) !== 'done')} data-testid="accept-{d.spec.id}">accept{q?.qa.status === 'fail' ? ' anyway' : ''}</button>
          {#if import.meta.env.DEV}<button onclick={() => saveSheet(d)} disabled={!q}>save sheet</button>{/if}
          <button onclick={() => removeDraft(d)} disabled={!!running[d.spec.id]}>remove draft</button>
        </div>
        <div class="note">{d.spec.prompt}</div>
        {#if open === d.spec.id}
          <table class="small" data-testid="calls-{d.spec.id}">
            <thead><tr><th>call</th><th>cells</th><th>seed</th><th>state</th><th>re-rolls</th><th>palette dist</th><th>gate failures</th><th></th></tr></thead>
            <tbody>
              {#each d.calls as c, k (k)}
                <tr>
                  <td>{k + 1} ({c.kind === 'pose' ? 'pose' : c.kind === 'dress' ? 'dress keyframes' : k ? 'anchor' : 'design'})</td><td>{[...new Set(c.cells.map((x) => x.split('/').slice(0, 2).join('/')))].join(', ')}</td>
                  <td>{c.seed}</td><td>{callState(c, $queue.jobs)}</td><td>{c.rerolls}{c.old.length ? ` (${c.old.length} old)` : ''}</td>
                  <td>{q?.paletteDist[k] ?? ''}</td>
                  <td class="bad">{res ? failsOf(res, k).join('; ') : ''}</td>
                  <td><button onclick={() => { rerollCall(d, k, 'manual'); void persist().then(() => runDraft(d)) }} disabled={!!running[d.spec.id]}>re-roll</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if q}
            <table class="small qa" data-testid="qa-{d.spec.id}">
              <tbody>
                <tr><td>G2 min key kept</td><td class={q.qa.minKeyKept >= GATES.keyKept ? 'ok' : 'bad'}>{d.spec.key === 'none' ? 'n/a' : pct(q.qa.minKeyKept)}</td>
                  <td>G3 max key outside</td><td class={q.qa.maxKeyOutside <= GATES.keyOutside ? 'ok' : 'bad'}>{d.spec.key === 'none' ? 'n/a' : pct(q.qa.maxKeyOutside)}</td>
                  <td>G4 min area / median</td><td class={q.qa.minAreaRatio >= GATES.areaRatio ? 'ok' : 'bad'}>{q.qa.minAreaRatio}</td>
                  <td>G5 max area CV</td><td class={q.qa.maxAreaCV <= GATES.areaCV ? 'ok' : 'bad'}>{q.qa.maxAreaCV}</td></tr>
                <tr><td>G6 max palette dist</td><td class={q.qa.maxPaletteDist <= GATES.paletteDist ? 'ok' : 'warnc'}>{q.qa.maxPaletteDist}</td>
                  <td>G7 clip px</td><td class={q.qa.clipPx ? 'bad' : 'ok'}>{q.qa.clipPx}</td>
                  <td>G8 handedness</td><td class={q.qa.handedness === 'switched' ? 'bad' : 'ok'}>{q.qa.handedness ?? '—'}</td>
                  <td>split exact</td><td class={q.splitExact ? 'ok' : 'bad'}>{slotOf(d.spec.slot).bgZ != null ? q.splitExact : '—'}</td></tr>
                <tr><td>specks / pinholes</td><td>{res.cells.reduce((s, c) => s + c.specks, 0)} / {res.cells.reduce((s, c) => s + c.pinholes, 0)}</td>
                  <td>out-of-band px</td><td>{res.cells.reduce((s, c) => s + c.outBand, 0)}</td>
                  <td>cells</td><td>{res.cells.length}</td><td>re-rolls</td><td>{q.qa.rerolls}</td></tr>
              </tbody>
            </table>
            {#each q.warnings as w, i (i)}<div class="warnc small">warn: {w}</div>{/each}
            <table class="small">
              <thead><tr><th>clip</th><th>call</th><th>median px</th><th>area CV</th><th>body-band CV</th><th>min/median</th><th>hand</th><th>centroid spread vs anchor</th><th>min adj. shape IoU</th></tr></thead>
              <tbody>{#each q.clips as c (c.clip)}<tr><td>{c.clip}</td><td>{c.call + 1}</td><td>{c.median}</td><td>{c.cv}</td><td>{c.baseCv}</td><td>{c.minRatio}</td><td>{c.hand ?? ''}</td><td>{c.spread}</td><td>{c.minIoU}</td></tr>{/each}</tbody>
            </table>
          {/if}
          <details><summary>log ({d.log.length})</summary><pre class="small">{d.log.join('\n')}</pre></details>

          <div class="row">
            view:
            <label><input type="checkbox" bind:checked={view.input} /> key input</label>
            <label><input type="checkbox" bind:checked={view.out} /> PixelLab composite</label>
            <label><input type="checkbox" bind:checked={view.heat} /> key-score heatmap</label>
            <label><input type="checkbox" bind:checked={view.layer} /> layer</label>
            <label><input type="checkbox" bind:checked={view.recomp} /> layer over real base</label>
            <label><input type="checkbox" bind:checked={view.final} /> final compose (all dirs)</label>
            zoom <input type="number" min="1" max="5" bind:value={view.scale} style="width:3rem" />
          </div>
          {#if res}
            {@const by = new Map(res.cells.map((c) => [c.key, c]))}
            {#each rig.animations.filter((a) => d.spec.anims.includes(a.id)) as a (a.id)}
              <h3>{a.id}</h3>
              <table class="grid">
                <tbody>
                  {#each d.spec.dirs as dir (dir)}
                    <tr>
                      <th>{dir}</th>
                      {#each Array.from({ length: a.cells }, (_, i) => i) as i (i)}
                        {@const c = by.get(cellKey(a.id, dir, i))}
                        <td title={c ? `${c.key}: area ${c.area}${c.keyKept != null ? `, key kept ${pct(c.keyKept)}, outside ${pct(c.keyOutside ?? 0)}` : ''}, specks ${c.specks}, pinholes ${c.pinholes}` : 'pending'}>
                          {#each cellRows(c, d.spec.key) as im, j (j)}<canvas style:width="{rig.cell.w * view.scale}px" {@attach paint(im)}></canvas>{/each}
                          <div class="note">{i}{c?.keyKept != null && c.keyKept < GATES.keyKept ? ' ⚠' : ''}</div>
                        </td>
                      {/each}
                    </tr>
                  {/each}
                  {#if view.final && res.preview}
                    {#each rig.directions as dir (dir.id)}
                      <tr class="final">
                        <th>{dir.id}{dir.mirrorOf ? ` ⇐ ${dir.mirrorOf}` : ''}<br /><small>final</small></th>
                        {#each Array.from({ length: a.cells }, (_, i) => i) as i (i)}
                          <td><canvas style:width="{rig.cell.w * view.scale}px" {@attach paint(composeCell(res.preview, { [d.spec.slot]: d.spec.id }, a.id, dir.id, i))}></canvas></td>
                        {/each}
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            {/each}
          {/if}
        {/if}
      </div>
    {:else}<p class="note">no items yet</p>{/each}
  </section>

  <section>
    <h2>Accepted items in {rigId}</h2>
    <ul data-testid="accepted">
      {#each accepted as it (it.id)}
        <li><code>{it.id}</code> {it.name} · {it.slot} · layers {it.layers.map((l) => `${l.id} z${l.z}`).join(', ')} · {it.extractor}/{it.key ?? ''} · QA {it.qa?.status} · {it.provenance.reduce((s, p) => s + (p.usage?.generations ?? 0), 0)} gens
          <button onclick={() => unaccept(it)}>remove from project</button></li>
      {:else}<li class="note">none</li>{/each}
    </ul>
  </section>
{/if}

<style>
  section { margin: 1rem 0; }
  .row { display: flex; flex-wrap: wrap; gap: 0.4rem 0.8rem; align-items: center; margin: 0.3rem 0; }
  .form textarea { width: min(60rem, 100%); }
  .item { border-top: 1px solid #8884; padding: 0.4rem 0; }
  .note { font-size: 0.75rem; opacity: 0.8; }
  .bad { color: #c33; }
  .ok { color: #2a2; }
  .warnc { color: #b80; }
  .small { font-size: 0.75rem; border-collapse: collapse; }
  .small td, .small th { padding: 0 0.4rem; text-align: left; vertical-align: top; }
  .grid { border-collapse: collapse; }
  .grid td, .grid th { padding: 2px; text-align: center; font-size: 0.7rem; vertical-align: top; }
  .grid tr.final td { background: #08f2; }
  canvas { image-rendering: pixelated; background: repeating-conic-gradient(#ccc 0 25%, #eee 0 50%) 0 0 / 12px 12px; display: block; margin-bottom: 1px; }
</style>
