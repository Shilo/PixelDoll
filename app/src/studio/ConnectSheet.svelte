<script lang="ts">
	import { closeSettingsAccount } from './settingsNavigation.svelte.ts';
	import { t, type WhisperKey } from 'svelte-whisper';
	import { onDestroy, tick } from 'svelte';
	import { app, setKey, replaceKey, forgetKey, refreshBalance } from '../lib/app.svelte.ts';
	import { ApiError } from '../lib/pixellab/client.ts';
	import Sheet from './Sheet.svelte';
	import AffiliationNotice from './AffiliationNotice.svelte';
	import PixelLabUsage from './PixelLabUsage.svelte';
	import { default as ApiPeek } from './ApiPeek.svelte';
	import { balancePlan } from './apiPlans.ts';
	import {
		ui,
		connected,
		clearPendingConnection,
		pendingConnectionMinimumTier
	} from './state.svelte.ts';
	import { ExternalLink, KeyRound, Check, RefreshCw } from './icons.ts';
	import { accountTier, tierDecision } from '../lib/pixellab/plans.ts';
	import TierNotice from './TierNotice.svelte';

	let key = $state('');
	let remember = $state(false);
	let checking = $state(false);
	let refreshing = $state(false);
	const refreshLabel = $derived(t(refreshing ? 'usage.refreshing' : 'activity.refreshBalance'));
	let replacing = $state(false);
	let replacementError = $state<WhisperKey>();
	let limitedAccess = $state(false);
	let connectionFailed = $state(false);
	let keyInput = $state<HTMLInputElement>();
	let replaceButton = $state<HTMLButtonElement>();
	const needsKey = $derived(!app.key || app.keyRejected);
	const showForm = $derived(needsKey || replacing || checking || connectionFailed);
	const title = $derived(
		replacing
			? t('connectSheet.titleReplace')
			: app.keyRejected
				? t('connectSheet.reconnect')
				: showForm || limitedAccess
					? t('connectSheet.titleConnectPixelLab')
					: t('usage.title')
	);
	let closed = false;
	const activityScope = crypto.randomUUID();
	let minimumTier = $state(pendingConnectionMinimumTier() ?? 0);
	onDestroy(() => {
		closed = true;
	});
	// R6 P1-4: a *.github.io project path (user.github.io/PixelDoll/) shares its origin, and so localStorage, with every other Pages project of that account
	const sharedOrigin =
		location.hostname.endsWith('.github.io') &&
		location.pathname.split('/').filter(Boolean).length > 0;
	async function use(nextKey: string, save: boolean) {
		checking = true;
		connectionFailed = false;
		replacementError = undefined;
		key = '';
		if (replacing) {
			await confirmReplacement(nextKey, save);
			return;
		}
		await setKey(nextKey, save, { activityScope, label: 'Connect PixelLab', background: false });
		if (closed) return;
		checking = false;
		connectionFailed = !!app.balanceError && !app.keyRejected;
		if (needsKey || app.balanceError) return;
		limitedAccess =
			accountTier(app.balance) === 0 &&
			(pendingConnectionMinimumTier() === null ||
				tierDecision(app.balance, { required: minimumTier }).kind === 'required');
		if (tierDecision(app.balance, { required: minimumTier }).kind === 'required')
			clearPendingConnection();
		else if (!limitedAccess) finishConnection();
	}
	function finishConnection() {
		if (!closeSettingsAccount()) connected();
	}
	async function confirmReplacement(nextKey: string, save: boolean) {
		const isCurrent = () => !closed && ui.sheet === 'connect' && replacing;
		try {
			const installed = await replaceKey(nextKey, save, isCurrent, {
				activityScope,
				label: 'Connect PixelLab',
				background: false
			});
			if (!isCurrent()) return;
			if (installed) replacing = false;
			else {
				if (needsKey) replacing = false;
				replacementError = 'connectSheet.connectionChanged';
			}
		} catch (error) {
			if (!isCurrent()) return;
			replacementError =
				error instanceof ApiError && error.kind === 'auth'
					? 'connectSheet.replacementRejected'
					: 'connectSheet.replacementUnverified';
		}
		checking = false;
		if (showForm) await focusKey();
		else await focusReplace();
	}
	async function refresh() {
		if (refreshing) return;
		refreshing = true;
		await refreshBalance({ activityScope, label: 'Refresh balance', background: false });
		refreshing = false;
		if (app.keyRejected) await focusKey();
	}
	async function focusKey() {
		await tick();
		keyInput?.focus();
	}
	async function cancelReplace() {
		replacing = false;
		replacementError = undefined;
		key = '';
		if (needsKey) await focusKey();
		else await focusReplace();
	}
	async function focusReplace() {
		await tick();
		replaceButton?.focus();
	}
	function forget() {
		clearPendingConnection();
		minimumTier = 0;
		forgetKey();
		replacing = false;
		replacementError = undefined;
		remember = false;
		key = '';
		limitedAccess = false;
		connectionFailed = false;
		void focusKey();
	}
