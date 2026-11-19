<script lang="ts">
	import { formatNumber, t } from 'svelte-whisper';
	import { message, type Message } from '../lib/message.ts';
	import { displayMessage } from '../lib/i18n.ts';
	import { onDestroy } from 'svelte';
	import { app, setKey, forgetKey, refreshBalance } from '../lib/app.svelte.ts';
	import Sheet from './Sheet.svelte';
	import AffiliationNotice from './AffiliationNotice.svelte';
	import { default as ApiPeek } from './ApiPeek.svelte';
	import { balancePlan } from './apiPlans.ts';
	import {
		ui,
		connected,
		clearPendingConnection,
		pendingConnectionMinimumTier
	} from './state.svelte.ts';
	import { ExternalLink, KeyRound, Check } from './icons.ts';
	import { accountTier, tierDecision } from '../lib/pixellab/plans.ts';
	import TierNotice from './TierNotice.svelte';

	let key = $state('');
	let remember = $state(false);
	let msg = $state<Message | null>(null);
	let checking = $state(false);
	let closed = false;
	const activityScope = crypto.randomUUID();
	const minimumTier = pendingConnectionMinimumTier() ?? 0;
	onDestroy(() => {
		closed = true;
	});
	// R6 P1-4: a *.github.io project path (user.github.io/PixelDoll/) shares its origin, and so localStorage, with every other Pages project of that account
	const sharedOrigin =
		location.hostname.endsWith('.github.io') &&
		location.pathname.split('/').filter(Boolean).length > 0;
	async function use(k: string, rem: boolean) {
		checking = true;
		msg = null;
		setKey(k, rem, { activityScope, label: 'Connect PixelLab', background: false });
		key = '';
		await refreshBalance({ activityScope, label: 'Connect PixelLab', background: false });
		if (closed) return;
		checking = false;
		if (app.keyRejected) msg = message('connectSheet.keyRejected');
		else if (app.balanceError)
			msg = message('connectSheet.balanceError', { reason: app.balanceError });
		else if (tierDecision(app.balance, { required: minimumTier }).kind === 'required')
			clearPendingConnection();
		else if (accountTier(app.balance) === 0 && pendingConnectionMinimumTier() === null) return;
		else connected();
	}
</script>

<Sheet title={t('connectSheet.titleConnectPixelLab')} onclose={() => (ui.sheet = null)}>
	<div class="connect-hero">
		<span class="key-badge" aria-hidden="true"><KeyRound size={22} /></span>
		<div class="field">
			<p style="font-weight:600">
				{t('connectSheet.generateCharactersAndEquipmentWithYourPixelLab')}
			</p>
			<ul class="facts small">
				<li><Check size={14} />{t('connectSheet.generationsComeFromYourPixelLabAccount')}</li>
				<li><Check size={14} />{t('connectSheet.sentOnlyToApiPixellabAi')}</li>
			</ul>
		</div>
	</div>
	{#if app.key && !app.keyRejected}
		{@const remaining =
			app.balance && formatNumber(Math.round(app.balance.subscription.generations))}
		{@const total = app.balance && formatNumber(Math.round(app.balance.subscription.total))}
		<p class="notice ok small">
			<Check size={14} />{app.balance
				? app.remembered
					? t('connectSheet.connectedRememberedWithBalance', { remaining, total })
					: t('connectSheet.connectedForTabWithBalance', { remaining, total })
				: app.remembered
					? t('connectSheet.connectedRemembered')
					: t('connectSheet.connectedForTab')}
			<button class="bu-action btn sm" data-variant="outline" onclick={forgetKey}
				>{t('connectSheet.forgetKey')}</button
			>
		</p>
	{/if}
	<TierNotice {minimumTier} feature={t('connectSheet.thisGeneration')} />
	{#if app.key && !app.keyRejected && accountTier(app.balance) === 0}
		<p class="notice warn small" role="status">{t('connectSheet.freePlanNotice')}</p>
		<div class="field-row">
			<a
				class="bu-action btn sm"
				data-variant="outline"
				href="https://www.pixellab.ai/#pricing"
				target="_blank"
				rel="noreferrer">{t('connectSheet.viewPixelLabPlans')} <ExternalLink size={12} /></a
			><button
				class="bu-action btn sm"
				data-variant="outline"
				onclick={() => {
					clearPendingConnection();
					connected();
				}}>{t('connectSheet.continueWithLimitedAccess')}</button
			>
		</div>
	{/if}
	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault();
			if (key.trim()) void use(key, remember);
		}}
	>
		<label class="field">
			<span class="label">{t('connectSheet.aPIKey')}</span>
			<input
				class="bu-input input"
				type="password"
				bind:value={key}
				autocomplete="off"
				spellcheck="false"
				placeholder={t('connectSheet.placeholderPasteYourKey')}
			/>
		</label>
		<label class="toggle-row"
			><span>{t('connectSheet.rememberOnThisDevice')}</span><input
				class="switch"
				type="checkbox"
				bind:checked={remember}
			/></label
		>
		{#if remember && sharedOrigin}<p class="notice warn small">
				{t('connectSheet.sharedOriginWarning', { host: location.host })}
			</p>{/if}
		{#if msg}<p class="notice bad small">{displayMessage(msg)}</p>{/if}
		<AffiliationNotice multiline />
		<div class="field-row">
			<a class="small" href="https://pixellab.ai/account" target="_blank" rel="noreferrer"
				>{t('connectSheet.getAKey')} <ExternalLink size={12} style="display:inline" /></a
			>
			<span class="actions">
				<span class="api-action"
					><ApiPeek
						scope="account-connect"
						label={t('connectSheet.titleConnectPixelLab')}
						plan={balancePlan()}
						{activityScope}
					/><button
						class="bu-action btn primary"
						data-variant="primary"
						type="submit"
						disabled={!key.trim() || checking}
						>{checking ? t('connectSheet.checking') : t('connectSheet.connect')}</button
					></span
				>
			</span>
		</div>
	</form>
</Sheet>
