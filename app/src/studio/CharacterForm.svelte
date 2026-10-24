<script lang="ts">
  import { onMount } from 'svelte'
  import Help from './Help.svelte'
  import SizePreview from './SizePreview.svelte'
  import ApiPeek from './ApiPeek.svelte'
  import { app } from '../lib/app.svelte.ts'
  import { ApiError } from '../lib/pixellab/client.ts'
  import { enhanceCharacter } from './enhanceCharacter.ts'
  import { routes } from '../lib/pixellab/routes.ts'
  import { ArrowUp, PersonStanding, Copy, Check, WandSparkles, Undo2 } from './icons.ts'
  import MirrorViews from '@lucide/svelte/icons/triangles-centerline-dashed-vertical'
  import { ANGLES, autoFrame, BODY_SIZES, COMPASS, DIRECTION_LABELS, draftErrors, PRESETS, presetOf, readPrompt, setPreset, toggleDirection, toggleMirror, TRAITS, TRAIT_KEYS, UNSET, validBodySize, writeDetails, writeTrait, type CharacterDraft, type Trait } from './characterConfig.ts'

  let { draft: d = $bindable(), busy = $bindable(false), onconnect }: { draft: CharacterDraft; busy?: boolean; onconnect: (target: 'details' | 'prompt') => void } = $props()
  const scope = `enhance:${crypto.randomUUID()}`
  let frameInput: HTMLInputElement
  let message = $state(''), announcement = $state(''), copied = $state<'details' | 'prompt' | null>(null)
  let undo = $state<{ target: 'details' | 'prompt'; before: string; after: string } | null>(null)
  let abort: AbortController | undefined
  let alive = true
  const frame = $derived(d.auto && Number.isFinite(d.body) ? autoFrame(d.body!) : d.frame)
  const preset = $derived(presetOf(d))
  const errors = $derived(draftErrors(d))
  const enhanceTarget = $derived(d.tab === 'appearance' ? 'details' : 'prompt')
  let editorHelp: { show: () => Promise<void>; hide: () => void }
  const editorHelpId = $props.id()
  const editorHelpText = $derived(d.tab === 'appearance'
    ? 'Describe distinctive features, then choose appearance hints below. These choices build the linked prompt. Hair, clothes and gear are added later.'
    : 'This exact text is sent to V3. Complete lines such as Kind: Elf update Appearance. Other text stays in Details; prose is never guessed as a trait.')
  const enhanceInput = () => ({ description: d.prompt, image_size: { width: d.body || 0, height: d.body || 0 }, view: d.view })
  const canEnhance = (target: 'details' | 'prompt') => !busy && !!(target === 'details' ? d.details : d.prompt).trim() && validBodySize(d.body) && enhanceInput().description.length <= 2000
  const canUndo = (target: 'details' | 'prompt') => undo?.target === target && undo.after === d.prompt
  function edited() { undo = null; message = ''; copied = null }
  function details(value: string) { edited(); writeDetails(d, value) }
  function trait(key: Trait, value: string) { edited(); writeTrait(d, key, value) }
  function tabKey(e: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    d.tab = e.key === 'Home' ? 'appearance' : e.key === 'End' ? 'prompt' : d.tab === 'appearance' ? 'prompt' : 'appearance'
    document.getElementById(`${d.tab}-tab`)?.focus()
  }
  async function copy(target: 'details' | 'prompt') {
    try { await navigator.clipboard.writeText(target === 'details' ? d.details : d.prompt); copied = target; message = '' }
    catch { if (target === 'prompt') d.tab = 'prompt'; message = 'Select the text to copy it.' }
  }
  async function enhance(target: 'details' | 'prompt') {
    copied = null
    if (canUndo(target)) { readPrompt(d, undo!.before); undo = null; message = ''; return }
    if (!canEnhance(target)) return
    if (!app.key) { onconnect(target); return }
    const input = enhanceInput(), before = d.prompt
    abort = new AbortController(); busy = true; message = ''
    try {
      const enhanced = await enhanceCharacter(app.key, input, abort.signal, scope)
      if (!alive) return
      if (d.prompt !== before || d.body !== input.image_size.width || d.view !== input.view) { message = 'Settings changed. Your text was kept.'; return }
      if (target === 'prompt') readPrompt(d, enhanced)
      else {
        // The enhancer sees the whole appearance. Its prose improves Details; selected hints remain authoritative.
        const parsed = { ...d }; readPrompt(parsed, enhanced)
        for (const key of TRAIT_KEYS) writeTrait(parsed, key, UNSET)
        if (!parsed.details.trim()) { message = 'PixelLab returned no details. Your text was kept.'; return }
        const candidate = { ...d }; writeDetails(candidate, parsed.details)
        if (candidate.prompt.length > 2000) { message = 'The enhanced text is too long. Your text was kept.'; return }
        writeDetails(d, parsed.details)
      }
      undo = { target, before, after: d.prompt }
    } catch (e) { if (alive) message = e instanceof ApiError
      ? `${e.status === 401 ? 'Reconnect PixelLab to enhance.' : e.status === 402 ? 'Not enough PixelLab credits.' : e.status === 0 ? 'No clear answer from PixelLab.' : 'PixelLab could not enhance this text.'} Your text was kept.`
      : e instanceof Error ? e.message : 'Enhancement failed. Your text was kept.' }
    finally { if (alive) busy = false }
  }
  onMount(() => {
    const target = d.enhanceOnConnect; delete d.enhanceOnConnect
    if (target && app.key) void enhance(target)
    return () => { alive = false; abort?.abort() }
  })