</script>

<Sheet
	{title}
	cancel={showForm ? 'common.cancel' : 'common.done'}
	onclose={() => {
		if (!closeSettingsAccount()) ui.sheet = null;
	}}
>
	{#if !showForm}
		<PixelLabUsage label={t('usage.generations')}>
			{#snippet actions()}
				<span class="api-action">
					<ApiPeek
						scope="account-balance-refresh"
						label={t('activity.refreshBalance')}
						plan={balancePlan()}
						{activityScope}
					/>
					<button
						type="button"
						class="bu-action btn icon plain"
						data-variant="quiet"
						aria-label={refreshLabel}
						title={refreshLabel}
						onclick={refresh}
						aria-disabled={refreshing}><RefreshCw size={17} aria-hidden="true" /></button
					>
				</span>
			{/snippet}
		</PixelLabUsage>
		{#if app.balanceError}
			<p class="notice bad small" role="status">
				{t('usage.loadFailed')}
			</p>
		{/if}
		<p class="small bu-muted">
			{t(app.remembered ? 'connectSheet.connectedRemembered' : 'connectSheet.connectedForTab')}
		</p>
		<TierNotice {minimumTier} feature={t('connectSheet.thisGeneration')} />
		{#if accountTier(app.balance) === 0}
			<p class="notice warn small" role="status">{t('connectSheet.freePlanNotice')}</p>
			<div class="field-row">
				<a
					class="bu-action btn sm"
					data-variant="outline"
					href="https://www.pixellab.ai/#pricing"
					target="_blank"
					rel="noreferrer">{t('connectSheet.viewPixelLabPlans')} <ExternalLink size={12} /></a
				>
				{#if limitedAccess}
					<button class="bu-action btn sm" data-variant="outline" onclick={finishConnection}
						>{t('connectSheet.continueWithLimitedAccess')}</button
					>
				{/if}
			</div>
		{/if}
		<div class="field-row">
			<button
				class="bu-action btn sm"
				data-variant="outline"
				bind:this={replaceButton}
				aria-label={t('connectSheet.replaceKey')}
				onclick={() => {
					replacing = true;
					remember = app.remembered;
					void focusKey();
				}}>{t('connectSheet.replaceKey')}</button
			>
			<button class="bu-action btn sm" data-variant="outline" onclick={forget}
				>{t('connectSheet.forgetKey')}</button
			>
		</div>
		<a class="small" href="https://www.pixellab.ai/account" target="_blank" rel="noreferrer"
			>{t('connectSheet.openAccount')} <ExternalLink size={12} style="display:inline" /></a
		>
	{:else}
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
		<TierNotice {minimumTier} feature={t('connectSheet.thisGeneration')} />
		{#if replacementError}
			<p class="notice bad small" role="status">{t(replacementError)}</p>
		{:else if app.keyRejected}
			<p class="notice bad small" role="status">
				{t('connectSheet.keyRejected')}
			</p>
		{:else if connectionFailed}
			<p class="notice bad small" role="status">{t('connectSheet.balanceError')}</p>
		{/if}
		<form
			class="form"
			onsubmit={(e) => {
				e.preventDefault();
				if (!checking && key.trim()) void use(key, remember);
			}}
		>
			<label class="field">
				<span class="label">{t('connectSheet.aPIKey')}</span>
				<input
					class="bu-input input"
					type="password"
					bind:this={keyInput}
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
			<AffiliationNotice multiline />
			<div class="field-row">
				<a class="small" href="https://pixellab.ai/account" target="_blank" rel="noreferrer"
					>{t('connectSheet.getAKey')} <ExternalLink size={12} style="display:inline" /></a
				>
				<span class="actions">
					{#if app.keyRejected && !checking}<button
							type="button"
							class="bu-action btn plain"
							data-variant="quiet"
							onclick={forget}>{t('connectSheet.forgetKey')}</button
						>{/if}
					{#if replacing && !checking}<button
							type="button"
							class="bu-action btn plain"
							data-variant="quiet"
							onclick={cancelReplace}>{t('connectSheet.keepKey')}</button
						>{/if}
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
							>{t(
								checking
									? 'connectSheet.checking'
									: replacing
										? 'connectSheet.replaceKey'
										: 'connectSheet.connect'
							)}</button
						></span
					>
				</span>
			</div>
		</form>
	{/if}
</Sheet>
