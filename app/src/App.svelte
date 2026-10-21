<script lang="ts">
  import TopBar from './ui/TopBar.svelte'
  import Home from './ui/Home.svelte'
  import M1 from './ui/M1.svelte'
  import M2 from './ui/M2.svelte'
  import M3 from './ui/M3.svelte'
  import M4 from './ui/M4.svelte'
  import M5 from './ui/M5.svelte'
  import SelfTest from './ui/SelfTest.svelte'
  import Studio from './studio/Studio.svelte'

  const placeholders: Record<string, string> = {}
  const current = () => location.hash.replace(/^#/, '') || '/'
  let route = $state(current())
  $effect(() => {
    const on = () => (route = current())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  })
</script>

{#if route === '/' || route === ''}
  <Studio />
{:else}
<TopBar />
<main>
  {#if route === '/m1'}
    <M1 />
  {:else if route === '/m2'}
    <M2 />
  {:else if route === '/m3'}
    <M3 />
  {:else if route === '/m4'}
    <M4 />
  {:else if route === '/m5'}
    <M5 />
  {:else if route === '/selftest'}
    <SelfTest />
  {:else if placeholders[route]}
    <h1>{placeholders[route]}</h1>
    <p>Not built yet.</p>
  {:else}
    <Home />
  {/if}
</main>
{/if}
