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
  const selected = $derived(id === doc.id)
  $effect(() => {
    const key = id
    project = null; items = {}
    if (selected) return // The selected character already uses the live project below.
    const controller = new AbortController()
    void openSource(key, controller.signal).then(r => {
      if (controller.signal.aborted) return
      const outfit = r.current ?? r.project.manifest.presets[0]
      project = recolor(r.project, outfit?.variants ?? {}); items = outfit?.items ?? {}
    }).catch((error: unknown) => { if (!controller.signal.aborted) console.warn('Could not load character thumbnail', key, error) })
    return () => controller.abort()
  })
  const p = $derived(selected ? view.project : project)
  const outfit = $derived(selected ? doc.items : items)
  const assets=$derived(p?buildPresentation(p):null)
  const rendered=$derived(assets?renderPresentation(assets,outfit,southStill(assets)):null)
  const frame=$derived(rendered?.frame)
  const img=$derived(rendered?.image??null)
</script>
<span class="character-thumbnail" aria-hidden="true"><Sprite {img} k={Math.max(1,Math.floor(size/(frame?.h??64)*ui.dpr))} limit={size} label={name} /></span>
