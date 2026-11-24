<script lang="ts">
	// A failure notice in plain words: a short title and one next step by the failure's kind, with the detailed text one
	// tap away under Details, beside Report. An unexpected failure keeps its detailed text in view, and a message written for
	// the user with no kind of its own (stated) is the notice itself.
	import { CircleAlert } from './icons.ts';
	import { t } from 'svelte-whisper';
	import { displayNestedMessage } from '../lib/i18n.ts';
	import { errorMessage, type Message } from '../lib/message.ts';
	import ReportButton from './ReportButton.svelte';
	import { problemKind, type ProblemKind } from './problemSummary.ts';
	import type { Problem } from './report.svelte.ts';

	let {
		error,
		detail,
		report = {},
		kind: known,
		name,
		listed = false
	}: {
		/** The failure: an Error, a stored Message or text. */
		error: unknown;
		/** The detailed text to show, when it differs from the error's own message. */
		detail?: Message | string;
		/** What Report sends besides the error; an `error` here is reported in its place. */
		report?: Problem;
		/** The kind when it is known from more than the error, such as the request record behind it (recordProblemKind). */
		kind?: ProblemKind;
		/** What failed, in the user's words: names this notice's Report for screen readers when several are listed. */
		name?: string;
		/** A row of a list of past failures (Activity): read in place, not announced, and quiet (no box or second icon; the row
		 *  has its own). */
		listed?: boolean;
	} = $props();
	const kind = $derived(known ?? problemKind(error));
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
			detail ?? (error instanceof Error ? errorMessage(error) : ((error as Message | string) ?? ''))
		)
	);
</script>

<div
	class="small problem"
	class:notice={!listed}
	class:bad={!listed}
	class:listed
	role={listed ? undefined : 'alert'}
>
	{#if !listed}<CircleAlert size={14} />{/if}
	<div class="problem-body">
		{#if kind && kind !== 'stated'}
			<!-- Title and next step are separate paragraphs, so screen readers pause between them in every language. -->
			<p><strong>{t(`problem.title.${kind}`)}</strong></p>
			<p>{t(`problem.next.${kind}`)}</p>
			<!-- An unexpected failure has no known next step beyond Report, so its own words stay in view. -->
			{#if kind === 'unexpected' && shown}<p>{shown}</p>{/if}
		{:else}
			<p>{shown}</p>
		{/if}
		<div class="problem-foot">
			{#if kind && kind !== 'unexpected' && kind !== 'stated' && shown}<details
					class="problem-details"
				>
					<summary>{t('problem.details')}</summary>
					<p>{shown}</p>
				</details>{/if}
			<ReportButton {...reported} {name} />
		</div>
	</div>
</div>

<style>
	.problem-body {
		display: grid;
		gap: 4px;
		min-width: 0;
	}
	/* A list row: no box, the row's own icon, full row width. */
	.listed {
		min-width: 0;
		margin-top: 2px;
	}
	.problem-body p {
		overflow-wrap: anywhere;
	}
	/* Details and Report share one line below the text; Report never sits inside a sentence. */
	.problem-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 12px;
	}
	.problem-details {
		flex: 1 1 auto;
		min-width: 0;
	}
	/* Report always ends the line, with or without Details beside it. */
	.problem-foot :global(.report-problem) {
		margin-inline-start: auto;
	}
	.problem-details summary {
		cursor: pointer;
		width: fit-content;
	}
</style>
