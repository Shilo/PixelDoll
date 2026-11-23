<script lang="ts">
	// The unobtrusive Report action any failure surface can add: a quiet link-sized button that opens the report preview.
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
	/* Inside a notice whose whole surface is its activate button (content ignores pointers), Report stays its own target. */
	.report-problem {
		position: relative;
		z-index: 1;
		pointer-events: auto;
		flex: none;
		align-self: flex-start;
	}
</style>
