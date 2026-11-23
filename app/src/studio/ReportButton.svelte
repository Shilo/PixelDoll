<script lang="ts">
	// The unobtrusive Report action any failure surface can add: a quiet link-sized button that opens the report preview.
	// A notice with Report never makes its whole surface a button too (Toast.svelte), so it is always its own target.
	import { t } from 'svelte-whisper';
	import { reportProblem, type Problem } from './report.svelte.ts';
	const problem: Problem = $props();
</script>

<button
	type="button"
	class="bu-action btn link small report-problem"
	data-variant="quiet"
	aria-label={t('report.actionLabel')}
	onclick={() => reportProblem({ ...problem })}>{t('report.action')}</button
>

<style>
	/* Centered on the text line of a notice and between boxed toast actions. */
	.report-problem {
		flex: none;
		align-self: center;
		vertical-align: middle;
	}
</style>
