<script lang="ts">
  import Sheet from './Sheet.svelte'
  import { customize } from './experience/state.svelte.ts'
  import { default as ApiPeek } from './ApiPeek.svelte'
  import { setupPeekPlan } from './apiPlans.ts'
  import Sprite from './Sprite.svelte'
  import { formDrafts } from './formDrafts.ts'
  import { setupPlan, rigReady, type SetupPlan } from '../lib/rig/setup.ts'
  import * as db from '../lib/store/db.ts'
  import type { StoredProject } from '../lib/store/project.ts'
  import { SETUP_STEPS } from './setup.ts'
  import { ui, doc, store, settingUp, moving, creating, startSetup, setupBusy, dismissSetup, withKey } from './state.svelte.ts'
  import { Check, TriangleAlert } from './icons.ts'
  const m = $derived(store.project?.manifest)
  let rec = $state.raw<StoredProject | null>(null), plan = $state.raw<SetupPlan | null>(null)
  const draft = formDrafts.setup?.projectId === doc.id ? formDrafts.setup : undefined
  let error = $state(''), looks = $state(draft?.looks ?? store.project?.manifest.items.find((i) => i.slot === 'body')?.prompt ?? ''), restAnim = $state(draft?.restAnim ?? '')
  const mine = $derived(settingUp.spec?.projectId === doc.id)
  const active = $derived(mine && !settingUp.done && !settingUp.error)
  const busyElsewhere = $derived((!!settingUp.spec && !settingUp.done && !mine) || (!!moving.spec && !moving.done) || (!!creating.spec && !creating.projectId))
  const ready = $derived(rigReady(rec))
  const step = $derived(SETUP_STEPS.findIndex((s) => s.id === settingUp.progress?.step))
  const preview = $derived(plan?.rest.south ?? (plan && Object.values(plan.rest)[0]) ?? null)
  $effect(() => {
    const p = store.project, selected = restAnim, id = doc.id
    let stale = false
    if (p) void setupPlan(p, selected || undefined).then((p) => { if (!stale) { plan = p; error = '' } }, (e: Error) => { if (!stale) { plan = null; error = e.message } })
    void db.get<StoredProject>('projects', id).then((r) => { if (!stale) rec = r ?? null })
    return () => { stale = true }
  })
  function go() {
    if (!m || !plan || !looks.trim()) return
    const spec = { projectId: doc.id, baseHash: m.rig.baseHash, restAnim: plan.restAnim, looks: looks.trim(), seed: 1 + Math.floor(Math.random() * 2_000_000) }
    formDrafts.setup = { projectId: doc.id, looks, restAnim }
    withKey(() => { if (!setupBusy()) formDrafts.setup = undefined; void startSetup(spec); ui.sheet = 'setup' }, true) // refused (a resumed setup runs): keep the choices
  }
</script>

