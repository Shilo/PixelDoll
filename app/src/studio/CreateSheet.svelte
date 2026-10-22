<script lang="ts">
  import Sheet from './Sheet.svelte'
  import { formDrafts } from './formDrafts.ts'
  import Sprite from './Sprite.svelte'
  import { composeCell } from '../lib/compose/compose.ts'
  import { loadProject } from '../lib/store/project.ts'
  import type { Project } from '../lib/store/manifest.ts'
  import { SIZES, STEPS, estimate } from './create.ts'
  import { nameFrom } from './model.ts'
  import { ui, creating, startCreate, cancelCreate, openProject, withKey } from './state.svelte.ts'
  import { Check, ChevronRight, CircleAlert, TriangleAlert } from './icons.ts'
  import { SKIN_TONES } from '../lib/dress/dress.ts'

  const SKIN_WORDS = ['deep brown', 'brown', 'tan', 'light tan', 'light', 'pale']
  const BUILDS = ['slim', 'average', 'stocky']
  const draft = formDrafts.character
  let desc = $state(draft?.desc ?? '')
  let skin = $state(draft?.skin ?? -1)
  let build = $state(draft?.build ?? 'average')
  let name = $state(draft?.name ?? '')
  let seed = $state(draft?.seed ?? 1 + Math.floor(Math.random() * 1_000_000))
  // B15: More options. 4 directions (S/E/N + W mirrored) or 8 (S/SE/E/NE/N + SW/W/NW mirrored); body 48 or 56 px in the 64 cell
  let dirs = $state<4 | 8>(draft?.dirs ?? 4)
  let size = $state<(typeof SIZES)[number]>(draft?.size ?? 48)
  // a running create shows the price of what it is making, the form the price of the current choice
  const est = $derived(estimate(creating.spec?.dirs ?? dirs))
  // T1 P2-13: the estimate is the no-re-roll price; a real create measured 45.45 (B7), so show a range up to +30 %
  const lo = $derived(Math.round(est.gens)), hi = $derived(Math.ceil((est.gens * 1.3) / 5) * 5)
  const facing = $derived(dirs === 8 ? 'all 8 directions (the 3 facing west are mirrored)' : 'south, east, north and west (west is mirrored)')
  const full = $derived([desc.trim() || 'a human adventurer', build !== 'average' ? `${build} build` : '', skin >= 0 ? `${SKIN_WORDS[skin]} skin` : ''].filter(Boolean).join(', '))

  const running = $derived(!!creating.spec && !creating.projectId && !creating.error)
  const stepIx = $derived(STEPS.findIndex((s) => s.id === creating.progress?.step))
  let result = $state.raw<Project | null>(null)
  $effect(() => { if (creating.projectId) void loadProject(creating.projectId).then((r) => (result = r.project)) })
  let frame = $state(0)
  $effect(() => { const t = setInterval(() => frame++, 110); return () => clearInterval(t) })
  const k = $derived(Math.max(1, Math.floor(ui.dpr * (ui.size === 'compact' ? 1.25 : 2))))

  function go() {
    formDrafts.character = { desc, skin, build, name, seed, dirs, size }
    const spec = { description: full, name: name.trim() || nameFrom(desc || 'Adventurer'), seed, size, dirs }
    withKey(() => { formDrafts.character = undefined; void startCreate(spec); ui.sheet = 'create' }) // back to the progress after Connect
  }
  async function open() {
    const id = creating.projectId
    await cancelCreate()
    ui.sheet = null
    ui.welcome = false
    await openProject(id)
  }
  const plain = (w: string) => w.replace(/^\w+\/\w+: /, '').replace(/feet drift (\d+) px.*/, 'feet move up to $1 px while walking').replace(/headroom (\d+) px.*/, 'little room above the head ($1 px): tall hats may be cut off')
</script>

