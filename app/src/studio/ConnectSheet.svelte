<script lang="ts">
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
	import { ExternalLink, KeyRound, Check } from './icons.ts';
	import { accountTier, FREE_PLAN_NOTICE, tierDecision } from '../lib/pixellab/plans.ts';
	import TierNotice from './TierNotice.svelte';

	let key = $state('');
	let remember = $state(false);
	let checking = $state(false);
	let refreshing = $state(false);
	let replacing = $state(false);
	let replacementError = $state('');
	let limitedAccess = $state(false);
	let connectionFailed = $state(false);
	let keyInput = $state<HTMLInputElement>();
	let replaceButton = $state<HTMLButtonElement>();
	const needsKey = $derived(!app.key || app.keyRejected);
	const showForm = $derived(needsKey || replacing || checking || connectionFailed);
	const title = $derived(
		replacing
			? 'Replace PixelLab key'
			: app.keyRejected
				? 'Reconnect PixelLab'
				: showForm || limitedAccess
					? 'Connect PixelLab'
					: 'PixelLab usage'
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
		replacementError = '';
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
		else if (!limitedAccess) connected();
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
				replacementError = 'The connection changed while checking. Try again.';
			}
		} catch (error) {
			if (!isCurrent()) return;
			replacementError =
				error instanceof ApiError && error.kind === 'auth'
					? 'PixelLab didn’t accept the new key. Current key was not changed.'
					: 'Couldn’t verify the new key. Current key was not changed.';
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
		replacementError = '';
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
		replacementError = '';
		remember = false;
		key = '';
		limitedAccess = false;
		connectionFailed = false;
		void focusKey();
	}
</script>

<Sheet {title} cancel={showForm ? 'Cancel' : 'Done'} onclose={() => (ui.sheet = null)}>
	{#if !showForm}
		<PixelLabUsage label="Generations">
			{#snippet actions()}
				<span class="api-action">
					<ApiPeek
						scope="account-balance-refresh"
						label="Refresh balance"
						plan={balancePlan()}
						{activityScope}
					/>
					<button
						class="bu-action btn sm"
						data-variant="outline"
						onclick={refresh}
						aria-disabled={refreshing}
					>
						{refreshing ? 'Refreshing…' : 'Refresh'}
					</button>
				</span>
			{/snippet}
		</PixelLabUsage>
		{#if app.balanceError}
			<p class="notice bad small" role="status">
				Couldn’t load usage from PixelLab. Try refreshing.
			</p>
		{/if}
		<p class="small bu-muted">
			Connected{app.remembered ? ' and remembered on this device' : ' for this tab'}.
		</p>
		<TierNotice {minimumTier} feature="This generation" />
		{#if accountTier(app.balance) === 0}
			<p class="notice warn small" role="status">{FREE_PLAN_NOTICE}</p>
			<div class="field-row">
				<a
					class="bu-action btn sm"
					data-variant="outline"
					href="https://www.pixellab.ai/#pricing"
					target="_blank"
					rel="noreferrer">View PixelLab plans <ExternalLink size={12} /></a
				>
				{#if limitedAccess}
					<button class="bu-action btn sm" data-variant="outline" onclick={connected}
						>Continue with limited access</button
					>
				{/if}
			</div>
		{/if}
		<div class="field-row">
			<button
				class="bu-action btn sm"
				data-variant="outline"
				bind:this={replaceButton}
				onclick={() => {
					replacing = true;
					remember = app.remembered;
					void focusKey();
				}}>Replace key</button
			>
			<button class="bu-action btn sm" data-variant="outline" onclick={forget}>Forget key</button>
		</div>
		<a class="small" href="https://www.pixellab.ai/account" target="_blank" rel="noreferrer"
			>Open PixelLab account <ExternalLink size={12} style="display:inline" /></a
		>
	{:else}
		<div class="connect-hero">
			<span class="key-badge" aria-hidden="true"><KeyRound size={22} /></span>
			<div class="field">
				<p style="font-weight:600">Generate characters and equipment with your PixelLab account.</p>
				<ul class="facts small">
					<li><Check size={14} />Generations come from your PixelLab account.</li>
					<li><Check size={14} />Sent only to api.pixellab.ai.</li>
				</ul>
			</div>
		</div>
		<TierNotice {minimumTier} feature="This generation" />
		{#if replacementError}
			<p class="notice bad small" role="status">{replacementError}</p>
		{:else if app.keyRejected}
			<p class="notice bad small" role="status">
				PixelLab didn’t accept this key. Enter a new API key to reconnect.
			</p>
		{:else if connectionFailed}
			<p class="notice bad small" role="status">Couldn’t reach PixelLab. Try connecting again.</p>
		{/if}
		<form
			class="form"
			onsubmit={(e) => {
				e.preventDefault();
				if (!checking && key.trim()) void use(key, remember);
			}}
		>
			<label class="field">
				<span class="label">API key</span>
				<input
					class="bu-input input"
					type="password"
					bind:this={keyInput}
					bind:value={key}
					autocomplete="off"
					spellcheck="false"
					placeholder="Paste your key"
				/>
			</label>
			<label class="toggle-row"
				><span>Remember on this device</span><input
					class="switch"
					type="checkbox"
					bind:checked={remember}
				/></label
			>
			{#if remember && sharedOrigin}<p class="notice warn small">
					This copy of PixelDoll runs in a folder of {location.host}, a site other GitHub Pages
					projects share. Any of their pages could read a remembered key. Leave Remember off here,
					or use PixelDoll from its own address.
				</p>{/if}
			<AffiliationNotice multiline />
			<div class="field-row">
				<a class="small" href="https://pixellab.ai/account" target="_blank" rel="noreferrer"
					>Get a key <ExternalLink size={12} style="display:inline" /></a
				>
				<span class="actions">
					{#if app.keyRejected && !checking}<button
							type="button"
							class="bu-action btn plain"
							data-variant="quiet"
							onclick={forget}>Forget key</button
						>{/if}
					{#if replacing && !checking}<button
							type="button"
							class="bu-action btn plain"
							data-variant="quiet"
							onclick={cancelReplace}>Keep current key</button
						>{/if}
					<span class="api-action"
						><ApiPeek
							scope="account-connect"
							label="Connect PixelLab"
							plan={balancePlan()}
							{activityScope}
						/><button
							class="bu-action btn primary"
							data-variant="primary"
							type="submit"
							disabled={!key.trim() || checking}
							>{checking ? 'Checking…' : replacing ? 'Replace key' : 'Connect'}</button
						></span
					>
				</span>
			</div>
		</form>
	{/if}
</Sheet>
