<script lang="ts">
	import { Notice } from '@shilo/bronze-ui/svelte';
	import { app } from '../lib/app.svelte.ts';
	import { tierDecision } from '../lib/pixellab/plans.ts';
	import { TriangleAlert } from './icons.ts';
	import NoticeLink from './NoticeLink.svelte';
	import { t } from 'svelte-whisper';

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
		<Notice
			tone="info"
			title={app.balanceError ? t('tierNotice.unverifiedTitle') : t('tierNotice.checkingTitle')}
		>
			{app.balanceError ? t('tierNotice.unverified') : t('tierNotice.checking')}
		</Notice>
	</div>
{:else if app.key && !app.keyRejected && decision.kind !== 'ok'}
	<div {id}>
		<NoticeLink
			href="https://www.pixellab.ai/#pricing"
			tone="warning"
			label={decision.kind === 'required'
				? t('tierNotice.requiredLink', { tier: decision.tier })
				: t('tierNotice.recommendedLink', { tier: decision.tier })}
		>
			{#snippet indicator()}<TriangleAlert size={18} />{/snippet}
			<strong
				>{decision.kind === 'required'
					? t('tierNotice.requiredTitle', { tier: decision.tier })
					: t('tierNotice.recommendedTitle', { tier: decision.tier })}</strong
			>
			<span>
				{#if decision.kind === 'required'}
					{decision.current === 0
						? t('tierNotice.requiredFree', { feature, tier: decision.tier })
						: t('tierNotice.required', {
								feature,
								tier: decision.tier,
								current: decision.current
							})}
				{:else}
					{recommendation ?? t('tierNotice.recommended', { feature, tier: decision.tier })}
				{/if}
			</span>
		</NoticeLink>
	</div>
{/if}
