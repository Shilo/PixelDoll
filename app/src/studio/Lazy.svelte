<script lang="ts">
  // A component whose code loads the first time it shows (sheets, the generation card), not at startup. A failed chunk load
  // says so and, for a sheet, closes it instead of leaving an invisible sheet open.
  import type { Component } from 'svelte'
  import { ui, toast } from './state.svelte.ts'
  import { lazy } from '../lib/lazy.ts'
  type AnyComponent = Component<any> // each component has its own props
  let { load, sheet = true, ...props }: { load: () => Promise<{ default: AnyComponent }>; sheet?: boolean; [prop: string]: unknown } = $props()
  let Loaded = $state.raw<AnyComponent>()
  $effect(() => {
    let live = true
    lazy(load).then((m) => { if (live) Loaded = m.default }, (e: Error) => {
      if (!live) return
      if (sheet) ui.sheet = null
      toast(e.message)
    })
    return () => { live = false }
  })
</script>

{#if Loaded}<Loaded {...props} />{/if}
