<script lang="ts">
  // Material swatches: each option is the REAL variant ramp (lib/dress exact index swap), drawn as its color steps.
  import { SWATCHES, materialNames, variantOf, variantRampOf } from '../lib/dress/dress.ts'
  import type { Hex, Material } from '../lib/store/manifest.ts'
  import { doc, store, setVariant, resetColors, randomize } from './state.svelte.ts'
  import { Plus, RotateCcw, Shuffle } from './icons.ts'
  let { only = '', heading = true }: { only?: string; heading?: boolean } = $props()

  const m = $derived(store.project?.manifest)
  const items = $derived(m ? m.items.filter((it) => (only ? it.id === only : it.id === m.rig.baseItem || doc.items[it.slot] === it.id)) : [])
  const matsOf = (id: string) => (m ? m.materials.filter((x) => x.owner === id) : [])
  const chosen = (mat: Material) => (m ? variantOf(m, doc.variants, mat.id) : undefined)
  // names from the item's description/slot ("Metal", "Leather"), also for projects saved with the old hue labels
  // B15: a region-split base names its own materials (Shirt, Shorts, then Skin)
  const namesOf = (it: (typeof items)[number], mats: Material[]) => (it.regions ? mats.map((x) => x.label) : materialNames(it, mats.map((x) => x.ramp)))
  const nameOf = (id?: string) => {
    const mat = m?.materials.find((x) => x.id === id), it = m?.items.find((i) => i.id === mat?.owner)
    return mat && it ? `${it.name} ${namesOf(it, matsOf(it.id))[matsOf(it.id).indexOf(mat)].toLowerCase()}` : mat?.label
  }
  // the picker opens on the color in use (T1 P3), not a fixed gray
  const custom = (mat: Material) => { const v = chosen(mat); return v?.startsWith('#') ? v : (variantRampOf(mat, v ?? '') ?? mat.ramp)[Math.floor(mat.ramp.length / 2)] }
</script>

<div class="colors">
  {#if heading}
    <div class="sec-head">
      <span class="sec-title">{only ? 'Colors' : 'Character colors'}</span>
      {#if !only}
        <span class="actions">
          <button class="bu-action btn sm plain" data-variant="quiet" onclick={randomize} title="Random look"><Shuffle size={14} />Random</button>
          <button class="bu-action btn sm plain" data-variant="quiet" onclick={() => resetColors()} disabled={!Object.keys(doc.variants).length}><RotateCcw size={14} />Reset</button>
        </span>
      {/if}
    </div>
  {/if}
  {#each items as it (it.id)}
    {@const mats = matsOf(it.id)}
    {@const names = namesOf(it, mats)}
    {#if mats.length}
      {#if !only}<p class="mat-name" style="font-weight:600">{it.name}</p>{/if}
      {#each mats as mat, mi (mat.id)}
        {@const pick = chosen(mat)}
        <div class="mat">
          <span class="muted small">{names[mi]}</span>
          {#if mat.linkTo}
            <span class="faint small">Follows {nameOf(mat.linkTo)}</span>
          {:else}
            <div class="swatches" role="radiogroup" aria-label="{names[mi]} color">
              <button class="swatch" role="radio" aria-checked={!doc.variants[mat.id]} tabindex={!doc.variants[mat.id] || doc.variants[mat.id]?.startsWith('#') ? 0 : -1} title={mat.defaultVariant ? 'Saved color' : 'Original'} aria-label={mat.defaultVariant ? 'Saved color' : 'Original'} onclick={() => setVariant(mat.id, null)}>
                {#each (mat.defaultVariant ? variantRampOf(mat, mat.defaultVariant) ?? mat.ramp : mat.ramp) as c, i (i)}<i style:background={c}></i>{/each}
              </button>
              {#each Object.keys(SWATCHES) as name (name)}
                {@const r = variantRampOf(mat, name)}
                {#if r}
                  <button class="swatch" role="radio" aria-checked={doc.variants[mat.id] === name} tabindex={doc.variants[mat.id] === name ? 0 : -1} title={name} aria-label={name} onclick={() => setVariant(mat.id, name)}>
                    {#each r as c, i (i)}<i style:background={c}></i>{/each}
                  </button>
                {/if}
              {/each}
              <label class="swatch pick" title="Pick any color" style:background={pick?.startsWith('#') ? pick : ''}>
                {#if !pick?.startsWith('#')}<Plus size={14} />{/if}
                <span class="sr">Pick any color</span>
                <input type="color" value={custom(mat)} onchange={(e) => setVariant(mat.id, e.currentTarget.value)} />
              </label>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  {:else}
    <p class="muted">Wear something to change its colors.</p>
  {/each}
</div>
