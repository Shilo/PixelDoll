<script lang="ts">
  import { onMount } from 'svelte'
  import Sheet from './Sheet.svelte'
  import { default as ApiPeek } from './ApiPeek.svelte'
  import { fitPlan, fitRetryPlan } from './apiPlans.ts'
  import DesignPreview from './DesignPreview.svelte'
  import { assessDesign, loadDesign, designPreview, prepareCopy, acceptCopy, planFit, createFit, getFit, reviewFit, acceptFit, discardFit, type EquipmentDesign, type FitAssessment, type FitCandidate, type FitDraft, type FitPlan } from '../lib/equipment/index.ts'
  import type { Project } from '../lib/store/manifest.ts'
  import { recolor } from '../lib/dress/dress.ts'
  import { ui, doc, store, equipment, refreshFits, runFitStage, retryFitStage, withKey, flushSave, openProject, toast } from './state.svelte.ts'
  import { CircleCheck, Sparkles, TriangleAlert } from './icons.ts'

  const targetId = doc.id
  const target = store.project
  const designId = ui.designId
  const pinnedDesign = equipment.previewDesign
  const mode = ui.designMode
  let draftId = $state(ui.fitId)
  let design = $state.raw<EquipmentDesign | null>(null)
  let assessment = $state.raw<FitAssessment | null>(null)
  let candidate = $state.raw<FitCandidate | null>(null)
  let draft = $state.raw<FitDraft | null>(null)
  let plan = $state.raw<FitPlan | null>(null)
  let preview = $state.raw<Project | null>(null)
  let reference = $state.raw<Project | null>(null)
  let itemId = $state('')
  let loading = $state(true)
  let busy = $state(false)
  let error = $state('')
  let reviewed = $state(false)
  let mounted = true
  const stage = $derived(draft?.stage)
  const running = $derived(!!draftId && (equipment.running.includes(draftId) || stage === 'rest-running' || stage === 'pose-running'))
  const warnings = $derived([...new Set([...(assessment?.warnings ?? []), ...(design?.warnings ?? []), ...(draft?.warnings ?? [])])])
  const qualityFails = $derived(draft?.qualityFails ?? [])
  const targetName = $derived(store.projects.find((p) => p.id === (draft?.targetId ?? targetId))?.name ?? target?.manifest.name ?? 'character')

  async function refresh(force = false) {
    if (!draftId) return
    const saved = await getFit(draftId)
    if (!force && draft && saved && saved.updatedAt === draft.updatedAt && saved.stage === draft.stage) return
    const result = await reviewFit(draftId)
    if (!mounted) return
    const previous = draft?.updatedAt
    draft = result.draft
    plan = draft.plan
    assessment = draft.plan.assessment
    design = draft.plan.design
    if (!reference) reference = await designPreview(design)
    preview = result.project ? recolor(result.project, draft.candidate?.variants ?? {}) : null
    itemId = result.itemId ?? draft.candidate?.itemId ?? ''
    if (previous !== draft.updatedAt) reviewed = false
  }
  onMount(() => {
    void (async () => {
      try {
        if (draftId) await refresh()
        else if (target && (designId || pinnedDesign)) {
          const loaded = pinnedDesign ? { design: pinnedDesign } : await loadDesign(designId)
          if (!mounted) return
          design = loaded.design
          reference = await designPreview(design)
          assessment = await assessDesign(design, target)
          if (assessment.canCopy && mode === 'copy') {
            candidate = await prepareCopy(design, target)
            preview = recolor(candidate.project, candidate.variants); itemId = candidate.itemId
          } else {
            preview = reference; itemId = design.itemId
            if (assessment.status === 'fit') { await flushSave(); plan = await planFit(design, targetId); assessment = plan.assessment }
          }
        }
      } catch (e) { if (mounted) error = e instanceof Error ? e.message : 'Could not prepare this fit.' }
      finally { if (mounted) loading = false }
    })()
    return () => { mounted = false }
  })
  $effect(() => {
    if (!draftId || !running) return
    const timer = setInterval(() => { void refresh().catch((e: unknown) => { error = e instanceof Error ? e.message : 'Could not refresh this fit.' }) }, 2000)
    return () => clearInterval(timer)
  })
  async function begin() {
    if (!plan || busy) return ''
    busy = true; error = ''
    try {
      const created = await createFit(plan, { previewGens: plan.previewGens, poseGens: 0 })
      draftId = created.id; draft = created; ui.fitId = created.id; ui.designId = ''
      await refreshFits()
      return created.id
    } catch (e) { error = e instanceof Error ? e.message : 'Could not start the fit.' }
    finally { busy = false }
    return ''
  }
  async function paid(stage: 'rest' | 'pose') {
    const budget = plan?.poseGens ?? 0
    const id = draftId || await begin()
    if (!id || !mounted) return
    ui.fitId = id; ui.designId = ''
    withKey(() => {
      ui.sheet = 'fitdesign'
      void runFitStage(id, stage, budget).then(() => { if (mounted) void refresh() })
    }, true)
  }
  async function accept(wear: boolean) {
    if (!reviewed || busy) return
    busy = true; error = ''
    try {
      await flushSave()
      const destination = draft?.targetId ?? targetId
      const id = draftId ? await acceptFit(draftId, wear) : candidate ? await acceptCopy(destination, candidate, { wear }) : ''
      if (!id) throw new Error('There is no reviewed copy to keep.')
      await refreshFits()
      if (!mounted) { toast('Kept your independent fitted copy'); return }
      await openProject(destination, wear ? { wear: id } : undefined)
      if (!mounted) return
      ui.selected = id; ui.inspTab = 'item'; ui.tab = 'wardrobe'; ui.sheet = null
      toast(wear ? 'Kept and wearing your independent fitted copy' : 'Kept an independent copy in your wardrobe')
    } catch (e) { error = e instanceof Error ? e.message : 'Could not keep this copy.' }
    finally { busy = false }
  }
  function retry() {
    const id = draftId, stage = draft?.retryStage, budget = draft?.retryGens
    if (!id || !stage || !budget) return
    ui.fitId = id; ui.designId = ''
    withKey(() => {
      ui.sheet = 'fitdesign'
      void retryFitStage(id, stage, budget).then(() => { if (mounted) void refresh() })
    }, true)
  }
  async function discard() {
    if (!draftId || running) return
    busy = true
    try { await discardFit(draftId); await refreshFits(); if (mounted) ui.sheet = null }
    catch (e) { error = e instanceof Error ? e.message : 'Could not discard this fit.' }
    finally { busy = false }
  }
  function setup() { ui.sheet = 'setup' }
  const title = $derived(design?.name ? `Fit ${design.name}` : 'Fit shared design')