<Sheet title="New character" cancel={running ? 'Hide' : creating.projectId ? 'Close' : 'Cancel'} onclose={() => (ui.sheet = null)} wide>
  {#if creating.projectId}
    <div class="create-review">
      <h3 style="font-size:var(--fs-title)">{creating.spec?.name} is ready</h3>
      {#if result}
        {@const a = result.manifest.rig.animations.find((x) => x.id === 'walk') ?? result.manifest.rig.animations[0]}
        <div class="review-grid">
          {#each result.manifest.rig.directions as d (d.id)}
            <figure><Sprite img={composeCell(result, {}, a.id, d.id, a.frames[frame % a.frames.length].cell)} {k} checker label="{creating.spec?.name} walking {d.id}" />{d.id[0].toUpperCase() + d.id.slice(1)}</figure>
          {/each}
        </div>
      {/if}
      {#if creating.warnings.length}
        <ul class="reasons small" style="text-align:left">{#each creating.warnings.slice(0, 4) as w (w)}<li><TriangleAlert size={12} />{plain(w)}</li>{/each}</ul>
      {/if}
    </div>
  {:else if running || creating.error}
    <div class="form">
      <p style="font-weight:600">{creating.spec?.name}</p>
      <ol class="steps-list">
        {#each STEPS as s, i (s.id)}
          <li class:done={i < stepIx} class:now={i === stepIx}>
            {#if i < stepIx}<Check size={16} />{:else if i === stepIx && !creating.error}<span class="ring spin" aria-hidden="true"></span>{:else}<span class="dot" aria-hidden="true"></span>{/if}
            {s.label}{#if i === stepIx && creating.progress && creating.progress.total > 1}<span class="muted num small">&nbsp;{creating.progress.done}/{creating.progress.total}</span>{/if}
          </li>
        {/each}
      </ol>
      {#if creating.error}
        <p class="notice bad small"><CircleAlert size={14} />{creating.error.includes('5000') || /policy/i.test(creating.error) ? 'PixelLab declined this description. Try different words.' : creating.error}</p>
      {:else}
        <p class="muted small">This takes about {est.minutes} minutes. You can close this sheet, keep dressing up the demo or even close the tab: it picks up where it left off.</p>
      {/if}
    </div>
  {:else}
    <div class="form">
      <p class="muted">Describe the body. Clothes, hair and gear come later, as separate items you can swap.</p>
      <label class="field">
        <span class="label">Who is it?</span>
        <textarea class="input" rows="2" bind:value={desc} placeholder="a stocky dwarf with a friendly face" maxlength="300"></textarea>
      </label>
      <div class="field">
        <span class="label" id="skin">Skin</span>
        <div class="dots" role="radiogroup" aria-labelledby="skin">
          <button class="dot-swatch none" role="radio" aria-checked={skin < 0} onclick={() => (skin = -1)}>Any</button>
          {#each SKIN_TONES as c, i (c)}<button class="dot-swatch" role="radio" aria-checked={skin === i} aria-label="{SKIN_WORDS[i]} skin" style:background={c} onclick={() => (skin = i)}></button>{/each}
        </div>
      </div>
      <div class="field">
        <span class="label" id="build">Build</span>
        <div class="seg" role="radiogroup" aria-labelledby="build" style="align-self:flex-start">
          {#each BUILDS as b (b)}<button role="radio" aria-checked={build === b} onclick={() => (build = b)}>{b[0].toUpperCase() + b.slice(1)}</button>{/each}
        </div>
      </div>
      <p class="muted small">You get idle and walk, facing {facing}, as 64 × 64 pixel sprites.</p>
      <details class="disclosure">
        <summary><ChevronRight size={14} />More options</summary>
        <div>
          <div class="field">
            <span class="label small" id="c-dirs">Directions</span>
            <div class="seg" role="radiogroup" aria-labelledby="c-dirs" style="align-self:flex-start">
              {#each [4, 8] as const as n (n)}<button role="radio" aria-checked={dirs === n} onclick={() => (dirs = n)}>{n}</button>{/each}
            </div>
            <span class="faint small">{dirs === 8 ? 'Diagonals too, for 8-way movement. Costs more and takes longer.' : 'Up, down, left and right. Enough for most games.'}</span>
          </div>
          <div class="field">
            <span class="label small" id="c-size">Body size</span>
            <div class="seg" role="radiogroup" aria-labelledby="c-size" style="align-self:flex-start">
              {#each SIZES as n (n)}<button role="radio" aria-checked={size === n} onclick={() => (size = n)}>{n} px</button>{/each}
            </div>
            <span class="faint small">{size === 56 ? 'A bigger figure with less room above the head for tall hats.' : 'Leaves room above the head for hats and helmets.'} The sprite cell stays 64 × 64.</span>
          </div>
          <label class="field"><span class="label small">Name</span><input class="input" bind:value={name} placeholder={nameFrom(desc || 'Adventurer')} /></label>
          <label class="field"><span class="label small">Seed</span><input class="input" type="number" bind:value={seed} /></label>
          <p class="faint small">create-character-v3 at {size} px, padded to 64 ({size === 48 ? 'x+8, y+12' : 'x+4, y+4'}: 4 px floor) · rest views re-imported for their joints · managed skeleton-v3 walk as motion and an authored idle → joints → raw skeleton-v3 on the rest view in {dirs === 8 ? 5 : 3} directions · ≈ {est.gens.toFixed(1)} gens</p>
        </div>
      </details>
    </div>
  {/if}

  {#snippet footer()}
    {#if creating.projectId}
      <span class="foot-note">Saved on this device.</span>
      <button class="btn primary lg" onclick={open}>Start dressing up</button>
    {:else if creating.error}
      <button class="btn plain" onclick={cancelCreate}>Start over</button>
      <button class="btn primary" onclick={() => creating.spec && withKey(() => void startCreate({ ...$state.snapshot(creating.spec!), seed: 1 + Math.floor(Math.random() * 1_000_000) }))}>Try again</button><!-- new seed: the same one re-reads the cached (bad) results (R6 P2-7) -->
    {:else if running}
      <span class="foot-note">Spending {lo}–{hi} gens</span>
      <button class="btn" onclick={() => (ui.sheet = null)}>Keep working</button>
    {:else}
      <span class="foot-note">About {est.minutes} min · {lo}–{hi} gens (failed checks re-roll)</span>
      <button class="btn primary lg" onclick={go}>Create <span class="cost">{lo}–{hi} gens</span></button>
    {/if}
  {/snippet}
</Sheet>
