<script lang="ts">
  import { cleanUp } from '../studio/state.svelte.ts' // keeps records drafts/creates/moves still need (R6 P1-2)
  import { app, setKey, forgetKey } from '../lib/app.svelte.ts'
  import { queue, type JobRec } from '../lib/pixellab/queue.ts'
  import { routes, baseAnimation, BASE_ANIMS, type BaseAnimMode, type Direction } from '../lib/pixellab/routes.ts'
  import BlobImg from './BlobImg.svelte'

  // Base presets. S2 winner: clothed, generated at 48 and padded to 64 at freeze (16-20 px headroom). S1: bare 64 px.
  // v3 text-only always makes 8 dirs: n_directions 4 needs reference_image (422).
  const PRESETS = {
    s2: { size: 48, seed: 4321, desc: 'plain bald human mannequin for a paperdoll base, light skin tone, wearing a plain grey t-shirt and plain grey shorts, barefoot, no hair, no accessories, neutral standing pose with arms slightly away from the torso' },
    s1: { size: 64, seed: 1234, desc: 'plain bald human base body for a paperdoll, light skin, simple plain grey underwear shorts, barefoot, no hair, no clothing, no accessories, standing straight in a neutral pose with arms slightly away from the body' },
  }
  let preset = $state<keyof typeof PRESETS>('s2')
  const DIRS: Direction[] = ['south', 'east', 'north'] // west = mirror of east (architecture §2)
  let animMode = $state<BaseAnimMode>('skeleton-v3') // newer models only; legacy "template"/"pro" modes are not offered

  let keyInput = $state('')
  let remember = $state(false)
  let seed = $state(4321)
  let msg = $state('')
  let now = $state(Date.now())
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000)
    return () => clearInterval(t)
  })

  let bases = $derived($queue.jobs.filter((r) => r.tag === 'm1-base' && r.state === 'done'))
  let base = $derived(bases.at(-1))
  let characterId = $derived((base?.response as { character_id?: string } | undefined)?.character_id ?? '')

  function saveKey() {
    setKey(keyInput, remember)
    keyInput = ''
  }
  async function createBase() {
    const req = routes.createCharacterV3({
      description: PRESETS[preset].desc,
      image_size: { width: PRESETS[preset].size, height: PRESETS[preset].size },
      view: 'low top-down',
      template_id: 'mannequin',
      seed,
      no_background: true,
    })
    const r = await queue.enqueue(req, { label: `base v3 ${PRESETS[preset].size}px seed ${seed}`, tag: 'm1-base' })
    msg = r.state === 'done' ? `cache hit: reused ${r.id.slice(0, 8)} (same params + seed)` : `queued ${r.id.slice(0, 8)}`
  }
  async function animate() {
    for (const a of BASE_ANIMS) {
      const req = routes.animateCharacter(baseAnimation(animMode, characterId, a, DIRS, seed))
      await queue.enqueue(req, { label: `${a.name} (${animMode}: ${animMode === 'skeleton-v3' ? a.template : a.action})`, tag: 'm1-anim' })
    }
  }

  const short = (id: string) => id.slice(0, 8)
  const secs = (ms: number) => (ms / 1000).toFixed(0) + ' s'
  function duration(r: JobRec) {
    if (!r.submittedAt) return r.state === 'queued' ? `waiting${r.nextAt > now ? ` (retry in ${secs(r.nextAt - now)})` : ''}` : ''
    return secs((r.finishedAt ?? now) - r.submittedAt)
  }
  function cost(r: JobRec) {
    const parts = []
    if (r.gens) parts.push(`${+r.gens.toFixed(3)} gens`)
    if (r.usd) parts.push(`$${r.usd.toFixed(4)}`)
    if (!parts.length) {
      const live = r.jobs.reduce((n, s) => n + (s.usage?.generations ?? 0), 0)
      if (live) parts.push(`${live} gens so far`)
    }
    return parts.join(' + ') || (r.state === 'done' ? '0' : '')
  }
</script>

<h1>M1 · key + queue</h1>