</script>

<Sheet {title} wide cancel={running ? 'Hide' : 'Close'} cancelDisabled={busy} onclose={() => (ui.sheet = null)}>
  {#if loading}<p class="muted" role="status">Checking this design against your character…</p>{/if}
  {#if error}<p class="notice bad small" role="alert"><TriangleAlert size={14} />{error}</p>{/if}
  {#if design && assessment}
    <p class="muted small">{draft ? `A fitted copy for ${targetName}.` : `Independent copy for ${target?.manifest.name ?? 'your character'}.`} The shared design and other characters stay independent.</p>
    {#if running}
      <p class="notice small" role="status"><Sparkles size={16} /><span>{stage === 'pose-running' ? 'Animating the approved fit…' : 'Preparing the rest-pose fit…'} You can hide this window and reopen the fit from Activity. Hiding does not cancel a PixelLab job.</span></p>
    {:else if stage === 'needs-attention'}
      <p class="notice warn small"><TriangleAlert size={16} /><span>{draft?.error || 'This fit needs attention.'} No paid request is retried automatically.</span></p>
    {:else if stage === 'rest-review'}
      <p class="notice small"><CircleCheck size={16} /><span>Review the rest fit in every direction before paying to animate it. Check shape, colors, grip and alignment.</span></p>
      {#if plan?.extension}<p class="muted small">{plan.extension.reuseRest ? 'Reuses this character’s approved standing references for free.' : 'Review the new standing fit before animating.'} Only missing frames of {plan.extension.anims.join(', ')} will be generated; existing item frames and outfit colors stay intact.</p>{/if}
    {:else if stage === 'fit-review' || candidate}
      <p class="notice small"><CircleCheck size={16} /><span>{candidate ? 'Free copy: 0 generations.' : 'Animation is ready.'} Check every move and direction before keeping this copy.</span></p>
      {#if candidate && assessment.missingCells}<p class="notice warn small"><TriangleAlert size={14} /><span>This is a partial copy: {assessment.freeCells} verified frames are included; {assessment.missingCells} target frames have no item. Fitting the missing frames is a separate step.</span></p>{/if}
    {:else if assessment.status === 'ready'}
      <p class="muted small">{mode === 'fit' ? 'The existing frames already match this design. No fitting generations are needed.' : 'Preparing your free copy…'}</p>
    {:else if assessment.status === 'setup'}
      <p class="notice small"><TriangleAlert size={16} /><span>{assessment.reasons.join(' ')}</span><button class="bu-action btn sm" data-variant="outline" onclick={setup}>Set up character</button></p>
    {:else}
      {#each assessment.reasons as reason (reason)}<p class="muted small">{reason}</p>{/each}
      {#if plan}<p class="notice small"><Sparkles size={16} /><span>First preview the fit at rest: up to {plan.previewGens} gens. After you approve it, animate the current moves for up to {plan.poseGens} more gens. Each stage needs your approval.</span></p>{/if}
    {/if}
    {#each warnings as warning (warning)}<p class="notice warn small"><TriangleAlert size={14} />{warning}</p>{/each}
    {#if qualityFails.length}<div class="notice bad small" role="alert"><TriangleAlert size={16} /><div><b>This fit failed its checks and cannot be kept.</b><ul>{#each qualityFails as failure (failure)}<li>{failure}</li>{/each}</ul></div></div>{/if}
    {#if preview && itemId}<DesignPreview project={preview} {itemId} itemOnly={!candidate && stage !== 'fit-review' && stage !== 'rest-review'} />{/if}
    {#if reference && design && (candidate || draft)}<details class="disclosure"><summary>Compare saved design reference</summary><div><DesignPreview project={reference} itemId={design.itemId} itemOnly /></div></details>{/if}
    {#if candidate || stage === 'rest-review' || stage === 'fit-review'}<label class="check review-check"><input type="checkbox" bind:checked={reviewed} />I checked every move and direction shown above.</label>{/if}
    {#if draft}<p class="faint small">Spent: {+draft.spentGens.toFixed(2)} gens{draft.spentUsd && draft.spentUsd > 0 ? ` + $${draft.spentUsd.toFixed(3)}` : ''}. Approved generation estimate: {draft.budget.previewGens} gens for rest fitting + {draft.budget.poseGens} gens for animation.<ApiPeek scope="equipment-fit-current" label="Current equipment fit" plan={[]} queueIds={draft.calls.flatMap(c => c.recId ? [c.recId] : [])} /></p>{/if}
    {#if plan && !candidate}<p class="faint small">PixelLab may bill usage in dollars instead of generations. Actual charges appear in Activity.</p>{/if}
    <div class="actions fit-actions">
      {#if candidate || stage === 'fit-review'}
        <button class="bu-action btn primary" data-variant="primary" disabled={!reviewed || busy || running || !!qualityFails.length} onclick={() => accept(true)}>Keep and wear</button><button class="bu-action btn" data-variant="outline" disabled={!reviewed || busy || running || !!qualityFails.length} onclick={() => accept(false)}>Keep in wardrobe</button>
      {:else if stage === 'rest-review'}
        <span class="api-action"><ApiPeek scope="equipment-fit-animate" label="Animate approved fit" plan={fitPlan(plan, 'pose', undefined, false, target?.manifest)} /><button class="bu-action btn primary" data-variant="primary" disabled={!reviewed || busy || running || !!qualityFails.length} onclick={() => paid('pose')}>Animate fit <span class="cost">up to {plan?.poseGens} gens</span></button></span>
      {:else if stage === 'needs-attention' && draft?.resumeStage}
        <span class="api-action"><ApiPeek scope="equipment-fit-resume" label="Continue checking submitted fit" plan={fitPlan(plan, draft.resumeStage, draft, true)} queueIds={draft.calls.flatMap(c => c.recId ? [c.recId] : [])} /><button class="bu-action btn primary" data-variant="primary" disabled={busy || running} onclick={() => paid(draft!.resumeStage!)}>Continue checking submitted fit <span class="cost">No new charge</span></button></span>
      {:else if !running && plan && assessment.status === 'fit'}
        <span class="api-action"><ApiPeek scope="equipment-fit-preview" label="Preview standing fit" plan={fitPlan(plan, 'rest')} /><button class="bu-action btn primary" data-variant="primary" disabled={busy} onclick={() => paid('rest')}>Preview fit <span class="cost">up to {plan.previewGens} gens</span></button></span>
      {/if}
      {#if draft?.retryStage && draft.retryGens && !running}<span class="api-action"><ApiPeek scope="equipment-fit-retry" label="Retry failed fitting coverage" plan={fitRetryPlan(draft)} /><button class="bu-action btn" data-variant="outline" disabled={busy} onclick={retry}>Try {draft.retryStage === 'rest' ? 'rest fit' : 'failed animation frames'} again <span class="cost">up to {draft.retryGens} additional gens</span></button></span>{/if}
      {#if draftId && !running && stage !== 'accepted'}<button class="bu-action btn plain danger" data-variant="quiet" disabled={busy} onclick={discard}>Discard fit</button>{/if}
    </div>
  {/if}
</Sheet>

<style>
  .review-check { margin: 18px 0; }
  .fit-actions { margin-top: 16px; }
</style>
