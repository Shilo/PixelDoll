<script lang="ts">
  import { assessDesign, listDesigns, removeDesign, exportDesign, importDesign, type EquipmentDesign, type FitAssessment } from '../lib/equipment/index.ts'
  import { MAX_ZIP_BYTES } from '../lib/store/zip.ts'
  import { ui, doc, store, toast, isDemo, equipment } from './state.svelte.ts'
  import { slotLabel } from './model.ts'
  import DesignThumb from './DesignThumb.svelte'
  import { Bookmark, Download, Plus, Trash, TriangleAlert } from './icons.ts'

  let designs = $state.raw<EquipmentDesign[]>([])
  let assessments = $state.raw<Record<string, FitAssessment>>({})
  let assessmentErrors = $state.raw<Record<string, string>>({})
  let loading = $state(true)
  let error = $state('')
  let busy = $state('')
  let removing = $state('')
  let file: HTMLInputElement
  const targetId = doc.id
  const target = store.project
  const labels = { ready: 'Ready', fit: 'Needs fitting', setup: 'Needs setup', unsupported: 'Not supported yet' } as const
  async function load() {
    loading = true
    try {
      designs = await listDesigns()
      if (target) {
        const checked = await Promise.allSettled(designs.map((d) => assessDesign(d, target)))
        assessments = {}; assessmentErrors = {}
        checked.forEach((result, i) => {
          if (result.status === 'fulfilled') assessments[designs[i].id] = result.value
          else assessmentErrors[designs[i].id] = result.reason instanceof Error ? result.reason.message : 'This design could not be checked.'
        })
      }
    } catch (e) { error = e instanceof Error ? e.message : 'Could not load shared designs.' }
    finally { loading = false }
  }
  $effect(() => { void load() })
  async function download(design: EquipmentDesign) {
    busy = design.id; error = ''
    try {
      const bytes = await exportDesign(design)
      const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
      const a = document.createElement('a'); a.href = url; a.download = `${design.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'equipment'}.pixeldoll-design.zip`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      toast('Downloaded shared design')
    } catch (e) { error = e instanceof Error ? e.message : 'Could not export this design.' }
    finally { busy = '' }
  }
  async function importFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0]
    if (!f) return
    busy = 'import'; error = ''
    try { if (f.size > MAX_ZIP_BYTES) throw new Error('Choose a ZIP smaller than 64 MB.'); await importDesign(new Uint8Array(await f.arrayBuffer())); await load(); toast('Imported shared design') }
    catch (e) { error = e instanceof Error ? e.message : 'Could not import this design.' }
    finally { busy = ''; file.value = '' }
  }
  async function remove(id: string) {
    busy = id; error = ''
    try { await removeDesign(id); removing = ''; await load(); toast('Deleted design. Fitted copies were kept.') }
    catch (e) { error = e instanceof Error ? e.message : 'Could not delete this design.' }
    finally { busy = '' }
  }
  function choose(design: EquipmentDesign, mode: 'copy' | 'fit') {
    if (doc.id !== targetId) { error = 'The open character changed. Close and reopen New item to choose its design.'; return }
    equipment.previewDesign = null; ui.designId = design.id; ui.designMode = mode; ui.fitId = ''; ui.sheet = 'fitdesign'
  }
</script>

<div class="library">
  <div class="field-row"><p class="muted small">Shared designs stay in this browser. Each fitted copy has its own colours, moves and outfit choices.</p><button class="bu-action btn sm" data-variant="outline" disabled={!!busy} onclick={() => file.click()}><Plus size={14} />Import design</button></div>
  <input class="file" type="file" accept=".zip,application/zip" bind:this={file} onchange={importFile} aria-label="Import shared design zip" />
  {#if error}<p class="notice bad small" role="alert"><TriangleAlert size={14} />{error}</p>{/if}
  {#if loading}<p class="muted" role="status">Checking shared designs…</p>
  {:else if !designs.length}<p class="empty"><Bookmark size={24} />No saved designs yet. Select an item and choose “Save as shared design”, or import a .pixeldoll-design.zip.</p>
  {:else}
    <div class="designs">
      {#each designs as design (design.id)}
        {@const assessment = assessments[design.id]}
        <article class="design-card">
          <div class="field-row"><DesignThumb {design} /><div class="identity"><h3>{design.name}</h3><span class="faint small">{slotLabel(design.slot)}</span></div><span class="badge">{isDemo() ? 'Copy demo first' : assessment ? labels[assessment.status] : 'Unavailable'}</span></div>
          {#if assessment}<p class="muted small">{assessment.reasons[0] ?? (assessment.status === 'ready' ? 'Matches this character. Review a free copy before keeping it.' : '')}</p>{/if}
          {#if assessment?.canCopy && assessment.missingCells}<p class="faint small">{assessment.freeCells} frames can be copied free; {assessment.missingCells} target frames still need fitting.</p>{/if}
          {#if assessmentErrors[design.id]}<p class="notice warn small">{assessmentErrors[design.id]}</p>{/if}
          {#if removing === design.id}
            <p class="small">Delete this design? Fitted copies on characters and their outfits stay intact.</p><div class="actions"><button class="bu-action btn danger" data-variant="outline" disabled={!!busy} onclick={() => remove(design.id)}>Delete design</button><button class="bu-action btn plain" data-variant="quiet" disabled={!!busy} onclick={() => (removing = '')}>Keep design</button></div>
          {:else}
            <div class="actions">
              {#if assessment?.canCopy}<button class="bu-action btn primary sm" data-variant="primary" disabled={!!busy || isDemo()} onclick={() => choose(design, 'copy')}>{assessment.missingCells ? 'Review available copy' : 'Review free copy'} <span class="cost">Free</span></button>{/if}
              {#if assessment?.status !== 'ready'}<button class="bu-action btn sm" data-variant="outline" class:primary={!assessment?.canCopy} disabled={!!busy || isDemo() || !assessment} onclick={() => choose(design, 'fit')}>{assessment?.canCopy ? 'Fit missing frames' : 'View fit'}</button>{/if}
              <button class="bu-action btn sm" data-variant="outline" aria-label="Export {design.name} design" disabled={!!busy} onclick={() => download(design)}><Download size={14} />Export</button><button class="bu-action btn icon plain danger" data-variant="quiet" aria-label="Delete {design.name} design" disabled={!!busy} onclick={() => (removing = design.id)}><Trash size={14} /></button>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .file { display: none; }
  .field-row { gap: 12px; }
  .field-row > p { flex: 1; }
  .field-row > .btn { flex: none; }
  .designs { display: grid; gap: 12px; }
  .design-card { border: 1px solid var(--line); border-radius: var(--r-card); padding: 14px; }
  h3 { margin: 0 0 4px; font-size: var(--fs-md); }
  .identity { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .empty { display: grid; justify-items: center; gap: 12px; padding: 24px; text-align: center; color: var(--text-2); }
  @media (max-width: 400px) { .field-row { flex-wrap: wrap; } }
</style>
