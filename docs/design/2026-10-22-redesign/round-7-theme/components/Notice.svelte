<script>
  import Info from '@lucide/svelte/icons/info';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  let { tone = 'info', title, children, live = false } = $props();
  const Icon = $derived(({info:Info,warning:TriangleAlert,success:CircleCheck,danger:CircleAlert})[tone]);
</script>
<div class="pd-notice" data-tone={tone} role={live ? tone === 'danger' ? 'alert' : 'status' : undefined}><Icon /><div><strong>{title}</strong>{#if children}<div class="pd-small">{@render children()}</div>{/if}</div></div>
