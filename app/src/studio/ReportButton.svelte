<script lang="ts">
	import { untrack } from 'svelte';
	import { t } from 'svelte-whisper';
	import { track } from '../lib/report/trail.ts';
	import { captureProblem } from './problemCapture.svelte.ts';
	import { reportProblem, type Problem } from './report.svelte.ts';
	// `name`: what failed, in the user's words, so each Report in a list has its own accessible name.
	const {
		name,
		outlined = false,
		...problem
	}: Problem & { name?: string; outlined?: boolean } = $props();
	// A problem shown in place (not a toast, not a stored record with its own time) happened, as far as this page can
	// tell, when its Report appeared: its trail ends there and it joins the trail by message key, never by text.
	const timed = $derived('failedAt' in problem || !!problem.captured || !!problem.record);
	// Compared by value and identity, so a parent that rebuilds its props on every render does not move the failure time.
	const key = $derived(
		problem.message?.key ??
			(problem.error as { translation?: { key?: unknown } } | null | undefined)?.translation?.key
	);
	const error = $derived(problem.error);
	// The whole report is frozen when the problem shows (trail, character, connection, update state), so what happens before
	// Report is pressed cannot change or push out what led to it.
	let shown: Problem | undefined;
	$effect(() => {
		void error;
		if (timed) return;
		untrack(() => {
			if (typeof key === 'string')
				track({ kind: 'notice', key, tone: problem.tone === 'warning' ? 'warning' : 'error' });
			shown = captureProblem({ ...problem }, performance.now());
		});
	});
</script>

<button
	type="button"
	class={['bu-action btn report-problem', outlined ? 'sm' : 'link small']}
	data-variant={outlined ? 'outline' : 'quiet'}
	data-trail-skip
	aria-label={name ? t('report.actionLabelFor', { name }) : t('report.actionLabel')}
	onclick={() => reportProblem(!timed && shown ? shown : { ...problem })}
	>{t('report.action')}</button
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
