<script lang="ts">
  import { coverageGaps, moveDirs } from '../lib/dress/dress.ts'
  import { hiddenSlots, equipped } from '../lib/compose/compose.ts'
  import { itemRoute } from './itemRoute.ts'
  import { SLOTS } from '../lib/items/items.ts'
  import Sprite from './Sprite.svelte'
  import Colours from './Colours.svelte'
  import { HEALTH_LABEL, groupOf, healthOf, itemPreviewFrames, slotLabel, plainReason } from './model.ts'
  import { ui, doc, store, view, wear, toggleHide, moveLayer, resetLayer, removeItem, isDemo, openNewItem, withKey, openSaveDesign, openPinnedDesign, openItemExtension, extensionPreparing } from './state.svelte.ts'
  import { ArrowUp, ArrowDown, Bookmark, Check, ChevronRight, CircleCheck, RefreshCw, Trash, TriangleAlert } from './icons.ts'

  let { id }: { id: string } = $props()
  const m = $derived(store.project?.manifest)
  const it = $derived(m?.items.find((i) => i.id === id))
  const on = $derived(!!it && doc.items[it.slot] === it.id)
  const hiddenNow = $derived(m && it ? hiddenSlots(m, equipped(m, doc.items)).has(it.slot) : false)
  const health = $derived(m && it ? healthOf(m, it) : 'demo')
  const anim = $derived(m?.rig.animations.find((a) => a.id === ui.anim))
  const made = $derived(m ? moveDirs(m, ui.anim) : [])
  // Cache a shared crop across every frame and direction, rather than resizing the strip on each playback tick.
  const previews = $derived(view.project && it ? itemPreviewFrames(view.project, it, ui.anim) : [])
  const strip = $derived(previews[ui.frame % previews.length] ?? [])
  const k = $derived(strip.length ? Math.max(1, Math.floor(Math.min(60 / strip[0].w, 72 / strip[0].h, 6) * ui.dpr)) : 1)
  const others = $derived(m && it ? m.slots.filter((s) => s.id !== 'body' && s.id !== it.slot && m.items.some((x) => x.slot === s.id)) : [])
  const hides = $derived(it ? it.hides ?? m?.slots.find((s) => s.id === it.slot)?.hides ?? [] : [])
  const tucks = $derived(it ? (m?.slots.find((s) => s.id === it.slot)?.clips ?? []).filter((s) => others.some((o) => o.id === s) && !hides.includes(s)) : [])
  const gaps = $derived(m && it ? coverageGaps(m, it) : [])
  // B10: views of the shown move this item has no frames for (it would vanish there)
  const moveGaps = $derived(gaps.filter((g) => g.startsWith(`${ui.anim}/`)).map((g) => g.split('/')[1]))
  const moveName = $derived(ui.anim ? ui.anim[0].toUpperCase() + ui.anim.slice(1).replace(/-/g, ' ') : '')
  const gensSpent = $derived(it ? it.provenance.reduce((s, p) => s + (p.usage?.generations ?? 0), 0) : 0)
  const reasons = $derived.by(() => {
    const q = it?.qa
    if (!q || q.unmeasured) return []
    const r: string[] = []
    if (q.minKeyKept < 0.97) r.push('G2')
    if (q.maxKeyOutside > 0.02) r.push('G3')
    if (q.minAreaRatio < 0.5) r.push('G4')
    if (q.maxAreaCV > 0.15) r.push('G5')
    if (q.maxPaletteDist > 15) r.push('G6')
    if (q.clipPx) r.push('G7')
    if (q.handedness === 'switched') r.push('G8')
    return r.map(plainReason)
  })
  let confirmRemove = $state(false)
  let onlyDir = $state(false)
</script>

