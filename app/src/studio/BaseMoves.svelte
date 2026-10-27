<script lang="ts">
  // One tap for the moves creation no longer makes (idle and walk), queued behind any running move. Moves loads it lazily;
  // the creator's result screen shows it next to "Start dressing up".
  import { default as ApiPeek } from './ApiPeek.svelte'
  import { movePlan } from './apiPlans.ts'
  import { baseMoveSpecs, isV13, moveEstimate } from './create.ts'
  import * as db from '../lib/store/db.ts'
  import type { Manifest } from '../lib/store/manifest.ts'
  import type { StoredProject } from '../lib/store/project.ts'
  import { doc, pendingMoves, queueMoves, withKey } from './state.svelte.ts'
  import { Plus } from './icons.ts'

  let { projectId, manifest, onadd = () => {} }: { projectId: string; manifest: Manifest; onadd?: () => void } = $props()
  let rec = $state.raw<StoredProject | null>(null)
  $effect(() => { void doc.rev; const id = projectId; void db.get<StoredProject>('projects', id).then((r) => { if (id === projectId) rec = r ?? null }) })
  const pending = $derived(pendingMoves(projectId).map((s) => s.id))
  const specs = $derived(rec && isV13({ ...rec, manifest }) ? baseMoveSpecs(manifest).filter((s) => !pending.includes(s.id)) : [])
  const gens = $derived(Math.ceil(specs.reduce((n, spec) => n + moveEstimate(manifest, spec).gens, 0)))
  const label = $derived(specs.map((s) => s.id).join(' + '))
  function add() {
    const id = projectId, queued = $state.snapshot(specs)
    withKey(() => { void queueMoves(id, queued); onadd() }, true)
  }
</script>

{#if specs.length}
  <span class="api-action base-moves"><ApiPeek scope="moves-base" label="Add {label}" plan={specs.flatMap((spec, i) => movePlan(rec, spec).filter((call) => i === specs.length - 1 || !call.background))} /><button class="bu-action btn" data-variant="outline" onclick={add}><Plus size={16} />Add {label} <span class="cost">Est. {gens} gens</span></button></span>
{/if}
