<script lang="ts">
  import Sheet from './Sheet.svelte'
  import { ui, doc, store, renameProject } from './state.svelte.ts'
  let name = $state(store.projects.find((p) => p.id === doc.id)?.name ?? '')
  let busy = $state(false), error = $state('')
  async function save() {
    if (!name.trim() || busy) return
    busy = true; error = ''
    try { await renameProject(name.trim()); ui.sheet = null }
    catch (e) { error = `Could not rename: ${(e as Error).message}` }
    finally { busy = false }
  }
</script>

<Sheet title="Rename character" cancelDisabled={busy} onclose={() => (ui.sheet = null)}>
  <form class="form" onsubmit={(e) => { e.preventDefault(); void save() }}>
    <label class="field"><span class="label">Name</span><input class="input" type="text" bind:value={name} maxlength="60" disabled={busy} /></label>
  </form>
  {#if error}<p class="notice bad small" role="alert">{error}</p>{/if}
  {#snippet footer()}
    <span class="foot-note">Also the name in your exports.</span>
    <button class="btn primary" disabled={!name.trim() || busy} onclick={save}>Save</button>
  {/snippet}
</Sheet>
