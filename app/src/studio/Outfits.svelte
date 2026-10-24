<script lang="ts">
  // Saved looks (presets): wardrobe sidebar and the phone's "Outfits" chip share this list.
  import { store, applyPreset, savePreset, deletePreset, sameOutfit } from './state.svelte.ts'
  import { Bookmark, Plus, Trash, X } from './icons.ts'
  const m = $derived(store.project?.manifest)
  let naming = $state(false)
  let outfitName = $state('')
  function saveOutfit() {
    savePreset(outfitName.trim() || `Outfit ${(m?.presets.length ?? 0) + 1}`)
    naming = false
    outfitName = ''
  }
</script>

{#if m}
  <section class="group outfits" aria-labelledby="g-outfits">
    <div class="group-head">
      <span class="glyph" aria-hidden="true"><Bookmark size={16} /></span>
      <h3 id="g-outfits">Outfits</h3>
      <button class="bu-action btn icon plain add" data-variant="quiet" aria-label="Save current look" title="Save current look" onclick={() => (naming = !naming)}><Plus size={16} /></button>
    </div>
    {#if naming}
      <form class="inline-form" onsubmit={(e) => { e.preventDefault(); saveOutfit() }}>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="bu-input input" bind:value={outfitName} placeholder="Outfit name" aria-label="Outfit name" autofocus />
        <button class="bu-action btn sm primary" data-variant="primary" type="submit">Save</button>
        <button class="bu-action btn icon plain" data-variant="quiet" type="button" aria-label="Cancel" onclick={() => (naming = false)}><X size={14} /></button>
      </form>
    {/if}
    <ul class="rows">
      {#each m.presets as p (p.id)}
        <li>
          <button class="row bu-action" data-variant="outline" onclick={() => applyPreset(p)}><span class="row-name">{p.name}</span>{#if sameOutfit(p)}<span class="badge">Current</span>{/if}</button>
          <button class="bu-action btn icon plain sm row-del" data-variant="quiet" aria-label="Delete outfit {p.name}" title="Delete outfit" onclick={() => deletePreset(p.id)}><Trash size={14} /></button>
        </li>
      {:else}
        <li class="faint small" style="padding:4px 8px">Save a look to switch between outfits in your game.</li>
      {/each}
    </ul>
  </section>
{/if}
