<script lang="ts">
  // B10 (T1 P1-1): a worn item without frames for the shown view would silently vanish. Say so, with one action to fix it.
  import { missingAt, moveDirs } from '../lib/dress/dress.ts'
  import type { DirectionName, Item } from '../lib/store/manifest.ts'
  import { posable, poseGens } from '../lib/items/run.ts'
  import { groupOf } from './model.ts'
  import { ui, doc, store, isDemo, moving, startMove, withKey, openNewItem, openItemExtension, extensionPreparing } from './state.svelte.ts'
  import { TriangleAlert } from './icons.ts'

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
  const cost = $derived(anim ? pose.reduce((sum, i) => sum + poseGens(1, anim.cells, missingDirs(i).length), 0) : 0)
  const shared = $derived(missing.find((i) => i.design))
  const remake = $derived(missing.find((i) => !i.design && i.prompt))
  const busy = $derived(!!moving.spec && moving.projectId === doc.id && moving.spec.id === anim?.id && !moving.done && !moving.error)

  function makePose() {
    const projectId = doc.id
    const spec = { id: anim!.id, frames: anim!.cells, items: pose.map((i) => i.id), dirs: [...targetDirs], seed: 1 + Math.floor(Math.random() * 1_000_000) }
    withKey(() => { void startMove(projectId, spec); ui.sheet = 'move' })
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
      <button class="btn sm primary" disabled={!!moving.spec && !moving.done} onclick={makePose}>Make it <span class="cost">Est. {cost} gens</span></button>
    {:else if remake}
      <button class="btn sm" onclick={() => withKey(() => openNewItem(groupOf(remake.slot).id, { slot: remake.slot, prompt: remake.prompt }))}>Make it again…</button>
    {/if}
  </div>
{/if}
