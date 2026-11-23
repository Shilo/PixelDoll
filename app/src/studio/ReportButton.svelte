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
	/* Centered on the text line of a notice and between boxed toast actions. A toast's whole surface is a button under
	   content that ignores pointers; Report sits above it as its own target, so pressing it never also dismisses. */
	.report-problem {
		position: relative;
		z-index: 1;
		pointer-events: auto;
		flex: none;
		align-self: center;
		vertical-align: middle;
	}
</style>
