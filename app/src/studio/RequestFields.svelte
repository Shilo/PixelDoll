<script lang="ts">
  import RequestFields from './RequestFields.svelte'
  import { ChevronRight, Image } from './icons.ts'

  let { value, path = '', depth = 0 }: { value: unknown; path?: string; depth?: number } = $props()
  const entries: [string, unknown][] = $derived(value && typeof value === 'object' ? Object.entries(value) : [['value', value]])
  const title = (key: string) => /^\d+$/.test(key) ? `Item ${+key + 1}` : key.replace(/[_-]/g, ' ').replace(/^./, (s) => s.toUpperCase())
  const scalar = (v: unknown) => v === null ? 'None' : v === undefined ? 'Not provided' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)
  const group = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object'
  const image = (v: unknown): v is { type: string; base64: string; format?: string } => group(v) && v.type === 'base64' && typeof v.base64 === 'string'
  const size = (v: { base64: string }) => `${Math.ceil(v.base64.length * .75 / 1024)} KB`
</script>

<div class="request-fields" style:--depth={Math.min(depth, 4)}>
  {#each entries as [key, v] (key)}
    {@const fieldPath = path ? `${path}.${key}` : key}
    {#if image(v)}
      <dl class="request-field" title={fieldPath}>
        <dt class="request-key">{title(key)}</dt>
        <dd class="request-value image-value"><Image size={14} aria-hidden="true" />{v.format?.toUpperCase() ?? 'Image'} · {size(v)}<span class="faint">Included in copy</span></dd>
      </dl>
    {:else if group(v)}
      <details class="request-group">
        <summary title={fieldPath}><span class="request-key"><ChevronRight size={12} />{title(key)}</span><span class="request-value faint">{Array.isArray(v) ? `${v.length} items` : `${Object.keys(v).length} fields`}</span></summary>
        <RequestFields value={v} path={fieldPath} depth={depth + 1} />
      </details>
    {:else if typeof v === 'string' && v.length > 150}
      <details class="request-long">
        <summary title={fieldPath}><span class="request-key"><ChevronRight size={12} />{title(key)}</span><span class="request-value">{v.slice(0, 95)}…</span></summary>
        <div class="request-field"><span></span><span class="request-value">{v}</span></div>
      </details>
    {:else}
      <dl class="request-field" title={fieldPath}><dt class="request-key">{title(key)}</dt><dd class="request-value">{scalar(v)}</dd></dl>
    {/if}
  {/each}
  {#if entries.length === 0}<p class="faint small">No fields</p>{/if}
</div>

<style>
  .request-fields { min-width:0; }
  dl, dd { margin:0; }
  .request-field, summary { display:grid; grid-template-columns:minmax(84px, .9fr) minmax(0, 1.6fr); gap:12px; padding:7px 0; align-items:start; }
  .request-field + .request-field, details + details, .request-field + details, details + .request-field { border-top:1px solid var(--line); }
  .request-key { color:var(--text-3); overflow-wrap:anywhere; min-width:0; display:flex; gap:4px; align-items:center; }
  .request-key :global(svg) { flex:none; }
  .request-value { color:var(--text-2); overflow-wrap:anywhere; white-space:pre-wrap; min-width:0; }
  .request-value.faint { color:var(--text-3); }
  .image-value { display:flex; flex-wrap:wrap; gap:5px; align-items:center; }
  .image-value .faint { width:100%; font-size:11px; }
  summary { cursor:pointer; list-style:none; }
  summary::-webkit-details-marker { display:none; }
  details[open] > summary .request-key :global(svg) { transform:rotate(90deg); }
  .request-group > :global(.request-fields) { margin-left:10px; border-left:1px solid var(--line-strong); padding-left:9px; }
  .request-long[open] > summary .request-value { display:none; }
  .request-long[open] .request-field { padding-top:0; }
  @media(max-width:400px) { .request-field, summary { grid-template-columns:minmax(74px, .85fr) minmax(0, 1.5fr); gap:8px; } .request-group > :global(.request-fields) { margin-left:5px; padding-left:5px; } }
</style>
