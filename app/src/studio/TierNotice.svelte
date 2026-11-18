<script lang="ts">
	import { Notice } from '@shilo/bronze-ui/svelte';
	import { app } from '../lib/app.svelte.ts';
	import { tierDecision } from '../lib/pixellab/plans.ts';

	let {
		minimumTier,
		recommendedTier,
		feature,
		recommendation,
		id
	}: {
		minimumTier: number;
		recommendedTier?: number;
		feature: string;
		recommendation?: string;
		id?: string;
	} = $props();
	const decision = $derived(
		tierDecision(app.balance, { required: minimumTier, recommended: recommendedTier })
	);
</script>

{#if app.key && !app.keyRejected && !app.balance && minimumTier > 0}
	<div {id}>
		<Notice tone="info" title={app.balanceError ? 'Plan not verified' : 'Checking PixelLab plan'}>
			{app.balanceError
				? 'Your plan could not be verified. Restricted requests wait until the account check succeeds.'
				: 'PixelDoll checks your plan before submitting this action.'}
		</Notice>
	</div>
{:else if app.key && !app.keyRejected && decision.kind !== 'ok'}
	<div {id}>
		<Notice
			tone="warning"
			title={`PixelLab Tier ${decision.tier} ${decision.kind === 'required' ? 'required' : 'recommended'}`}
		>
			{#if decision.kind === 'required'}
				{feature} needs Tier {decision.tier} or higher. Your account is
				{decision.current === 0 ? 'Free/Trial' : `Tier ${decision.current}`}. No request sent.
			{:else}
				{recommendation ??
					`${feature} is available on your plan. Tier ${decision.tier} or higher is recommended.`}
			{/if}
			<a href="https://www.pixellab.ai/#pricing" target="_blank" rel="noreferrer"
				>View PixelLab plans</a
			>
		</Notice>
	</div>
{/if}
