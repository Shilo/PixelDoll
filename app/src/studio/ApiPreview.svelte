<script lang="ts">
  import { onMount } from 'svelte'
  import { beginActivityCall, finishActivityCall } from '../lib/pixellab/activity.ts'
  let { src, activityScope }: { src: string; activityScope?: string } = $props()
  let img: HTMLImageElement
  let source = $state<string | undefined>()
  let call = ''
  onMount(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !source) {
        call = beginActivityCall('GET', src, undefined, { label: 'Character preview', background: true, activityScope }, 'download')
        source = src
        observer.disconnect()
      }
    })
    observer.observe(img)
    return () => { observer.disconnect() }
  })
</script>

<img bind:this={img} src={source} alt="" referrerpolicy="no-referrer" onload={() => { if (call) finishActivityCall(call, null, true) }} onerror={() => { if (call) finishActivityCall(call, null, false) }} />

<style>
  img { width:48px; height:48px; object-fit:contain; image-rendering:pixelated; flex:none; }
</style>
