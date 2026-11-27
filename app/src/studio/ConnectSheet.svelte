<script lang="ts">
	import { closeSettingsAccount, settingsNavigation } from './settingsNavigation.svelte.ts';
	import { t, type WhisperKey } from 'svelte-whisper';
	import ReportButton from './ReportButton.svelte';
	import { message } from '../lib/message.ts';
	import { displayMessage } from '../lib/i18n.ts';
	import { balanceFacts } from './report.svelte.ts';
	import { onDestroy, onMount, tick } from 'svelte';
	import { app, setKey, replaceKey, forgetKey, refreshBalance } from '../lib/app.svelte.ts';
	import { ApiError } from '../lib/pixellab/client.ts';
	import Sheet from './Sheet.svelte';
	import SettingsItemToggle from './SettingsItemToggle.svelte';
	import AffiliationNotice from './AffiliationNotice.svelte';
	import PixelLabUsage from './PixelLabUsage.svelte';
	import { default as ApiPeek } from './ApiPeek.svelte';
	import { balancePlan } from './apiPlans.ts';
	import {
		ui,
		claimPixelLabConnectOpen,
		connected,
		clearPendingConnection,
		pendingConnectionMinimumTier,
		pendingConnectionPurchase
	} from './state.svelte.ts';
	import { Copy, ExternalLink, RefreshCw, TriangleAlert } from './icons.ts';
	import RichMessage from './RichMessage.svelte';
	import NoticeLink from './NoticeLink.svelte';
	import { accountTier, tierDecision } from '../lib/pixellab/plans.ts';
	import TierNotice from './TierNotice.svelte';
	import { workspaceCopy } from '../lib/store/workspace-mode.ts';
	import { readSavedKey, SAVED_KEY } from '../lib/shared-auth.ts';

	// Settings > Replace key opens straight into the replacement form and returns to Settings when it ends.
	const replaceOnly =
		settingsNavigation.accountOpen &&
		settingsNavigation.accountReplace &&
		!!app.key &&
		!app.keyRejected;
	const accountUrl = 'https://www.pixellab.ai/account';
	let key = $state('');
	let remember = $state(replaceOnly && app.remembered);
	let savedKeyAvailable = $state(workspaceCopy && !!readSavedKey().trim());
	let checking = $state(false);
	let refreshing = $state(false);
	const refreshLabel = $derived(t(refreshing ? 'usage.refreshing' : 'activity.refreshBalance'));
	let replacing = $state(replaceOnly);
	let replacementError = $state<WhisperKey>();
	let replacementFailure = $state<unknown>();
	let limitedAccess = $state(false);
	let connectionFailed = $state(false);
	let firstOpen = $state(false);
	let guideIntro = $state<HTMLParagraphElement>();
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
	const externalHint = $props.id();
	const purchaseHint = `${externalHint}-purchase`;
	const purchaseCost = `${externalHint}-cost`;
	const purchase = pendingConnectionPurchase();
	const purchaseEstimate = $derived(purchase ? displayMessage(purchase.estimate) : '');
	let minimumTier = $state(pendingConnectionMinimumTier() ?? 0);
	const submitLabel = $derived(
		t(
			checking
				? 'connectSheet.checking'
				: replacing
					? 'connectSheet.replaceKey'
					: 'connectSheet.connect'
		)
	);
	onMount(() => {
		firstOpen = claimPixelLabConnectOpen() && showForm;
		if (firstOpen) void tick().then(() => guideIntro?.focus());
	});
	onDestroy(() => {
		closed = true;
	});
	// R6 P1-4: a *.github.io project path (user.github.io/PixelDoll/) shares its origin, and so localStorage, with every other Pages project of that account
	const sharedOrigin =
		location.hostname.endsWith('.github.io') &&
		location.pathname.split('/').filter(Boolean).length > 0;
	function refreshSavedKey(event?: StorageEvent) {
		if (workspaceCopy && (!event || event.key === null || event.key === SAVED_KEY))
			savedKeyAvailable = !!readSavedKey().trim();
	}
	function useSavedKey() {
		if (!workspaceCopy || checking || replacing) return;
		const saved = readSavedKey().trim();
		if (saved) void use(saved, false, true);
		else refreshSavedKey();
	}
	async function use(nextKey: string, save: boolean, fromStorage = false) {
		checking = true;
		connectionFailed = false;
		replacementError = undefined;
		key = '';
		if (replacing) {
			await confirmReplacement(nextKey, save);
			return;
		}
		const activity = { activityScope, label: 'Connect PixelLab', background: false };
		if (workspaceCopy) {
			const isCurrent = () =>
				!closed && ui.sheet === 'connect' && (!fromStorage || readSavedKey().trim() === nextKey);
			try {
				if (!(await replaceKey(nextKey, false, isCurrent, activity)))
					replacementError = 'connectSheet.connectionChanged';
			} catch (error) {
				replacementFailure = error;
				replacementError =
					error instanceof ApiError && error.kind === 'auth'
						? 'connectSheet.keyRejected'
						: 'connectSheet.balanceError';
			}
		} else await setKey(nextKey, save, activity);
		if (closed) return;
		checking = false;
		connectionFailed = !!app.balanceError && !app.keyRejected;
		if (needsKey || app.balanceError || replacementError) return;
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
			if (installed && replaceOnly && closeSettingsAccount()) return;
			if (installed) replacing = false;
			else {
				if (needsKey) replacing = false;
				replacementError = 'connectSheet.connectionChanged';
			}
		} catch (error) {
			if (!isCurrent()) return;
			replacementFailure = error;
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
		if (replaceOnly && !needsKey && closeSettingsAccount()) return;
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

<svelte:window onstorage={refreshSavedKey} onfocus={() => refreshSavedKey()} />

<Sheet
	{title}
	back={settingsNavigation.accountOpen ? closeSettingsAccount : undefined}
	backTo={t('export.sheet.settings')}
	onclose={() => (ui.sheet = null)}
>
	{#snippet developer()}
		<ApiPeek
			targets={showForm
				? [
						{
							scope: 'account-connect',
							label: t('connectSheet.titleConnectPixelLab'),
							plan: balancePlan(),
							activityScope
						}
					]
				: [
						{
							scope: 'account-balance-refresh',
							label: t('activity.refreshBalance'),
							plan: balancePlan(),
							activityScope
						}
					]}
		/>
	{/snippet}

	{#if !showForm}
		<PixelLabUsage label={t('usage.generations')}>
			{#snippet actions()}
				<span class="api-action">
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
			<p class="bu-notice" data-size="compact" data-tone="danger" role="status">
				{t('usage.loadFailed')}<ReportButton
					message={message('usage.loadFailed')}
					facts={balanceFacts()}
				/>
			</p>
		{/if}
		<p class="small bu-muted">
			{t(app.remembered ? 'connectSheet.connectedRemembered' : 'connectSheet.connectedForTab')}
		</p>
		<TierNotice {minimumTier} feature={t('connectSheet.thisGeneration')} />
		{#if accountTier(app.balance) === 0}
			<p class="bu-notice" data-size="compact" data-tone="warning" role="status">
				{t('connectSheet.freePlanNotice')}
			</p>
			<div class="field-row">
				<a
					class="bu-action btn sm"
					data-variant="outline"
					href="https://www.pixellab.ai/#pricing"
					target="_blank"
					rel="noreferrer"
					aria-describedby={externalHint}
					>{t('connectSheet.viewPixelLabPlans')} <ExternalLink size={16} aria-hidden="true" /></a
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
		<a
			class="small"
			href={accountUrl}
			target="_blank"
			rel="noreferrer"
			aria-describedby={externalHint}
			>{t('connectSheet.openAccount')}
			<ExternalLink size={16} aria-hidden="true" style="display:inline" /></a
		>
	{:else}
		{#snippet secret()}<strong>{t('connectSheet.secretLabel')}</strong>{/snippet}
		{#snippet copy()}
			<span class="copy-label"
				><Copy size={14} aria-hidden="true" />{t('connectSheet.copyKey')}</span
			>
		{/snippet}
		{#if needsKey && minimumTier > 0}
			<NoticeLink
				href="https://www.pixellab.ai/#pricing"
				tone="warning"
				label={`${t('tierNotice.requiredLink', { tier: minimumTier })} ${t('connectSheet.trialNotEnough')}`}
			>
				{#snippet indicator()}<TriangleAlert size={18} />{/snippet}
				<strong>{t('tierNotice.requiredTitle', { tier: minimumTier })}</strong>
				<span>{t('connectSheet.trialNotEnough')}</span>
			</NoticeLink>
		{/if}
		{#if firstOpen && !replacing}
			<div class="field trial-guide">
				<p tabindex="-1" bind:this={guideIntro}>{t('connectSheet.generationProvider')}</p>
				<a
					class="bu-action btn"
					data-variant={minimumTier > 0 || key.trim() || checking ? 'outline' : 'primary'}
					href="https://www.pixellab.ai/signup"
					target="_blank"
					rel="noreferrer"
					>{t('connectSheet.startFreeTrial')} <ExternalLink size={14} aria-hidden="true" /></a
				>
				{#snippet account()}
					<a href={accountUrl} target="_blank" rel="noreferrer"
						>{t('connectSheet.pixelLabAccount')}</a
					>
				{/snippet}
				<p class="small bu-muted">
					<RichMessage key="connectSheet.copyInstructions" slots={{ account, secret, copy }} />
				</p>
			</div>
		{/if}
		<TierNotice {minimumTier} feature={t('connectSheet.thisGeneration')} />
		{#if replacementError}
			<!-- Only a failed check is a problem to report: a rejected key or a change from another tab is the person's to act on. -->
			<p class="bu-notice" data-size="compact" data-tone="danger" role="status">
				{t(
					replacementError
				)}{#if replacementError === 'connectSheet.balanceError' || replacementError === 'connectSheet.replacementUnverified'}<ReportButton
						message={message(replacementError)}
						error={replacementFailure}
					/>{/if}
			</p>
		{:else if app.keyRejected}
			<p class="bu-notice" data-size="compact" data-tone="danger" role="status">
				{t('connectSheet.keyRejected')}
			</p>
		{:else if connectionFailed}
			<p class="bu-notice" data-size="compact" data-tone="danger" role="status">
				{t('connectSheet.balanceError')}<ReportButton
					message={message('connectSheet.balanceError')}
					facts={balanceFacts()}
				/>
			</p>
		{/if}
		<form
			class="form"
			onsubmit={(e) => {
				e.preventDefault();
				if (!checking && key.trim()) void use(key, remember);
			}}
		>
			<label class="field">
				<span class="label">{t('connectSheet.secretApiKey')}</span>
				<input
					class="bu-input input"
					type="password"
					bind:this={keyInput}
					bind:value={key}
					autocomplete="off"
					spellcheck="false"
					placeholder="pixl_0123456789abcdef0123456789abcdef"
				/>
			</label>
			{#if workspaceCopy}
				<p class="small bu-muted">{t('workspaceCopy.tabOnlyKey')}</p>
				{#if savedKeyAvailable && !replacing}<div class="field-row">
						<button
							type="button"
							class="bu-action btn sm"
							data-variant="outline"
							disabled={checking}
							onclick={useSavedKey}>{t('workspaceCopy.useSavedKey')}</button
						>
					</div>{/if}
			{:else}
				<SettingsItemToggle
					checked={remember}
					onchange={(event) => (remember = event.currentTarget.checked)}
				>
					<span>{t('connectSheet.rememberOnThisDevice')}</span>
				</SettingsItemToggle>
			{/if}
			{#if !workspaceCopy && remember && sharedOrigin}<p
					class="bu-notice"
					data-size="compact"
					data-tone="warning"
				>
					{t('connectSheet.sharedOriginWarning', { host: location.host })}
				</p>{/if}
			<p class="small bu-muted">{t('connectSheet.sentOnlyToApiPixellabAi')}</p>
			{#if !purchase}<p class="small bu-muted">{t('connectSheet.demoNoAccount')}</p>{/if}
			<AffiliationNotice multiline />
			{#if purchase && !replacing}
				<p id={purchaseHint} class="small">
					{t('connectSheet.resumePurchase', { name: purchase.name })}
				</p>
			{/if}
			<div class="field-row">
				<a
					class="bu-action btn"
					data-variant="outline"
					href={accountUrl}
					target="_blank"
					rel="noreferrer"
					aria-describedby={externalHint}
					>{t('connectSheet.getSecretKey')}
					<ExternalLink size={14} aria-hidden="true" /></a
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
						><button
							class="bu-action btn primary"
							data-variant="primary"
							type="submit"
							disabled={!key.trim() || checking}
							aria-describedby={purchase && !replacing
								? `${purchaseHint} ${purchaseCost}`
								: undefined}
							>{submitLabel}
							{#if purchase && !replacing}<span class="cost" aria-hidden="true"
									>~{purchaseEstimate}</span
								>{/if}</button
						>{#if purchase && !replacing}<span id={purchaseCost} hidden
								>{t('create.sheet.estimated', { gens: purchaseEstimate })}</span
							>{/if}</span
					>
				</span>
			</div>
		</form>
	{/if}
	<span id={externalHint} hidden>{t('noticeLink.opensInANewTab')}</span>
</Sheet>

<style>
	.trial-guide {
		gap: 10px;
	}
	.trial-guide > a {
		width: 100%;
		justify-content: space-between;
		text-align: start;
	}
	.copy-label {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		vertical-align: middle;
	}
</style>
