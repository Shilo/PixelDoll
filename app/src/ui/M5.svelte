<script lang="ts">
  import { composeCell } from '../lib/compose/compose.ts'
  import { loadFixture } from '../lib/compose/fixture.ts'
  import { exportZip } from '../lib/export/export.ts'
  import type { DirectionName, Engine, Preset, Project } from '../lib/store/manifest.ts'

  const ENGINES: Engine[] = ['generic', 'godot', 'phaser', 'unity']
  const SCALE = 4

  let project = $state.raw<Project | null>(null)
  let error = $state('')
  let presetId = $state('')
  let equip = $state<Preset['items']>({})
  let anim = $state('walk')
  let frame = $state(0)
  let playing = $state(true)
  let engines = $state<Engine[]>([...ENGINES])
  let baked = $state(true)
  let busy = $state(false)
  let result = $state<{ files: string[]; warnings: string[]; errors: string[]; bytes: number } | null>(null)

  const m = $derived(project?.manifest)
  const rigAnim = $derived(m?.rig.animations.find((a) => a.id === anim))

  async function load() {
    error = ''
    try {
      project = await loadFixture(async (p) => new Uint8Array(await (await fetch(`./fixtures/s1/${p}`)).arrayBuffer()))
      pickPreset(project.manifest.presets[0].id)
    } catch (e) { error = (e as Error).message }
  }
  load()

  function pickPreset(id: string) {
    presetId = id
    equip = { ...m!.presets.find((p) => p.id === id)!.items }
  }

  // playlist clock: one timer drives every direction (same rule as the engine runtimes)
  $effect(() => {
    if (!rigAnim || !playing) return
    const t = setTimeout(() => (frame = (frame + 1) % rigAnim.frames.length), rigAnim.frames[frame % rigAnim.frames.length].ms)
    return () => clearTimeout(t)
  })

  // attachment: re-runs whenever frame/equip/anim change; same compose as the baked export
  const draw = (dir: DirectionName) => (canvas: HTMLCanvasElement) => {
    if (!project || !rigAnim) return
    const im = composeCell(project, equip, anim, dir, rigAnim.frames[frame % rigAnim.frames.length].cell)
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(im.data), im.w, im.h), 0, 0)
  }

  async function doExport() {
    if (!project) return
    busy = true
    try {
      const r = await exportZip(project, { engines, baked })
      result = { files: r.entries.map((e) => e.name), warnings: r.warnings, errors: r.errors, bytes: r.zip?.length ?? 0 }
      if (r.zip) {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([r.zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
        a.download = `${project.manifest.name}.pixeldoll.zip`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
      }
    } catch (e) { error = (e as Error).message }
    busy = false
  }
</script>

<h1>M5 · export</h1>

{#if error}<p class="err">{error}</p>{/if}
{#if !m}
  <p>Loading the S1 fixture…</p>
{:else}
  <p>
    Fixture <code>{m.name}</code>: real S1 PixelLab outputs (base walk + idle, helmet, leather vest, sword split fg/bg), {m.rig.cell.w}×{m.rig.cell.h},
    pivot ({m.rig.pivot.x}, {m.rig.pivot.y}), directions {m.rig.directions.map((d) => d.id + (d.mirrorOf ? ` (mirror of ${d.mirrorOf})` : '')).join(', ')}.
  </p>

  <section class="row">
    <label>Preset
      <select value={presetId} onchange={(e) => pickPreset(e.currentTarget.value)}>
        {#each m.presets as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
    </label>
    {#each m.slots.filter((s) => s.id !== 'body' && m.items.some((i) => i.slot === s.id)) as s (s.id)}
      <label>{s.id}
        <select bind:value={equip[s.id]}>
          <option value={null}>none</option>
          {#each m.items.filter((i) => i.slot === s.id) as it (it.id)}<option value={it.id}>{it.name}</option>{/each}
        </select>
      </label>
    {/each}
    <label>Animation
      <select bind:value={anim} onchange={() => (frame = 0)}>
        {#each m.rig.animations as a (a.id)}<option value={a.id}>{a.id}</option>{/each}
      </select>
    </label>
    <button onclick={() => (playing = !playing)}>{playing ? 'pause' : 'play'}</button>
    <button disabled={playing} onclick={() => rigAnim && (frame = (frame + 1) % rigAnim.frames.length)}>step</button>
    <span>frame {frame % (rigAnim?.frames.length ?? 1)} · cell {rigAnim?.frames[frame % rigAnim.frames.length].cell}</span>
  </section>

  <section class="dirs">
    {#each m.rig.directions as d (d.id)}
      <figure>
        <canvas width={m.rig.cell.w} height={m.rig.cell.h} style:width="{m.rig.cell.w * SCALE}px" {@attach draw(d.id)}></canvas>
        <figcaption>{d.id}{d.mirrorOf ? ` (mirror of ${d.mirrorOf})` : ''}</figcaption>
      </figure>
    {/each}
  </section>

  <section class="row">
    <strong>Targets</strong>
    {#each ENGINES as e (e)}
      <label><input type="checkbox" value={e} bind:group={engines} /> {e}</label>
    {/each}
    <label><input type="checkbox" bind:checked={baked} /> baked composites (every preset)</label>
    <button disabled={busy} onclick={doExport}>{busy ? 'exporting…' : 'download zip'}</button>
  </section>

  {#if result}
    <section>
      {#each result.errors as e}<p class="err">{e}</p>{/each}
      {#each result.warnings as w}<p class="warn">{w}</p>{/each}
      {#if !result.errors.length}
        <p data-testid="export-result">{result.files.length} files, {(result.bytes / 1024).toFixed(1)} KiB zip</p>
        <details><summary>files</summary><pre>{result.files.join('\n')}</pre></details>
      {/if}
    </section>
  {/if}
{/if}

<style>
  .row { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin: 0.75rem 0; }
  .dirs { display: flex; flex-wrap: wrap; gap: 1rem; }
  figure { margin: 0; text-align: center; }
  canvas { image-rendering: pixelated; background: repeating-conic-gradient(#ccc 0 25%, #eee 0 50%) 0 0 / 16px 16px; }
  .err { color: #c33; }
  .warn { color: #b80; }
</style>
