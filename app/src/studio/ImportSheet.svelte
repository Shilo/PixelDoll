<script lang="ts">
  import { onDestroy } from 'svelte'
  import Sheet from './Sheet.svelte'
  import { default as ApiPeek } from './ApiPeek.svelte'
  import ApiPreview from './ApiPreview.svelte'
  import { libraryPlan, characterZipPlan } from './apiPlans.ts'
  import Sprite from './Sprite.svelte'
  import { app } from '../lib/app.svelte.ts'
  import { composeCell } from '../lib/compose/compose.ts'
  import { characterId, downloadCharacter, listCharacters, type LibraryCharacter } from '../lib/pixellab/library.ts'
  import { CharacterImportError, readCharacterZip, saveImportedCharacter, type ImportedCharacter } from '../lib/store/import.ts'
  import { MAX_ZIP_BYTES } from '../lib/store/zip.ts'
  import { rigReady } from '../lib/rig/setup.ts'
  import { ui, dismissWelcome, refreshProjects, openProject, toast, withKey } from './state.svelte.ts'
  import { customize } from './experience/state.svelte.ts'
  import { Download, KeyRound, TriangleAlert } from './icons.ts'

  let prepared = $state.raw<ImportedCharacter | null>(null)
  let setupNext = $state(true)
  const needsSetup = $derived(!!prepared && !rigReady({ manifest: prepared.project.manifest, ...prepared.extra }))
  let states = $state.raw<{ id: string; name: string }[]>([]), stateId = $state('')
  let bytes: Uint8Array | null = null
  let name = $state(''), id = $state(''), error = $state(''), busy = $state(false), saving = $state(false), loading = $state(false)
  let characters = $state.raw<LibraryCharacter[]>([]), total = $state(0), offset = $state(0), listed = $state(false)
  let alive = true
  const reads = new AbortController()
  const peekScope = crypto.randomUUID()
  const listScope = (page: number) => `${peekScope}:library:${page}`
  function zipScope(value: string) {
    try { return `${peekScope}:zip:${characterId(value)}` } catch { return `${peekScope}:zip:invalid` }
  }
  onDestroy(() => { alive = false; reads.abort() })
  const preview = $derived.by(() => {
    const p = prepared?.project
    if (!p) return null
    const m = p.manifest, dir = m.rig.directions.find((d) => d.id === 'south')?.id ?? m.rig.directions[0].id
    return composeCell(p, m.presets[0]?.items ?? { body: m.rig.baseItem }, m.rig.animations[0].id, dir, 0)
  })
  $effect(() => { if (ui.importSource === 'pixellab' && app.key && !listed) { listed = true; void load(0) } })
  function reset() { prepared = null; bytes = null; error = ''; name = ''; states = []; stateId = '' }
  function close() { if (!saving) { reads.abort(); ui.sheet = null } }
  async function load(next: number) {
    loading = true; error = ''
    try {
      const page = await listCharacters(app.key, next, reads.signal, { activityScope: listScope(next) })
      if (!alive) return
      characters = page.characters; total = page.total; offset = next
    } catch (e) { if (alive) error = (e as Error).message }
    finally { if (alive) loading = false }
  }
  async function prepare(data: Uint8Array, stateId?: string) {
    bytes = data
    try {
      const result = await readCharacterZip(data, stateId)
      if (!alive) return
      states = result.states ?? []
      prepared = result; name = result.project.manifest.name.slice(0, 60)
    } catch (e) {
      if (alive && e instanceof CharacterImportError) states = e.states
      throw e
    }
  }
  async function fileChanged(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    reset(); busy = true
    try { if (file.size > MAX_ZIP_BYTES) throw new Error('Choose a ZIP smaller than 64 MB.'); await prepare(new Uint8Array(await file.arrayBuffer())) }
    catch (e) { if (alive) error = (e as Error).message }
    finally { if (alive) busy = false }
  }
  async function fromPixelLab(value: string) {
    reset(); busy = true
    try { const selected = characterId(value); await prepare(await downloadCharacter(selected, reads.signal, { activityScope: zipScope(selected) }), selected) }
    catch (e) { if (alive) error = (e as Error).message }
    finally { if (alive) busy = false }
  }
  async function changeState(value: string) {
    if (!bytes) return
    const data = bytes
    stateId = value
    prepared = null; error = ''; busy = true
    try { await prepare(data, value) }
    catch (e) { if (alive) error = (e as Error).message }
    finally { if (alive) busy = false }
  }
  async function save() {
    if (!prepared || busy) return
    busy = true; saving = true; error = ''
    try {
      const projectId = await saveImportedCharacter(prepared, name)
      await refreshProjects()
      if (!alive) return
      await openProject(projectId)
      if (!alive) return
      dismissWelcome(); customize(); ui.sheet = setupNext && needsSetup ? 'setup' : null; toast(`Imported ${name.trim()}`)
    } catch (e) { if (alive) error = (e as Error).message }
    finally { if (alive) { busy = false; saving = false } }
  }
