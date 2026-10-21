<script lang="ts">
  import type { Component } from 'svelte'
  import Studio from './studio/Studio.svelte'

  // Dev-only harness pages (M1-M5, #/selftest; some spend credits). Behind import.meta.env.DEV, so `vite build` drops them.
  type Page = () => Promise<{ default: Component }>
  const pages: Record<string, Page> = import.meta.env.DEV
    ? { '/m1': () => import('./ui/M1.svelte'), '/m2': () => import('./ui/M2.svelte'), '/m3': () => import('./ui/M3.svelte'), '/m4': () => import('./ui/M4.svelte'), '/m5': () => import('./ui/M5.svelte'), '/selftest': () => import('./ui/SelfTest.svelte'), home: () => import('./ui/Home.svelte'), bar: () => import('./ui/TopBar.svelte') }
    : {}
  const current = () => location.hash.replace(/^#/, '') || '/'
  let route = $state(current())
  $effect(() => {
    const on = () => (route = current())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  })
</script>

{#if !import.meta.env.DEV || route === '/' || route === ''}
  <Studio />
{:else}
  {#await Promise.all([pages.bar(), (pages[route] ?? pages.home)()]) then [bar, page]}
    <bar.default />
    <main><page.default /></main>
  {/await}
{/if}
