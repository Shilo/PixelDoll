<script lang="ts">
  import { GROUPS } from './model.ts'
  import { ui, doc, store, view, gens, wear, applyPreset, savePreset, deletePreset, sameOutfit, randomize, openNewItem, genProgress } from './state.svelte.ts'
  import Thumb from './Thumb.svelte'
  import GroupIcon from './GroupIcon.svelte'
  import { Bookmark, Check, Plus, Shuffle, Trash, X } from './icons.ts'
  import { queue } from '../lib/pixellab/queue.ts'

  const m = $derived(store.project?.manifest)
  let naming = $state(false)
  let outfitName = $state('')
  function saveOutfit() {
    const n = outfitName.trim() || `Outfit ${(m?.presets.length ?? 0) + 1}`
    savePreset(n)
    naming = false
    outfitName = ''
  }
</script>

<nav class="wardrobe" aria-label="Wardrobe">
  <div class="side-head">
    <h2 class="side-title">Wardrobe</h2>
    <button class="btn icon plain" aria-label="Random look" title="Random look" onclick={randomize} disabled={!m}><Shuffle size={16} /></button>
  </div>
  {#if m && view.project}
    <div class="side-scroll">
      {#each GROUPS as g (g.id)}
        {@const items = m.items.filter((i) => g.slots.includes(i.slot))}
        {@const pending = gens.filter((x) => x.draft.rigId === doc.id && g.slots.includes(x.input.slot))}
        <section class="group" aria-labelledby="g-{g.id}">
          <div class="group-head">
            <span class="glyph" aria-hidden="true"><GroupIcon group={g.id} size={16} /></span>
            <h3 id="g-{g.id}">{g.id}</h3>
            {#if !items.length && !pending.length}<span class="faint small">None yet</span>{/if}
            <button class="btn icon plain add" aria-label="New {g.id.toLowerCase()} item" title="New {g.id.toLowerCase()} item" onclick={() => openNewItem(g.id)}><Plus size={16} /></button>
          </div>
          {#if items.length || pending.length}
            <ul class="rows">
              {#each items as it (it.id)}
                {@const on = doc.items[it.slot] === it.id}
                <li>
                  <button class="row" class:sel={ui.selected === it.id} aria-pressed={on} onclick={() => wear(it.id)} title={on ? `Take off ${it.name}` : `Wear ${it.name}`}>
                    <span class="thumb-box"><Thumb project={view.project} item={it} size={24} /></span>
                    <span class="row-name">{it.name}</span>
                    <span class="wear" aria-hidden="true">{#if on}<Check size={14} strokeWidth={2.5} />{/if}</span>
                  </button>
                </li>
              {/each}
              {#each pending as x (x.draft.spec.id)}
                {@const p = genProgress(x, $queue.jobs)}
                <li>
                  <button class="row" class:sel={ui.selected === `gen:${x.draft.spec.id}`} onclick={() => (ui.selected = `gen:${x.draft.spec.id}`)}
                    aria-label="{x.input.name}, {p.label}">
                    <span class="thumb-box pending"><span class="ring" class:spin={x.phase === 'running' && !p.pct} style:--p={p.pct}></span></span>
                    <span class="row-name">{x.input.name}</span>
                    <span class="small {x.phase === 'review' ? '' : 'muted'} num" style:color={x.phase === 'review' ? 'var(--accent-text)' : x.phase === 'failed' ? 'var(--bad)' : ''}>{p.short}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/each}

      <section class="group outfits" aria-labelledby="g-outfits">
        <div class="group-head">
          <span class="glyph" aria-hidden="true"><Bookmark size={16} /></span>
          <h3 id="g-outfits">Outfits</h3>
          <button class="btn icon plain add" aria-label="Save current look" title="Save current look" onclick={() => (naming = !naming)}><Plus size={16} /></button>
        </div>
        {#if naming}
          <form class="inline-form" onsubmit={(e) => { e.preventDefault(); saveOutfit() }}>
            <!-- svelte-ignore a11y_autofocus -->
            <input class="input" bind:value={outfitName} placeholder="Outfit name" aria-label="Outfit name" autofocus />
            <button class="btn sm primary" type="submit">Save</button>
            <button class="btn icon plain" type="button" aria-label="Cancel" onclick={() => (naming = false)}><X size={14} /></button>
          </form>
        {/if}
        <ul class="rows">
          {#each m.presets as p (p.id)}
            <li>
              <button class="row" onclick={() => applyPreset(p)}><span class="row-name">{p.name}</span>{#if sameOutfit(p)}<span class="badge">Current</span>{/if}</button>
              <button class="btn icon plain sm row-del" aria-label="Delete outfit {p.name}" title="Delete outfit" onclick={() => deletePreset(p.id)}><Trash size={14} /></button>
            </li>
          {:else}
            <li class="faint small" style="padding:4px 8px">Save a look to switch between outfits in your game.</li>
          {/each}
        </ul>
      </section>
    </div>
  {/if}
</nav>
