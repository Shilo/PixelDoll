<script>
  let { label, hint = '', error = '', children } = $props();
  const id = $props.id();
  const attrs = $derived({ id, 'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined, 'aria-invalid': error ? 'true' : undefined });
</script>
<div class="pd-field">
  <label for={id}>{label}</label>
  {@render children(attrs)}
  {#if error}<p class="pd-error" id="{id}-error">{error}</p>{:else if hint}<p class="pd-small pd-muted" id="{id}-hint">{hint}</p>{/if}
</div>
