<script lang="ts">
	// A failure notice in plain words: a short title and one next step by the failure's kind, with the detailed text one
	// tap away under Details, beside Report. An unexpected failure keeps its detailed text in view.
	import { CircleAlert } from './icons.ts';
	import { t } from 'svelte-whisper';
	import { displayNestedMessage } from '../lib/i18n.ts';
	import { errorMessage, type Message } from '../lib/message.ts';
	import ReportButton from './ReportButton.svelte';
	import { problemKind } from './problemSummary.ts';
	import type { Problem } from './report.svelte.ts';

	let {
		error,
		detail,
		report = {}
	}: {
		/** The failure: an Error, a stored Message or text. */
		error: unknown;
		/** The detailed text to show, when it differs from the error's own message. */
		detail?: Message | string;
		/** What Report sends besides the error; an `error` here is reported in its place. */
		report?: Problem;
	} = $props();
	const kind = $derived(problemKind(error));
	// Report reads an Error's code and status; a stored Message is reported as the message the user saw.
	const reported = $derived({
		...(error instanceof Error
			? { error }
			: error && typeof error === 'object'
				? { message: error as Message }
				: { error }),
		...report
	});
	const shown = $derived(
		displayNestedMessage(
			detail ?? (error instanceof Error ? errorMessage(error) : (error as Message | string))
		)
	);
</script>

<div class="notice bad small problem" role="alert">
	<CircleAlert size={14} />
	<div class="problem-body">
		{#if kind}
			<p>
				<strong>{t(`problem.title.${kind}`)}</strong>
				{t(`problem.next.${kind}`)}<ReportButton {...reported} />
			</p>
			<!-- An unexpected failure has no known next step beyond Report, so its own words stay in view. -->
			{#if kind === 'unexpected'}<p>{shown}</p>
			{:else}<details class="problem-details">
					<summary>{t('problem.details')}</summary>
					<p>{shown}</p>
				</details>{/if}
		{:else}
			<p>{shown}<ReportButton {...reported} /></p>
		{/if}
	</div>
</div>

<style>
	.problem-body {
		display: grid;
		gap: 4px;
		min-width: 0;
	}
	.problem-body p {
		overflow-wrap: anywhere;
	}
	.problem-details summary {
		cursor: pointer;
		width: fit-content;
	}
</style>