<Sheet title="Set up character" cancel={active ? 'Hide' : 'Later'} onclose={() => (ui.sheet = null)}>
  {#if mine && settingUp.spec}
    <div class="api-action"><span class="small muted">Rig setup</span><ApiPeek scope="character-setup-progress" label="Current rig setup" plan={setupPeekPlan(plan, settingUp.spec.looks)} activityScope={settingUp.spec.activityScope} /></div>
    {#if settingUp.done}<p class="notice ok"><Check size={16} />Ready. You can add equipment and moves fitted to this character.</p>
    {:else}
      <ol class="steps-list">{#each SETUP_STEPS as s, i (s.id)}<li class:done={i < step} class:now={i === step}>{#if i < step}<Check size={16} />{:else if i === step && !settingUp.error}<span class="ring spin" aria-hidden="true"></span>{:else}<span class="dot" aria-hidden="true"></span>{/if}{s.label}{#if i === step && settingUp.progress}<span class="small faint">{settingUp.progress.done}/{settingUp.progress.total}</span>{/if}</li>{/each}</ol>
    {/if}
    {#if settingUp.error}<p class="notice bad" role="alert"><TriangleAlert size={16} /><span>{settingUp.error}</span></p>{/if}
    {#each settingUp.warnings as warning (warning)}<p class="notice warn small"><TriangleAlert size={14} /><span>{warning}</span></p>{/each}
  {:else}
    {#if ready}<p class="notice ok small"><Check size={16} />This character already has its pose rig. Run setup again only to reconnect its standing views to a different PixelLab account.</p>{/if}
    <p class="muted">Find joints on the frozen body frames, check alignment and colors, and connect the standing views to your PixelLab account. Your existing artwork, equipment and outfits stay aligned.</p>
    <p class="faint small">Pose registration uses a humanoid rig with {m?.rig.view ? `the saved ${m.rig.view} camera` : 'a low top-down camera because no camera was saved'}. Check that this view matches the artwork before starting setup.</p>
    {#if preview}<div class="setup-preview"><Sprite img={preview} k={3} limit={192} label="Standing reference for rig setup" /></div>{/if}
    {#if m}<label class="field"><span class="label">Standing reference</span><select class="bu-input input" bind:value={restAnim} disabled={plan?.fixedRest}><option value="">Choose automatically</option>{#each m.rig.animations as a (a.id)}<option value={a.id}>{a.id}</option>{/each}</select><span class="faint small">{plan?.fixedRest ? 'Saved standing views are retained so existing equipment keyframes stay aligned.' : 'Use a clear standing pose with every direction. The first frame is the reference.'}</span></label>{/if}
    <label class="field"><span class="label">Existing appearance</span><textarea class="bu-input input" rows="3" maxlength="2000" bind:value={looks} placeholder="Describe the body, hair, colors and clothes already in this artwork"></textarea><span class="faint small">This guides new moves. Include existing hair and clothes; setup cannot separate them from the base.</span></label>
    {#if plan}<p class="faint small">{plan.frames.size} unique body frames · {plan.gens} gens estimated. Includes a 0.25-gen account connection. Matching saved measurements are reused.</p>{/if}
    {#each plan?.warnings ?? [] as warning (warning)}<p class="notice warn small"><TriangleAlert size={14} /><span>{warning}</span></p>{/each}
    {#if error}<p class="notice warn small" role="alert"><TriangleAlert size={16} /><span>{error}</span></p>{/if}
    {#if busyElsewhere}<p class="notice small">Finish the other character operation before starting setup.</p>{/if}
  {/if}
  {#snippet footer()}
    {#if mine && settingUp.done}<button class="bu-action btn primary" data-variant="primary" onclick={async () => { await dismissSetup(); customize(); ui.sheet = null }}>Start dressing up</button>
    {:else if mine && settingUp.error}<ApiPeek scope="character-setup-resume" label="Resume rig setup" plan={setupPeekPlan(plan, settingUp.spec?.looks ?? looks)} activityScope={settingUp.spec?.activityScope} /><button class="bu-action btn plain" data-variant="quiet" onclick={dismissSetup}>Dismiss setup</button><span class="api-action"><button class="bu-action btn primary" data-variant="primary" onclick={() => settingUp.spec && withKey(() => void startSetup($state.snapshot(settingUp.spec!)), true)}>Resume setup</button></span>
    {:else if active}<span class="foot-note">You can keep working. Setup resumes after reload.</span><button class="bu-action btn" data-variant="outline" onclick={() => (ui.sheet = null)}>Hide</button>
    {:else}<span class="foot-note">Existing pixels stay unchanged</span><span class="api-action"><ApiPeek scope="character-setup" label="Set up rig" plan={setupPeekPlan(plan, looks)} /><button class="bu-action btn primary" data-variant="primary" disabled={!plan || !looks.trim() || busyElsewhere} onclick={go}>Set up <span class="cost">{plan?.gens ?? '–'} gens</span></button></span>{/if}
  {/snippet}
</Sheet>

<style>.setup-preview { display: grid; place-items: center; background: var(--bg-hover); border-radius: var(--r-ctl); padding: 8px; }</style>
