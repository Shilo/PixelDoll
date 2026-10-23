<script lang="ts">
  // B10 (T1 P1-1): a worn item without frames for the shown view would silently vanish. Say so, with one action to fix it.
  import { missingAt, moveDirs } from '../lib/dress/dress.ts'
  import { posable, poseGens } from '../lib/items/run.ts'
  import { groupOf } from './model.ts'
  import { ui, doc, store, isDemo, moving, startMove, withKey, openNewItem, openItemExtension, extensionPreparing } from './state.svelte.ts'
  import { TriangleAlert } from './icons.ts'
  import { default as ApiPeek } from './ApiPeek.svelte'
  import { movePlan } from './apiPlans.ts'

  const m = $derived(store.project?.manifest)
  const anim = $derived(m?.rig.animations.find((a) => a.id === ui.anim))
  const missing = $derived.by(() => {
    if (!m || !anim) return []
    const views = ui.all ? moveDirs(m, anim.id) : [ui.dir]
    return [...new Set(views.flatMap((d) => missingAt(m, doc.items, anim.id, d)))]
  })
  const move = $derived(anim ? anim.id[0].toUpperCase() + anim.id.slice(1).replace(/-/g, ' ') : '')
  // own skeleton-rig items that have none of this move can be posed onto it (Add a move, items only)
  const pose = $derived(m && anim ? posable(m).filter((i) => !i.design && missing.includes(i) && !i.layers.some((l) => l.cells?.[anim.id])) : [])
  const shared = $derived(missing.find((i) => i.design))
  const cost = $derived(m && anim ? poseGens(pose.length, anim.cells, m.rig.directions.filter((d) => !d.mirrorOf).length) : 0)
  const remake = $derived(missing.find((i) => !i.design && i.prompt))
  const busy = $derived(!!moving.spec && moving.projectId === doc.id && moving.spec.id === anim?.id && !moving.done && !moving.error)

  function makePose() {
    const spec = { id: anim!.id, frames: anim!.cells, items: pose.map((i) => i.id), seed: 1 + Math.floor(Math.random() * 1_000_000) }
    withKey(() => { void startMove(doc.id, spec); ui.sheet = 'move' }, true)
  }
</script>

{#if missing.length}
  <div class="stage-note" role="status">
    <TriangleAlert size={14} />
    <span>{missing.map((i) => i.name).join(', ')} {missing.length > 1 ? "aren't" : "isn't"} made for {move}{ui.all ? '' : ` facing ${ui.dir}`} yet</span>
    {#if busy}
      <button class="btn sm" onclick={() => (ui.sheet = 'move')}><span class="ring spin" aria-hidden="true"></span>Making…</button>
    {:else if isDemo()}
      <button class="btn sm" onclick={() => (ui.sheet = 'create')}>Make your own</button>
    {:else if shared}
      <button class="btn sm" disabled={extensionPreparing(shared.id)} onclick={() => openItemExtension(shared.id, [anim!.id])}>{extensionPreparing(shared.id) ? 'Checking fit…' : 'Review equipment fit'}</button>
    {:else if pose.length === missing.length}
      <span class="api-action"><ApiPeek scope="equipment-missing-move" label="Make missing equipment frames" plan={m && anim ? movePlan({ manifest: m }, { id: anim.id, frames: anim.cells, items: pose.map(i => i.id) }) : []} /><button class="btn sm primary" disabled={!!moving.spec && !moving.done} onclick={makePose}>Make it <span class="cost">{cost} gens</span></button></span>
    {:else if remake}
      <button class="btn sm" onclick={() => withKey(() => openNewItem(groupOf(remake.slot).id, { slot: remake.slot, prompt: remake.prompt }))}>Make it again…</button>
    {/if}
  </div>
{/if}
