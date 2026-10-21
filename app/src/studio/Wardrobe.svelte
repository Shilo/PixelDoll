<script lang="ts">
  import { GROUPS } from './model.ts'
  import { ui, doc, store, view, gens, wear, pick, randomize, openNewItem, genProgress } from './state.svelte.ts'
  import Thumb from './Thumb.svelte'
  import GroupIcon from './GroupIcon.svelte'
  import Outfits from './Outfits.svelte'
  import { Check, Plus, Shuffle } from './icons.ts'
  import { queue } from '../lib/pixellab/queue.ts'

  const m = $derived(store.project?.manifest)
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
                <!-- B10 (T1 P2-1): the row selects (and wears an item that is off); the check is the wear / take-off toggle -->
                <li>
                  <button class="row" class:sel={ui.selected === it.id} aria-current={ui.selected === it.id} onclick={() => pick(it.id)}>
                    <span class="thumb-box" aria-hidden="true"><Thumb project={view.project} item={it} size={24} /></span>
                    <span class="row-name">{it.name}</span>
                  </button>
                  <button class="btn icon plain sm wear" class:on aria-pressed={on} aria-label="Wear {it.name}" title={on ? `Take off ${it.name}` : `Wear ${it.name}`} onclick={() => wear(it.id)}><Check size={14} strokeWidth={2.5} /></button>
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

      <Outfits />
    </div>
  {/if}
</nav>
