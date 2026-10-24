<script lang="ts">
  import { openSource } from '../../lib/dress/project.ts'
  import { recolor } from '../../lib/dress/dress.ts'
  import { buildPresentation,southStill,renderPresentation } from './presentation.ts'
  import type { Project, Preset } from '../../lib/store/manifest.ts'
  import Sprite from '../Sprite.svelte'
  import { doc, view, ui, store } from '../state.svelte.ts'
  let { id, name, size = 64 }: { id:string; name:string; size?:number } = $props()
  let project = $state.raw<Project | null>(null)
  let rawProject = $state.raw<Project | null>(null)
  let variants = $state<Preset['variants']>({})
  let items = $state<Preset['items']>({})
  $effect(() => {
    const key = id; let alive = true
    void openSource(key).then(r => { if (alive) { const outfit=r.current ?? r.project.manifest.presets[0]; rawProject=r.project; variants=outfit?.variants??{}; project=recolor(r.project, variants); items=outfit?.items ?? {} } }).catch(() => {})
    return () => { alive=false }
  })
  const p = $derived(id===doc.id ? view.project : project)
  const outfit = $derived(id===doc.id ? doc.items : items)
  const assets=$derived(p?buildPresentation(p,{sourceProject:(id===doc.id?store.project:rawProject)??undefined,variants:id===doc.id?doc.variants:variants}):null)
  const rendered=$derived(assets?renderPresentation(assets,outfit,southStill(assets)):null)
  const frame=$derived(rendered?.frame)
  const img=$derived(rendered?.image??null)
</script>
<span class="character-thumbnail" aria-hidden="true"><Sprite {img} k={Math.max(1,Math.floor(size/(frame?.h??64)*ui.dpr))} limit={size} label={name} /></span>
