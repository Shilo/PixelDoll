<script lang="ts">
  // B10 (T1 P1-1): a worn item without frames for the shown view would silently vanish. Say so, with one action to fix it.
  import { missingAt, moveDirs } from '../lib/dress/dress.ts'
  import type { DirectionName, Item } from '../lib/store/manifest.ts'
  import { posable } from '../lib/items/run.ts'
  import { itemMoveOffer } from './create.ts'
  import { groupOf } from './model.ts'
  import { ui, doc, store, isDemo, moving, queueMoves, withKey, openNewItem, openItemExtension, extensionPreparing } from './state.svelte.ts'
  import { TriangleAlert } from './icons.ts'
  import { default as ApiPeek } from './ApiPeek.svelte'
  import { movePlan } from './apiPlans.ts'

  const m = $derived(store.project?.manifest)
  const anim = $derived(m?.rig.animations.find((a) => a.id === ui.anim))
  const views = $derived(m && anim ? ui.all ? moveDirs(m, anim.id) : [ui.dir] : [])
  const missing = $derived.by(() => {
    if (!m || !anim) return []
    return [...new Set(views.flatMap((d) => missingAt(m, doc.items, anim.id, d)))]
  })
  const move = $derived(anim ? anim.id[0].toUpperCase() + anim.id.slice(1).replace(/-/g, ' ') : '')
  // A partial replacement may leave other directions intact; only missing views need paid posing.
  function missingDirs(item: Item): DirectionName[] {
    if (!m || !anim) return []
    return [...new Set(views.filter((dir) => missingAt(m!, { [item.slot]: item.id }, anim!.id, dir).some((i) => i.id === item.id)).map((dir) => m!.rig.directions.find((d) => d.id === dir)?.mirrorOf ?? dir))]
  }
  const pose = $derived(m && anim ? posable(m).filter((i) => !i.design && missing.includes(i) && missingDirs(i).length) : [])
  const targetDirs = $derived([...new Set(pose.flatMap(missingDirs))])
  const poseOffer = $derived(m && anim && pose.length ? itemMoveOffer(m, [{ id: anim.id, frames: anim.cells, items: pose.map(i => i.id), dirs: [...targetDirs], itemsOnly: true, seed: 0 }]) : null)
  const poseSpec = $derived(poseOffer?.specs[0])
  const shared = $derived(missing.find((i) => i.design))
  const remake = $derived(missing.find((i) => !i.design && i.prompt))
  const busy = $derived(!!moving.spec && moving.projectId === doc.id && moving.spec.id === anim?.id && !moving.done && !moving.error)

  function makePose() {
    if (!poseSpec) return
    const projectId = doc.id
    const spec = { ...$state.snapshot(poseSpec), seed: 1 + Math.floor(Math.random() * 1_000_000) }
    withKey(() => { void queueMoves(projectId, [spec]); ui.sheet = 'move' }, true)
  }
</script>

{#if missing.length}
  <div class="stage-note" role="status">
    <TriangleAlert size={14} />
    <span>{missing.map((i) => i.name).join(', ')} {missing.length > 1 ? "aren't" : "isn't"} made for {move}{ui.all ? '' : ` facing ${ui.dir}`} yet</span>
    {#if busy}
      <button class="bu-action btn sm" data-variant="outline" onclick={() => (ui.sheet = 'move')}><span class="ring spin" aria-hidden="true"></span>Making…</button>
    {:else if isDemo()}
      <button class="bu-action btn sm" data-variant="outline" onclick={() => (ui.sheet = 'create')}>Make your own</button>
    {:else if shared}
      <button class="bu-action btn sm" data-variant="outline" disabled={extensionPreparing(shared.id)} onclick={() => openItemExtension(shared.id, [anim!.id])}>{extensionPreparing(shared.id) ? 'Checking fit…' : 'Review equipment fit'}</button>
    {:else if pose.length === missing.length}
      <span class="api-action"><ApiPeek scope="equipment-missing-move" label="Make missing equipment frames" plan={m && poseSpec ? movePlan({ manifest: m }, poseSpec) : []} /><button class="bu-action btn sm primary" data-variant="primary" disabled={!!moving.spec && !moving.done || !poseSpec} onclick={makePose}>Make it <span class="cost">{poseOffer?.gens == null ? 'Unavailable' : `Est. ${poseOffer.gens} gens`}</span></button></span>
      {#if poseOffer?.error}<span role="status">{poseOffer.error}</span>{/if}
    {:else if remake}
      <button class="bu-action btn sm" data-variant="outline" onclick={() => withKey(() => openNewItem(groupOf(remake.slot).id, { slot: remake.slot, prompt: remake.prompt }))}>Make it again…</button>
    {/if}
  </div>
{/if}