</script>

<Sheet title="Import character" onclose={close} cancelDisabled={saving}>
  <div class="api-action"><ApiPeek scope="library-open" label="Browse PixelLab characters" plan={libraryPlan()} activityScope={listScope(0)} /><div class="seg full" style="flex:1" role="tablist" aria-label="Import source">
    <button role="tab" aria-selected={ui.importSource === 'device'} tabindex={ui.importSource === 'device' ? 0 : -1} disabled={busy} onclick={() => { ui.importSource = 'device'; reset() }}>From this device</button>
    <button role="tab" aria-selected={ui.importSource === 'pixellab'} tabindex={ui.importSource === 'pixellab' ? 0 : -1} disabled={busy} onclick={() => { ui.importSource = 'pixellab'; reset() }}>From PixelLab</button>
  </div></div>
  {#if states.length > 1}
    <label class="field"><span class="label">Character state</span><select class="bu-input input" value={stateId || prepared?.stateId || states[0].id} disabled={busy} onchange={(e) => changeState(e.currentTarget.value)}>{#each states as state (state.id)}<option value={state.id}>{state.name}</option>{/each}</select></label>
  {/if}
  {#if !prepared}
    {#if ui.importSource === 'device'}
      <p class="muted">Open a PixelLab character ZIP or a PixelDoll export ZIP. Your files stay on this device.</p>
      <label class="field"><span class="label">Character ZIP</span><input class="bu-input input" type="file" accept=".zip,application/zip" disabled={busy} onchange={fileChanged} /></label>
      <p class="faint small">Up to 64 MB. In PixelLab’s character creator, export a ZIP with individual frames. Enclosing folders are supported. Other spritesheet layouts and PNG-only ZIPs are not supported.</p>
    {:else}
      <p class="muted">Browse your account’s available characters, 20 per page, or paste a character link. Importing uses no generations.</p>
      {#if !app.key || app.keyRejected}
        <button class="bu-action btn" data-variant="outline" disabled={busy} onclick={() => withKey(() => { ui.importSource = 'pixellab'; ui.sheet = 'import' }, false)}><KeyRound size={16} />Connect PixelLab to browse your characters</button>
      {:else}
        <div class="library-head"><span class="label">Your PixelLab characters</span><span class="api-action"><ApiPeek scope="library-refresh" label="Refresh character library" plan={libraryPlan(offset)} activityScope={listScope(offset)} /><button class="bu-action btn plain small" data-variant="quiet" disabled={busy || loading} onclick={() => load(offset)}>Refresh</button></span></div>
        {#if loading}<p class="muted" role="status">Loading characters…</p>
        {:else if !characters.length}<p class="faint">No characters found on this PixelLab account.</p>
        {:else}
          <div class="character-library" aria-label="PixelLab characters">
            {#each characters as ch (ch.id)}
              <div class="api-action library-entry"><ApiPeek scope={`library-character-${ch.id}`} label={`Preview ${ch.name || 'character'}`} plan={characterZipPlan(ch.id)} activityScope={zipScope(ch.id)} /><button class="library-character" disabled={busy} onclick={() => fromPixelLab(ch.id)}>
                {#if ch.preview_url}{#key ch.preview_url}<ApiPreview src={ch.preview_url} activityScope={listScope(offset)} />{/key}{/if}
                <span><b>{ch.name || 'Untitled character'}</b><span class="faint small">{ch.directions} {ch.directions === 1 ? 'direction' : 'directions'} · {ch.animation_count} {ch.animation_count === 1 ? 'move' : 'moves'}</span></span>
              </button></div>
            {/each}
          </div>
          <div class="library-head"><span class="api-action"><ApiPeek scope="library-previous" label="Previous character page" plan={libraryPlan(Math.max(0, offset - 20))} activityScope={listScope(Math.max(0, offset - 20))} /><button class="bu-action btn small" data-variant="outline" disabled={busy || loading || offset === 0} onclick={() => load(Math.max(0, offset - 20))}>Previous</button></span><span class="faint small">{offset + 1}–{Math.min(offset + characters.length, total)} of {total}</span><span class="api-action"><ApiPeek scope="library-next" label="Next character page" plan={libraryPlan(offset + 20)} activityScope={listScope(offset + 20)} /><button class="bu-action btn small" data-variant="outline" disabled={busy || loading || offset + characters.length >= total} onclick={() => load(offset + 20)}>Next</button></span></div>
        {/if}
      {/if}
      <form class="form" onsubmit={(e) => { e.preventDefault(); void fromPixelLab(id) }}>
        <label class="field"><span class="label">Character ID or PixelLab link</span><input class="bu-input input" type="text" bind:value={id} placeholder="Paste a character ID or creator link" disabled={busy} /></label>
        <span class="api-action"><ApiPeek scope="library-preview" label="Preview character ZIP" plan={characterZipPlan(id)} activityScope={zipScope(id)} /><button class="bu-action btn" data-variant="outline" type="submit" disabled={busy || !id.trim()}>Preview character</button></span>
      </form>
      <p class="faint small">An ID or shared creator link works without connecting an account.</p>
    {/if}
  {:else}
    <div class="import-preview">
      {#if preview}<Sprite img={preview} k={Math.max(1, Math.min(3, Math.floor(256 * ui.dpr / Math.max(preview.w, preview.h))))} label="Character import preview" />{/if}
      <p class="muted">{prepared.project.manifest.rig.directions.length} directions · {prepared.project.manifest.rig.animations.length} {prepared.project.manifest.rig.animations.length === 1 ? 'move' : 'moves'} · {prepared.project.manifest.items.filter((i) => i.slot !== 'body').length} separate {prepared.project.manifest.items.filter((i) => i.slot !== 'body').length === 1 ? 'item' : 'items'}</p>
    </div>
    <label class="field"><span class="label">Character name</span><input class="bu-input input" type="text" bind:value={name} maxlength="60" disabled={busy} /></label>
    {#each prepared.warnings as warning (warning)}<p class="notice warn small"><TriangleAlert size={16} /><span>{warning}</span></p>{/each}
    {#if needsSetup}<label class="check"><input type="checkbox" bind:checked={setupNext} disabled={busy} />Set up the pose rig next (recommended)</label><p class="faint small">Import is free. Rig setup shows its PixelLab generation cost before you start.</p>{/if}
    <button class="bu-action btn plain" data-variant="quiet" disabled={busy} onclick={reset}>Choose another character</button>
  {/if}
  {#if busy}<p class="muted" role="status">{saving ? 'Saving your local copy…' : 'Preparing your character…'}</p>{/if}
  {#if error}<p class="notice bad small" role="alert"><TriangleAlert size={16} /><span>{error}</span></p>{/if}
  {#snippet footer()}
    <span class="foot-note">Free · saves a new local copy</span>
    <button class="bu-action btn primary" data-variant="primary" disabled={!prepared || busy || !name.trim()} onclick={save}><Download size={16} />{busy ? 'Working…' : 'Import character'}</button>
  {/snippet}
</Sheet>

<style>
  .library-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .library-entry { display: flex; }
  .library-entry > .library-character { flex: 1; }
  .character-library { display: grid; gap: 6px; max-height: 260px; overflow-y: auto; }
  .library-character { display: flex; align-items: center; gap: 12px; padding: 10px; border: 1px solid var(--line); border-radius: var(--r-ctl); background: var(--bg-hover); color: var(--text); text-align: left; cursor: pointer; min-width: 0; }
  .library-character:hover { border-color: var(--accent); }
  .library-character :global(img) { width: 48px; height: 48px; object-fit: contain; image-rendering: pixelated; }
  .library-character > span { display: grid; gap: 3px; min-width: 0; overflow-wrap: anywhere; }
  .import-preview { display: grid; justify-items: center; gap: 8px; padding: 12px; border-radius: var(--r-ctl); background: var(--bg-hover); }
  input[type=file] { max-width: 100%; }
</style>
