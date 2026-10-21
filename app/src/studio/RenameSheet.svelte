<script lang="ts">
  import Sheet from './Sheet.svelte'
  import { ui, doc, store, renameProject } from './state.svelte.ts'
  let name = $state(store.projects.find((p) => p.id === doc.id)?.name ?? '')
  async function save() {
    if (name.trim()) await renameProject(name.trim())
    ui.sheet = null
  }
</script>

<Sheet title="Rename character" onclose={() => (ui.sheet = null)}>
  <form class="form" onsubmit={(e) => { e.preventDefault(); void save() }}>
    <label class="field"><span class="label">Name</span><input class="input" type="text" bind:value={name} maxlength="60" /></label>
  </form>
  {#snippet footer()}
    <span class="foot-note">Also the name in your exports.</span>
    <button class="btn primary" disabled={!name.trim()} onclick={save}>Save</button>
  {/snippet}
</Sheet>
