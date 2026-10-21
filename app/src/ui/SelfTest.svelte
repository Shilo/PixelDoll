<script lang="ts">
  import { runSelfTests } from '../lib/selftests.ts'

  let lines = $state<string[]>([])
  let failures = $state<number | null>(null)
  async function run() {
    lines = []
    failures = await runSelfTests('browser', (l) => lines.push(l))
  }
  run()
</script>

<h1>Self-tests</h1>
<button onclick={run}>run again</button>
<pre data-testid="selftest" data-failures={failures}>{lines.join('\n')}</pre>
