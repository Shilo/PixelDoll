<script lang="ts">
  import type { DirectionName } from '../lib/store/manifest.ts'
  import Sprite from './Sprite.svelte'
  import { doc, store, ui, view } from './state.svelte.ts'
  import { buildPresentation } from './experience/presentation.ts'
  import { directionLabel } from './experience/movement.ts'
  import { popoverFocus } from './experience/focus.ts'
  import { ALL_DIRECTIONS, ALL_MOVES, STANDING, buildShareMedia, canAnimateShare, canShareDirection, encodeShareMedia, sharePreviewFrames } from './shareMedia.ts'
  import { Clapperboard, Compass, Download, LoaderCircle, PersonStanding, Share2, ChevronDown } from './icons.ts'

  let popover: HTMLElement
  let open = $state(false)
  let move = $state(STANDING)
  let direction = $state<string>('south')
  let wantedAnimate = $state(true)
  let index = $state(0)
  let file = $state.raw<File | null>(null)
  let encoding = $state(false)
  let feedback = $state('')
  let viewportWidth = $state(innerWidth)
  let viewportHeight = $state(innerHeight)
  let serial = 0
  let rememberedId = ''
  const availability = $derived.by(() => {
    void doc.rev
    return open && view.project ? buildPresentation(view.project, { loading: doc.loading, sourceProject: store.project ?? undefined, variants: doc.variants }) : null
  })
  const canAnimate = $derived(availability ? canAnimateShare(availability, doc.items, move, direction) : false)
  const animate = $derived(wantedAnimate && canAnimate)
  const planned = $derived.by(() => {
    if (!availability) return { media: null, error: '' }
    try { return { media: buildShareMedia(availability, doc.items, move, direction, animate), error: '' } }
    catch (error) { return { media: null, error: (error as Error).message } }
  })
  const directionOptions = $derived.by(() => (availability?.directions ?? []).map(id => {
    return { id, disabled: !canShareDirection(availability!, doc.items, move, id) && id !== direction }
  }))
  const previewFrames = $derived(planned.media ? sharePreviewFrames(planned.media) : [])
  const image = $derived(previewFrames[index % previewFrames.length] ?? null)
  const previewHeight = $derived(Math.max(72, Math.min(220, viewportHeight - 250)))
  const previewWidth = $derived(Math.min(360, viewportWidth - 16) - (viewportWidth <= 440 ? 14 : 18))
  const previewLimit = $derived(image ? Math.max(1, Math.floor(Math.min((previewWidth - 8) * Math.max(image.w, image.h) / image.w, (previewHeight - 12) * Math.max(image.w, image.h) / image.h))) : 112)
  const label = $derived(planned.media?.animated ? 'GIF' : 'PNG')
  const canShare = $derived(!!file && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }))
  const name = $derived((store.projects.find(project => project.id === doc.id)?.name ?? store.project?.manifest.name ?? 'character').replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'character')
  const omittedText = $derived.by(() => {
    const missing = planned.media?.omitted ?? []
    if (!missing.length) return ''
    const names = missing.slice(0, 3).map(entry => `${entry.move === STANDING ? 'Standing' : entry.move.replaceAll('-', ' ')} ${directionLabel(entry.direction)}`)
    return `${missing.length} unavailable ${missing.length === 1 ? 'view' : 'views'} omitted: ${names.join(', ')}${missing.length > 3 ? `, and ${missing.length - 3} more` : ''}`
  })

  $effect(() => {
    if (!open) return
    void doc.rev
    reconcileSelection()
  })
  $effect(() => {
    const frames = planned.media?.frames
    if (!open || !frames || frames.length < 2) return
    if (planned.media?.repeat === -1 && index === frames.length - 1) return
    const timer = window.setTimeout(() => { index = (index + 1) % frames.length }, Math.max(20, frames[index % frames.length].ms))
    return () => window.clearTimeout(timer)
  })
  $effect(() => {
    const media = planned.media
    file = null
    feedback = ''
    if (!open || !media) { encoding = false; return }
    encoding = true
    const run = ++serial
    // Let the disabled Preparing state paint before GIF quantization runs on the main thread.
    void new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0))).then(() => encodeShareMedia(media)).then(bytes => {
      if (run !== serial) return
      file = new File([bytes as Uint8Array<ArrayBuffer>], `${name}-${move === STANDING ? 'standing' : move === ALL_MOVES ? 'all-moves' : move}-${direction === ALL_DIRECTIONS ? 'all-directions' : direction}.${media.extension}`, { type: media.mime })
      encoding = false
    }).catch(error => {
      if (run !== serial) return
      feedback = `Could not prepare ${media.extension.toUpperCase()}: ${(error as Error).message}`
      encoding = false
    })
    return () => { serial++ }
  })

  function reconcileSelection() {
    const manifest = store.project?.manifest
    if (!manifest || !doc.id || doc.loading) return
    const moves = manifest.rig.animations.map(animation => animation.id)
    const directions: string[] = manifest.rig.directions.map(entry => entry.id)
    const currentMove = moves.includes(ui.anim) ? ui.anim : STANDING
    const currentDirection = directions.includes(ui.dir) ? ui.dir : directions[0] ?? 'south'
    if (rememberedId !== doc.id) {
      rememberedId = doc.id
      move = currentMove
      direction = currentDirection
      wantedAnimate = true
      index = 0
      return
    }
    if (move !== STANDING && move !== ALL_MOVES && !moves.includes(move)) { move = currentMove; index = 0 }
    if (direction !== ALL_DIRECTIONS && !directions.includes(direction)) { direction = currentDirection; index = 0 }
  }
  function toggle(event: ToggleEvent & { currentTarget: EventTarget & HTMLElement }) {
    popoverFocus(event)
    open = event.newState === 'open'
    if (open) {
      reconcileSelection()
      index = 0
      popover.querySelector<HTMLSelectElement>('select')?.focus()
    }
  }
  function download() {
    if (!file) return
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url; link.download = file.name; document.body.append(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  function share() {
    if (!file || !canShare) return
    void navigator.share({ files: [file], title: store.project?.manifest.name ?? 'PixelDoll character' }).catch(error => {
      if ((error as Error).name !== 'AbortError') feedback = `Could not share: ${(error as Error).message}`
    })
  }
</script>

<svelte:window bind:innerWidth={viewportWidth} bind:innerHeight={viewportHeight} />
<div id="share-popover" class="share-popover bu-popover bu-floating" popover bind:this={popover} role="dialog" aria-label="Share character preview" ontoggle={toggle}>
  <div class="share-preview" style:--share-preview-height="{previewHeight}px" aria-label="Selected artwork preview" role="img">
    {#if image}<Sprite img={image} k={Math.max(1, Math.floor(3 * ui.dpr))} limit={previewLimit} label="Selected artwork" />{/if}
  </div>
  <div class="share-controls">
    <label class="share-picker">
      <PersonStanding size={16} aria-hidden="true" />
      <select class="bu-select" aria-label="Move" bind:value={move} onchange={() => index = 0}>
        <option value={STANDING}>Standing</option>
        {#each store.project?.manifest.rig.animations ?? [] as animation (animation.id)}<option value={animation.id}>{animation.id[0].toUpperCase() + animation.id.slice(1).replaceAll('-', ' ')}</option>{/each}
        <option value={ALL_MOVES}>All moves</option>
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </label>
    <label class="share-picker">
      <Compass size={16} aria-hidden="true" />
      <select class="bu-select" aria-label="Direction" bind:value={direction} onchange={() => index = 0}>
        {#each store.project?.manifest.rig.directions ?? [] as entry (entry.id)}<option value={entry.id} disabled={directionOptions.find(option => option.id === entry.id)?.disabled ?? false}>{directionLabel(entry.id as DirectionName)}</option>{/each}
        <option value={ALL_DIRECTIONS}>All directions</option>
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </label>
    <label class="share-animate bu-check bu-action" data-variant="field">
      <span><Clapperboard size={16} aria-hidden="true" />Animate as GIF</span>
      <input class="bu-switch" type="checkbox" role="switch" checked={animate} disabled={!canAnimate} onchange={(event) => { wantedAnimate = event.currentTarget.checked; index = 0 }} />
    </label>
  </div>
  <div class="share-actions">
    <button class="bu-action" data-variant="primary" aria-label={encoding ? `Preparing ${label}` : `Download ${label}`} title={encoding ? undefined : `Download ${label}`} disabled={!file || encoding} onclick={download}>{#if encoding}<LoaderCircle class="share-spinner" size={16} />Preparing…{:else}<Download size={16} />Download{/if}</button>
    <button class="bu-action" data-variant="outline" disabled={!canShare || encoding} title={!canShare ? 'File sharing is unavailable in this browser; use Download instead' : undefined} onclick={share}><Share2 size={16} />Share to…</button>
  </div>
  {#if planned.error}<p class="share-message bu-error" role="status">{planned.error}</p>{/if}
  {#if omittedText}<p class="share-message bu-badge" data-tone="warning" role="status" title={planned.media?.omitted.map(entry => entry.reason).join(' · ')}>{omittedText}</p>{/if}
  {#if feedback}<p class="share-message" role="status">{feedback}</p>{/if}
</div>