<section>
  <h2>API key</h2>
  <p class="note">Kept in memory unless "remember" is ticked (then localStorage on this device). Sent only to api.pixellab.ai. The API accepts any origin, so a leaked key is usable anywhere — rotate it at pixellab.ai if in doubt.</p>
  <input type="password" placeholder="PixelLab API key" bind:value={keyInput} autocomplete="off" />
  <label><input type="checkbox" bind:checked={remember} /> remember on this device</label>
  <button onclick={saveKey} disabled={!keyInput.trim()}>use key</button>
  <button onclick={forgetKey} disabled={!app.key}>forget key</button>
  <span>automatic concurrency: {$queue.concurrency}</span>
</section>

<section>
  <h2>Base</h2>
  <label>preset <select bind:value={preset} onchange={() => (seed = PRESETS[preset].seed)} data-testid="preset">
    <option value="s2">S2 clothed 48 px (padded to 64 at freeze)</option><option value="s1">S1 bare 64 px</option>
  </select></label>
  <label>seed <input type="number" bind:value={seed} style="width:6rem" /></label>
  <button onclick={createBase} disabled={!app.key} data-testid="create-base">Create test base</button>
  <select bind:value={animMode} data-testid="anim-mode">
    <option value="skeleton-v3">skeleton-v3 (template poses)</option><option value="v3">v3 (action text)</option><option value="pixminimax">pixminimax (action text, beta)</option>
  </select>
  <button onclick={animate} disabled={!app.key || !characterId} data-testid="animate">Animate (idle + walk × {DIRS.join(', ')})</button>
  <span>{characterId ? `character ${short(characterId)}` : 'no base yet'}</span>
  {#if msg}<p class="note">{msg}</p>{/if}
</section>

<section>
  <h2>Ledger <button onclick={() => cleanUp()}>clear finished</button></h2>
  <table data-testid="ledger">
    <thead><tr><th>label</th><th>endpoint</th><th>state</th><th>jobs (id · status · queue pos · progress)</th><th>cost</th><th>duration</th><th></th></tr></thead>
    <tbody>
      {#each [...$queue.jobs].reverse() as r (r.id)}
        <tr class={r.state}>
          <td>{r.label}</td>
          <td><code>{r.endpoint}</code></td>
          <td><b>{r.state}</b>{#if r.attempts > 1} (try {r.attempts}){/if}</td>
          <td>
            {#each r.jobs as s (s.id)}
              <div><code title={s.id}>{short(s.id)}</code> · {s.status}{s.queuePosition ? ` · #${s.queuePosition}` : ''}{s.progress != null && !s.done ? ` · ${Math.min(100, Math.round(s.progress * 100))}%` : ''}{s.usage?.generations ? ` · ${s.usage.generations} gens` : s.usage?.usd ? ` · $${s.usage.usd.toFixed(4)}` : ''}{s.policy ? ' · POLICY' : ''}</div>
            {/each}
            {#if r.error}<div class="err">{r.error}</div>{/if}
          </td>
          <td>{cost(r)}</td>
          <td>{duration(r)}</td>
          <td>{#if r.state === 'queued' || r.state === 'running'}<button onclick={() => queue.cancel(r.id)}>cancel</button>{/if}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<section>
  <h2>Frames</h2>
  {#each [...$queue.jobs].reverse().filter((r) => r.jobs.some((s) => s.results.length)) as r (r.id)}
    <h3>{r.label} <small>{short(r.id)}</small></h3>
    {#each r.jobs.filter((s) => s.results.length) as s (s.id)}
      <div class="frames" data-testid="frames">
        {#each s.results as f (f.label + f.sha)}
          <figure><BlobImg sha={f.sha} scale={2} title={`${f.label} ${f.w}x${f.h}`} /><figcaption>{f.label} {f.w}×{f.h}</figcaption></figure>
        {/each}
      </div>
    {/each}
  {/each}
</section>

<style>
  section { margin: 1rem 0; }
  table { border-collapse: collapse; font-size: 0.8rem; }
  td, th { border: 1px solid #8884; padding: 0.2rem 0.4rem; vertical-align: top; text-align: left; }
  tr.failed, tr.lost { background: #f003; }
  tr.done { background: #0a01; }
  tr.running, tr.submitting { background: #fa02; }
  .err { color: #c33; max-width: 40rem; }
  .note { font-size: 0.8rem; opacity: 0.8; }
  .frames { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  figure { margin: 0; text-align: center; font-size: 0.7rem; }
</style>
