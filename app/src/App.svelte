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
{#if import.meta.env.DEV && import.meta.env.MODE === 'agent'}
  <!-- inline style: a <style> rule would survive the dead {#if} into the production CSS -->
  <div class="agent-badge" style="position:fixed;left:8px;bottom:8px;z-index:9999;pointer-events:none;padding:2px 8px;border-radius:999px;font:600 11px/1.6 system-ui,sans-serif;color:#000;background:var(--warn,#e8b339);opacity:.9" title="npm run dev:agent: auto-connected with the agent key from .env (AI-agent testing only)">Agent mode</div>
{/if}

