<script lang="ts">
	import { untrack } from 'svelte';
	import { t } from 'svelte-whisper';
	import { track, trailSnapshot, type TrailEntry } from '../lib/report/trail.ts';
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
	let shownAt: number | undefined;
	// Frozen when it shows, so actions after it cannot push the steps that led to it out of the trail.
	let shownTrail: TrailEntry[] | undefined;
	$effect(() => {
		void error;
		if (timed) return;
		shownAt = performance.now();
		if (typeof key === 'string')
			track({
				kind: 'notice',
				key,
				tone: untrack(() => problem.tone) === 'warning' ? 'warning' : 'error'
			});
		shownTrail = trailSnapshot();
	});
</script>

<button
	type="button"
	class={['bu-action btn report-problem', outlined ? 'sm' : 'link small']}
	data-variant={outlined ? 'outline' : 'quiet'}
	data-trail-skip
	aria-label={name ? t('report.actionLabelFor', { name }) : t('report.actionLabel')}
	onclick={() =>
		reportProblem(timed ? { ...problem } : { ...problem, failedAt: shownAt, trail: shownTrail })}
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
