<script lang="ts">
  import { openSource } from '../../lib/dress/project.ts'
  import { recolor } from '../../lib/dress/dress.ts'
  import { buildPresentation,southStill,renderPresentation } from './presentation.ts'
  import type { Project, Preset } from '../../lib/store/manifest.ts'
  import Sprite from '../Sprite.svelte'
  import { doc, view, ui } from '../state.svelte.ts'
  let { id, name, size = 64 }: { id:string; name:string; size?:number } = $props()
  let project = $state.raw<Project | null>(null)
  let items = $state<Preset['items']>({})
  $effect(() => {
    const key = id; let alive = true
    void openSource(key).then(r => { if (alive) { const outfit=r.current ?? r.project.manifest.presets[0]; project=recolor(r.project, outfit?.variants ?? {}); items=outfit?.items ?? {} } }).catch(() => {})
    return () => { alive=false }
  })
  const p = $derived(id===doc.id ? view.project : project)
  const outfit = $derived(id===doc.id ? doc.items : items)
  const assets=$derived(p?buildPresentation(p):null)
  const rendered=$derived(assets?renderPresentation(assets,outfit,southStill(assets)):null)
  const frame=$derived(rendered?.frame)
  const img=$derived(rendered?.image??null)
</script>
<span class="character-thumbnail" aria-hidden="true"><Sprite {img} k={Math.max(1,Math.floor(size/(frame?.h??64)*ui.dpr))} limit={size} label={name} /></span>
