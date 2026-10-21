<script lang="ts">
  // Material swatches: each option is the REAL variant ramp (lib/dress exact index swap), drawn as its colour steps.
  import { SWATCHES, variantOf, variantRampOf } from '../lib/dress/dress.ts'
  import type { Hex, Material } from '../lib/store/manifest.ts'
  import { doc, store, setVariant, resetColours, randomize } from './state.svelte.ts'
  import { Plus, RotateCcw, Shuffle } from './icons.ts'
  let { only = '', heading = true }: { only?: string; heading?: boolean } = $props()

  const m = $derived(store.project?.manifest)
  const items = $derived(m ? m.items.filter((it) => (only ? it.id === only : it.id === m.rig.baseItem || doc.items[it.slot] === it.id)) : [])
  const matsOf = (id: string) => (m ? m.materials.filter((x) => x.owner === id) : [])
  const steps = (r: Hex[]) => (r.length <= 5 ? r : [0, 1, 2, 3, 4].map((i) => r[Math.round((i * (r.length - 1)) / 4)]))
  const chosen = (mat: Material) => (m ? variantOf(m, doc.variants, mat.id) : undefined)
  const label = (mat: Material, itemName: string) => {
    const l = mat.label.startsWith(itemName) ? mat.label.slice(itemName.length).trim() : mat.label
    return l ? l[0].toUpperCase() + l.slice(1) : 'Colour'
  }
  const custom = (mat: Material) => { const v = doc.variants[mat.id]; return v?.startsWith('#') ? v : '#808080' }
</script>

<div class="colours">
  {#if heading}
    <div class="sec-head">
      <span class="sec-title">{only ? 'Colours' : 'Everything you wear'}</span>
      {#if !only}
        <span class="actions">
          <button class="btn sm plain" onclick={randomize} title="Random look"><Shuffle size={14} />Random</button>
          <button class="btn sm plain" onclick={() => resetColours()} disabled={!Object.keys(doc.variants).length}><RotateCcw size={14} />Reset</button>
        </span>
      {/if}
    </div>
  {/if}
  {#each items as it (it.id)}
    {@const mats = matsOf(it.id)}
    {#if mats.length}
      {#if !only}<p class="mat-name" style="font-weight:600">{it.name}</p>{/if}
      {#each mats as mat (mat.id)}
        {@const pick = chosen(mat)}
        <div class="mat">
          <span class="muted small">{label(mat, it.name)}</span>
          {#if mat.linkTo}
            <span class="faint small">Follows {m?.materials.find((x) => x.id === mat.linkTo)?.label}</span>
          {:else}
            <div class="swatches" role="radiogroup" aria-label="{label(mat, it.name)} colour">
              <button class="swatch" role="radio" aria-checked={!pick} title="Original" aria-label="Original" onclick={() => setVariant(mat.id, null)}>
                {#each steps(mat.ramp) as c, i (i)}<i style:background={c}></i>{/each}
              </button>
              {#each Object.keys(SWATCHES) as name (name)}
                {@const r = variantRampOf(mat, name)}
                {#if r}
                  <button class="swatch" role="radio" aria-checked={pick === name} title={name} aria-label={name} onclick={() => setVariant(mat.id, name)}>
                    {#each steps(r) as c, i (i)}<i style:background={c}></i>{/each}
                  </button>
                {/if}
              {/each}
              <label class="swatch pick" title="Pick any colour" style:background={pick?.startsWith('#') ? pick : ''}>
                {#if !pick?.startsWith('#')}<Plus size={14} />{/if}
                <span class="sr">Pick any colour</span>
                <input type="color" value={custom(mat)} onchange={(e) => setVariant(mat.id, e.currentTarget.value)} />
              </label>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  {:else}
    <p class="muted">Wear something to change its colours.</p>
  {/each}
</div>
