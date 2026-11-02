<script lang="ts">
  import { onMount } from 'svelte'
  import { beginActivityCall, finishActivityCall } from '../lib/pixellab/activity.ts'
  let { src, activityScope }: { src: string; activityScope?: string } = $props()
  let img: HTMLImageElement
  let source = $state<string | undefined>()
  let failed = $state(false)
  let call = ''
  let status: number | null = null
  function finish(ok: boolean) {
    if (call) { finishActivityCall(call, status, ok); call = '' }
    if (!ok) failed = true
  }
  onMount(() => {
    const reads = new AbortController()
    let objectUrl: string | undefined
    let started = false
    async function load() {
      call = beginActivityCall('GET', src, undefined, { label: 'Character preview', background: true, activityScope }, 'download')
      try {
        // Keep signed URLs intact while refreshing mutable artwork without cookies or the browser HTTP cache.
        const response = await fetch(src, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.any([reads.signal, AbortSignal.timeout(120_000)]) })
        status = response.status
        if (!response.ok) throw new Error('Preview download failed')
        const blob = await response.blob()
        if (reads.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        source = objectUrl
      } catch {
        if (!reads.signal.aborted) finish(false)
      }
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !started) {
        started = true
        void load()
        observer.disconnect()
      }
    })
    observer.observe(img)
    return () => {
      observer.disconnect()
      reads.abort()
      if (call) { finishActivityCall(call, status, false); call = '' }
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  })
</script>

<img bind:this={img} src={source} alt="" referrerpolicy="no-referrer" hidden={failed} onload={() => finish(true)} onerror={() => finish(false)} />
{#if failed}<span class="preview-error faint small" role="status">Preview unavailable. Refresh to retry.</span>{/if}

<style>
  img { width:48px; height:48px; object-fit:contain; image-rendering:pixelated; flex:none; }
  .preview-error { width: 48px; flex: none; overflow-wrap: anywhere; }
</style>
