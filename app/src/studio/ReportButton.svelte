<script lang="ts">
	import { t } from 'svelte-whisper';
	import { reportProblem, type Problem } from './report.svelte.ts';
	// `name`: what failed, in the user's words, so each Report in a list has its own accessible name.
	const {
		name,
		outlined = false,
		...problem
	}: Problem & { name?: string; outlined?: boolean } = $props();
</script>

<button
	type="button"
	class={['bu-action btn report-problem', outlined ? 'sm' : 'link small']}
	data-variant={outlined ? 'outline' : 'quiet'}
	data-trail-skip
	aria-label={name ? t('report.actionLabelFor', { name }) : t('report.actionLabel')}
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