{#if m && it && view.project}
  <div class="insp-body">
    <header class="insp-head">
      <h2 class="insp-title">{it.name}</h2>
      <p class="insp-sub">
        <span>{groupOf(it.slot).id}{groupOf(it.slot).slots.length > 1 ? ` · ${slotLabel(it.slot)}` : ''}</span>
        {#if health !== 'demo' || isDemo()}<span class="badge {health}">{#if health === 'clean'}<CircleCheck size={12} />{:else if health !== 'demo'}<TriangleAlert size={12} />{/if}{HEALTH_LABEL[health]}</span>{/if}
        {#if hiddenNow}<span class="badge">Hidden by another item</span>{/if}
      </p>
    </header>
    {#if it.design}<p class="muted small">Independent copy of “{it.design.snapshot.name}”. Its colours and outfits belong to this character.</p>{/if}

    {#if anim}
      <div class="dir-strip" style:--preview-width="{Math.max(60, (strip[0]?.w ?? 0) * k / ui.dpr)}px" aria-label="{it.name} in every direction">
        {#each m.rig.directions as d, i (d.id)}
          {#if strip[i] && made.includes(d.id)}<figure><Sprite img={strip[i]} {k} w={strip[i].w} h={strip[i].h} label="{it.name} facing {d.id}" />{d.id.split('-').map((s) => s[0].toUpperCase()).join('')}</figure>{/if}
        {/each}
      </div>
    {/if}

    <div class="actions">
      <button class="btn {on ? '' : 'primary'}" onclick={() => wear(it.id)}>{on ? 'Take off' : 'Wear'}</button>
      {#if it.status === 'accepted' && it.slot !== 'body'}<button class="btn" onclick={() => openSaveDesign(it.id)}><Bookmark size={14} />Save as shared design</button>{/if}
      {#if it.design && !isDemo()}<button class="btn" onclick={() => openPinnedDesign(it.id)}>View saved design</button>{/if}
      {#if it.design && gaps.length && !isDemo()}<button class="btn" disabled={extensionPreparing(it.id)} onclick={() => openItemExtension(it.id)}>{extensionPreparing(it.id) ? 'Checking fit…' : 'Fit missing frames'}</button>{/if}
      {#if !isDemo() && it.prompt && !it.design}
        <button class="btn" onclick={() => withKey(() => openNewItem(groupOf(it.slot).id, { slot: it.slot, prompt: it.prompt }))}><RefreshCw size={14} />Try again</button>
      {/if}
      {#if !isDemo()}
        {#if confirmRemove}
          <button class="btn danger" onclick={() => removeItem(it.id)}><Trash size={14} />Remove for good</button>
          <button class="btn plain" onclick={() => (confirmRemove = false)}>Keep</button>
        {:else}
          <button class="btn plain danger" onclick={() => (confirmRemove = true)}><Trash size={14} />Remove</button>
        {/if}
      {/if}
    </div>

    {#if health === 'look' && reasons.length}
      <ul class="reasons small">{#each reasons as r (r)}<li><TriangleAlert size={12} />{r}</li>{/each}</ul>
    {/if}
    {#if moveGaps.length}<p class="notice warn small"><TriangleAlert size={14} />Not made for {moveName} facing {moveGaps.join(', ')} yet: it is left out there.</p>{/if}
    {#if health === 'stale'}<p class="notice warn small"><TriangleAlert size={14} />Made for another body. It may not line up.</p>{/if}

    <Colours only={it.id} />

    <div class="field">
      <span class="sec-title">Layer order</span>
      <div class="actions">
        <button class="btn sm" onclick={() => moveLayer(it.id, 1, onlyDir)} title="Draw in front of the next layer"><ArrowUp size={14} />Forward</button>
        <button class="btn sm" onclick={() => moveLayer(it.id, -1, onlyDir)} title="Draw behind the previous layer"><ArrowDown size={14} />Backward</button>
        {#if JSON.stringify(m.slots.find((s) => s.id === it.slot)?.zOverrides ?? []) !== JSON.stringify(SLOTS.find((s) => s.id === it.slot)?.zOverrides ?? [])}<button class="btn sm plain" onclick={() => resetLayer(it.id)}>Reset</button>{/if}
      </div>
      <label class="check small"><input type="checkbox" bind:checked={onlyDir} />Only when facing {ui.dir}</label>
    </div>

    {#if others.length}
      <div class="field">
        <span class="sec-title" id="hide-{it.id}">When worn, hide</span>
        <div class="chips" role="group" aria-labelledby="hide-{it.id}">
          {#each others as s (s.id)}
            {@const on = hides.includes(s.id)}
            <button class="chip" aria-pressed={on} onclick={() => toggleHide(it.id, s.id)}>{#if on}<Check size={12} strokeWidth={2.5} />{/if}{slotLabel(s.id)}</button>
          {/each}
        </div>
        <p class="faint small">Checked items are hidden while {it.name} is worn.{#if tucks.length}{" "}Unchecked {tucks.map(slotLabel).join(', ').toLowerCase()} is tucked under it: only what hangs below the brim shows. Check it for hoods and full masks.{/if}</p>
      </div>
    {/if}

    <details class="disclosure">
      <summary><ChevronRight size={14} />Details</summary>
      <div>
        <dl class="kv">
          <dt>Id</dt><dd class="mono">{it.id}</dd>
          <dt>Slot</dt><dd>{it.slot} · {it.layers.map((l) => `${l.id} z${l.z}`).join(', ')}</dd>
          {#if it.prompt}<dt>Prompt</dt><dd>{it.prompt}</dd>{/if}
          {#if it.extractor}<dt>Extractor</dt><dd>{it.extractor}{it.key ? ` · ${it.key} key` : ''}</dd>{/if}
          {#if it.qa}
            <dt>QA</dt><dd>{it.qa.status}</dd>
            {#if it.qa.legacy}<dt>Older checks</dt><dd>{it.qa.legacy.summary ? 'Older move checks are incomplete; totals may include replaced frames.' : 'Checks are incomplete for older moves.'}</dd>{/if}
            {#if it.qa.unmeasured}
              <dt>Measurements</dt><dd>Reused cells were not measured by PixelLab. Aggregate checks are unavailable for this item.</dd>
            {:else}
              <dt>Key kept</dt><dd>{it.qa.minKeyKept} (≥ 0.97)</dd>
              <dt>Key outside</dt><dd>{it.qa.maxKeyOutside} (≤ 0.02)</dd>
              <dt>Area</dt><dd>min {it.qa.minAreaRatio} of median · CV {it.qa.maxAreaCV}</dd>
              <dt>Palette drift</dt><dd>{it.qa.maxPaletteDist} (≤ 15)</dd>
              <dt>Edge px</dt><dd>{it.qa.clipPx}</dd>
              {#if it.qa.handedness}<dt>Hands</dt><dd>{it.qa.handedness}</dd>{/if}
            {/if}
            <dt>Re-rolls</dt><dd>{it.qa.rerolls}</dd>
          {/if}
          <dt>Cost</dt><dd>{gensSpent ? `${+gensSpent.toFixed(1)} gens · ` : ''}{it.provenance.length} PixelLab calls</dd>
          {#if gaps.length}<dt>No frames for</dt><dd>{gaps.join(', ')}</dd>{/if}
          <dt>Route</dt><dd>{itemRoute.label}</dd>
        </dl>
      </div>
    </details>
  </div>
{/if}