</script>

<div class="creator-grid">
  <section class="appearance" aria-label="Character appearance">
    <div class="editor-toolbar">
      <div class="creator-tabs" role="tablist" tabindex="-1" aria-label="Prompt editor" aria-describedby={editorHelpId}
        onpointerenter={(e) => { if (e.pointerType === 'mouse') void editorHelp.show() }} onpointerleave={(e) => { if (e.pointerType === 'mouse') editorHelp.hide() }}
        onfocusin={(e) => { if ((e.target as HTMLElement).matches(':focus-visible')) void editorHelp.show() }} onfocusout={() => editorHelp.hide()}>
        <button role="tab" id="appearance-tab" aria-controls="appearance-panel" tabindex={d.tab === 'appearance' ? 0 : -1} aria-selected={d.tab === 'appearance'} onkeydown={tabKey} onclick={() => d.tab = 'appearance'}>Appearance</button>
        <button role="tab" id="prompt-tab" aria-controls="prompt-panel" tabindex={d.tab === 'prompt' ? 0 : -1} aria-selected={d.tab === 'prompt'} onkeydown={tabKey} onclick={() => d.tab = 'prompt'}>Prompt</button>
      </div>
      <span class="prompt-actions">
        <Help bind:this={editorHelp} iconOnly tooltipId={editorHelpId} title={d.tab === 'appearance' ? 'Appearance help' : 'Prompt help'} text={editorHelpText} />
        <ApiPeek scope={d.tab === 'appearance' ? 'character-details-enhance' : 'character-prompt-enhance'} label={d.tab === 'appearance' ? 'Enhance details' : 'Enhance exact prompt'} plan={[{ ...routes.enhanceCharacterV3Prompt(enhanceInput()), label: d.tab === 'appearance' ? 'Enhance character details' : 'Enhance exact character prompt', generations: 0.05 }]} activityScope={scope} />
        <button class="btn icon copy" aria-label={d.tab === 'appearance' ? 'Copy details' : 'Copy exact prompt'} title={d.tab === 'appearance' ? 'Copy details' : 'Copy exact prompt'} onclick={() => copy(enhanceTarget)}>{#if copied === enhanceTarget}<Check size={14} />{:else}<Copy size={14} />{/if}</button>
        <button class="btn small enhance" aria-label={canUndo(enhanceTarget) ? 'Undo' : busy ? 'Enhancing…' : 'Enhance'} aria-busy={busy} title={canUndo(enhanceTarget) ? 'Restore the previous prompt' : 'Enhance with V3 (~0.05 gens)'} disabled={busy || (!canUndo(enhanceTarget) && !canEnhance(enhanceTarget))} onclick={() => enhance(enhanceTarget)}>
          {#if canUndo(enhanceTarget)}<Undo2 size={13} />{:else}<WandSparkles size={13} />{/if}
          <span class="enhance-label"><span class="enhance-sizer" aria-hidden="true">Enhance</span><span class="enhance-text">{canUndo(enhanceTarget) ? 'Undo' : busy ? 'Enhancing…' : 'Enhance'}</span></span>
        </button>
      </span>
    </div>
    {#if d.tab === 'appearance'}
      <div id="appearance-panel" role="tabpanel" aria-labelledby="appearance-tab" class="editor-panel">
        <div class="creator-field">
          <textarea class="input details-input" aria-label="Details" rows="3" maxlength="2000" value={d.details} oninput={(e) => details(e.currentTarget.value)} placeholder="A freckled elf with a kind face"></textarea>
        </div>
        {#each TRAIT_KEYS as key (key)}
          <div class="trait-row"><Help title={TRAITS[key].label} text={TRAITS[key].help} /><select class="input" aria-label={TRAITS[key].label} value={d[key]} onchange={(e) => trait(key, e.currentTarget.value)}><option>{UNSET}</option>{#each TRAITS[key].options as option (option)}<option>{option}</option>{/each}</select></div>
        {/each}
        <div class="prompt-note"><button class="prompt-excerpt" onclick={() => d.tab = 'prompt'} aria-label="Edit exact prompt">{d.prompt}</button><button class="btn icon copy" title="Copy exact prompt" aria-label="Copy exact prompt" onclick={() => copy('prompt')}>{#if copied === 'prompt'}<Check size={14} />{:else}<Copy size={14} />{/if}</button></div>
      </div>
    {:else}
      <div id="prompt-panel" role="tabpanel" aria-labelledby="prompt-tab" class="editor-panel">
        <textarea class="input exact-input" aria-label="Exact prompt" value={d.prompt} oninput={(e) => { edited(); readPrompt(d, e.currentTarget.value) }} maxlength="2000" spellcheck="false"></textarea>
      </div>
    {/if}
    {#if message}<p class="creator-message" role="status">{message}</p>{/if}
  </section>

  <section class="geometry" aria-label="Character size and camera">
    <div class="creator-field"><Help title="Body size" text="The source canvas V3 draws into, in pixels—not a guaranteed opaque body height. Choose 32–256 pixels in 4 px steps. The frame adds space for movement and equipment." /><div class="body-presets" role="group" aria-label="Body size presets">{#each BODY_SIZES as size (size)}<button class="btn" aria-pressed={d.bodyPreset === size} onclick={() => { d.body = size; d.bodyPreset = size }}>{size}</button>{/each}</div><div class="pixel-input"><input class="input" aria-label="Body size" type="number" min="32" max="256" step="4" bind:value={d.body} oninput={() => d.bodyPreset = null} /><span aria-hidden="true">px</span></div></div>
    <div class="creator-field"><Help title="Frame" text="The square cell used by every exported frame. Auto adds padding around the body canvas. Enter a larger value for more room, up to 256 px. Pixels are padded, never scaled." /><div class="frame-controls"><button class="btn" aria-pressed={d.auto} onclick={() => { d.frame = frame; d.auto = !d.auto; if (!d.auto) { frameInput.focus(); frameInput.select() } }}>Auto</button><div class="pixel-input"><input bind:this={frameInput} class="input" aria-label="Frame size" type="number" min={autoFrame(d.body || 32)} max="256" step="1" value={frame ?? ''} oninput={(e) => { d.auto = false; d.frame = e.currentTarget.value === '' ? undefined : e.currentTarget.valueAsNumber }} /><span aria-hidden="true">px</span></div></div></div>
    <SizePreview body={d.body || 0} frame={frame || 0} />
    <div class="creator-field camera"><Help title="Camera" text="Low top-down shows a slight overhead view. High top-down looks down more steeply. Side is level with the character. Direction presets also set a suitable camera." /><select class="input" aria-label="Camera" bind:value={d.view}><option value="low top-down">Low top-down</option><option value="high top-down">High top-down</option><option value="side">Side</option></select></div>
  </section>

  <section class="facing" aria-label="Character directions">
    <Help title="Directions" text="Choose the views to keep and animate. V3 first creates all eight original views. Attached flip buttons mirror a horizontal partner; a blue flip marks a derived view. Turning it off uses that view’s original artwork. For one facing, choose Side-scroller 2 and turn W off." />
    <div class="direction-presets" role="group" aria-label="Direction presets">{#each PRESETS as p (p.id)}<button class="btn" aria-pressed={preset === p.id} onclick={() => { setPreset(d, p.id); announcement = '' }}>{p.label}</button>{/each}</div>
    <div class="compass" role="group" aria-label="Facing directions">
      {#each COMPASS as dir, i (dir ?? 'center')}
        {#if dir}
          {@const west = dir.includes('west')}
          {@const pair = west || dir.includes('east')}
          <div class="direction-tile" class:west class:east={!west && pair}>
            {#if west}<button class="mirror" aria-label="Mirror {DIRECTION_LABELS[dir]}" title="Mirror {DIRECTION_LABELS[dir]} from its eastern partner" aria-pressed={!!d.mirrors[dir]} onclick={() => toggleMirror(d, dir)}><MirrorViews size={15} /></button>{/if}
            <button class="direction" aria-label="{DIRECTION_LABELS[dir]} direction" aria-pressed={d.selected.includes(dir)} onclick={() => announcement = toggleDirection(d, dir)}><ArrowUp size={18} style="transform:rotate({ANGLES[dir]}deg)" /><span>{DIRECTION_LABELS[dir]}</span></button>
            {#if !west && pair}<button class="mirror" aria-label="Mirror {DIRECTION_LABELS[dir]}" title="Mirror {DIRECTION_LABELS[dir]} from its western partner" aria-pressed={!!d.mirrors[dir]} onclick={() => toggleMirror(d, dir)}><MirrorViews size={15} /></button>{/if}
          </div>
        {:else}<span class="compass-center" aria-hidden="true"><PersonStanding size={23} /></span>{/if}
      {/each}
    </div>
    <span class="direction-announcement" aria-live="polite">{announcement}</span>
    <div class="creator-field seed"><Help title="Seed" text="Controls the random starting point for character generation and its animations. It does not randomize one specific trait. Leave blank for a fresh seed. Reusing it can give similar results, but does not guarantee identical pixels." /><input class="input" aria-label="Seed" inputmode="numeric" pattern="[0-9]*" bind:value={d.seed} placeholder="Random" /></div>
  </section>
</div>
{#if errors.length}<p class="creator-validation" role="status">{errors[0]}</p>{/if}

<style>
  .creator-grid { display:grid; grid-template-columns:minmax(250px,1.1fr) minmax(170px,.8fr) minmax(290px,1.15fr); gap:24px; align-items:start; }
  section { min-width:0; display:flex; flex-direction:column; gap:12px; }
  .appearance { gap:10px; container-type:inline-size; }
  .editor-toolbar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:6px; min-height:36px; }
  .creator-tabs { display:flex; flex:1 1 auto; min-width:max-content; gap:3px; padding:3px; background:var(--bg-side); border-radius:var(--r-ctl); }
  .creator-tabs button { flex:1; height:30px; padding:0 6px; border:0; border-radius:4px; background:none; color:var(--text-3); font:inherit; font-size:var(--fs-sm); cursor:pointer; }
  .creator-tabs [aria-selected=true] { background:var(--bg-hover); color:var(--text); box-shadow:0 1px 3px #0002; }
  .editor-panel { display:flex; flex-direction:column; gap:12px; min-height:336px; }
  .creator-field { display:flex; flex-direction:column; gap:6px; }
  .enhance { min-width:78px; gap:4px; padding-inline:7px; font-size:var(--fs-sm); }
  .enhance-label { position:relative; }
  .enhance-sizer { visibility:hidden; }
  .enhance-text { position:absolute; inset:0; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .prompt-actions { display:flex; flex:none; align-items:center; gap:3px; margin-inline-start:auto; }
  .details-input { resize:vertical; min-height:82px; max-height:160px; font-size:var(--fs); }
  .trait-row { display:grid; grid-template-columns:88px minmax(0,1fr); gap:8px; align-items:center; }
  .trait-row :global(.help-title) { align-self:center; }
  .input { width:100%; min-width:0; }
  .prompt-note { display:flex; align-items:flex-start; gap:4px; padding-top:2px; }
  .prompt-excerpt { flex:1; min-width:0; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; line-clamp:3; overflow:hidden; text-align:left; border:0; background:none; padding:0; color:var(--text-3); font:inherit; font-size:11px; line-height:1.5; cursor:pointer; height:49.5px; overflow-wrap:anywhere; }
  .copy { flex:none; color:var(--text-3); }
  .exact-input { min-height:302px; resize:vertical; line-height:1.6; font-size:var(--fs-sm); }
  .body-presets, .frame-controls { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:5px; }
  .body-presets .btn, .frame-controls .btn { padding-inline:0; }
  .frame-controls .btn { height:auto; align-self:stretch; }
  .frame-controls .pixel-input { grid-column:span 3; }
  .pixel-input { position:relative; min-width:0; }
  .pixel-input input { padding-right:33px; font-variant-numeric:tabular-nums; appearance:textfield; -moz-appearance:textfield; }
  .pixel-input input::-webkit-inner-spin-button { -webkit-appearance:none; }
  .pixel-input > span { position:absolute; right:10px; top:50%; transform:translateY(-50%); color:var(--text-3); font-size:var(--fs-sm); pointer-events:none; }
  .btn[aria-pressed=true], .direction[aria-pressed=true], .mirror[aria-pressed=true] { background:var(--accent-soft); color:var(--accent-text); border-color:var(--accent); }
  .direction-presets { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:5px; margin-top:-4px; }
  .direction-presets .btn { grid-column:span 2; padding-inline:3px; font-size:var(--fs-sm); white-space:nowrap; }
  .direction-presets .btn:nth-child(-n+2) { grid-column:span 3; }
  .compass { --mirror-width:29px; display:grid; grid-template-columns:calc(56px + var(--mirror-width)) 56px calc(56px + var(--mirror-width)); gap:6px; width:max-content; max-width:100%; margin-top:4px; }
  .direction-tile { display:flex; height:54px; min-width:0; }
  .direction, .mirror { display:flex; align-items:center; justify-content:center; gap:3px; border:1px solid var(--line-strong); border-radius:var(--r-ctl); background:var(--bg-side); color:var(--text-3); padding:0; font:inherit; cursor:pointer; }
  .direction { flex:1; min-width:0; flex-direction:column; font-size:10px; }
  .mirror { flex:0 0 var(--mirror-width); }
  @media (pointer:coarse) { .compass { --mirror-width:44px; } .creator-tabs button { min-height:44px; } }
  .west .direction { border-top-left-radius:0; border-bottom-left-radius:0; }
  .west .mirror { border-right:0; border-top-right-radius:0; border-bottom-right-radius:0; }
  .east .direction { border-top-right-radius:0; border-bottom-right-radius:0; }
  .east .mirror { border-left:0; border-top-left-radius:0; border-bottom-left-radius:0; }
  .compass-center { display:flex; align-items:center; justify-content:center; color:var(--text-3); opacity:.55; }
  .direction-announcement { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
  .seed { margin-top:4px; }
  .creator-message, .creator-validation { color:var(--text-2); font-size:var(--fs-sm); line-height:1.5; overflow-wrap:anywhere; }
  .creator-validation { color:var(--danger-text, var(--text-2)); }
  @media (max-width:850px) { .creator-grid { grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:22px; } .facing { grid-column:1/-1; max-width:360px; } }
  @media (max-width:599px), (max-height:499px) { .creator-grid { display:flex; flex-direction:column; gap:22px; } section { width:100%; } .editor-panel { min-height:0; } .creator-tabs button { height:40px; } .editor-toolbar { min-height:46px; } .trait-row { grid-template-columns:90px minmax(0,1fr); } .input { min-height:44px; font-size:16px; } .body-presets .btn, .frame-controls .btn, .direction-presets .btn { min-height:44px; } .direction-tile { height:56px; } .compass { --mirror-width:44px; } .facing { max-width:none; } .exact-input { min-height:300px; } .direction-presets .btn { font-size:12px; } .prompt-excerpt { font-size:12px; height:54px; } }
  @container (max-width:290px) { .enhance-label { display:none; } .editor-toolbar .enhance { min-width:44px; width:44px; padding-inline:0; } }
  @media (pointer:coarse) { @container (max-width:340px) { .enhance-label { display:none; } .editor-toolbar .enhance { min-width:44px; width:44px; padding-inline:0; } } }
  @media (pointer:coarse) { .editor-toolbar .creator-tabs button { min-width:44px; } }
  @media (max-width:599px), (max-height:499px), (pointer:coarse) { @container (max-width:400px) { .editor-toolbar :global(.help-title.icon-only), .editor-toolbar :global(.api-peek-trigger), .editor-toolbar .copy { width:32px; min-width:32px; } } }
</style>
