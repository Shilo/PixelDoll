<script lang="ts">
	import { t } from 'svelte-whisper';
	import { onMount, tick } from 'svelte';
	import {
		pwa,
		startPwa,
		setPwaActions,
		applyUpdate,
		prepareUpdateInNewTab,
		installApp
	} from '../lib/pwa.ts';
	import { errorMessage } from '../lib/i18n.ts';
	import { displayPwaError } from './pwaText.ts';
	import { displayNestedMessage } from './nestedMessage.ts';
	import { message, type Message } from '../lib/message.ts';
	import { prepareForUpdate, updateBlocked } from './state.svelte.ts';
	import { restoreTrigger } from './experience/focus.ts';
	import { app } from '../lib/app.svelte.ts';
	import {
		openStartupUpdateWindow,
		claimStartupUpdate,
		assertStartupUpdate,
		markStartupUpdateReload,
		StartupUpdateCancelled
	} from '../lib/startup-update.ts';

	let dialog: HTMLDialogElement;
	let mode = $state<'update' | 'install' | null>(null);
	let busy = $state(false),
		error = $state<Message | string>('');
	let updateUrl = $state(''),
		updateLink = $state<HTMLAnchorElement>();
	let from: HTMLElement | null = null;
	const ios =
		/iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	async function show(next: 'update' | 'install') {
		if (busy || mode) return;
		from = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		document
			.querySelectorAll<HTMLElement>('[popover]:popover-open')
			.forEach((el) => el.hidePopover());
		error = '';
		updateUrl = '';
		mode = next;
		await tick();
		if (mode !== next || (next === 'install' && $pwa.installed)) return;
		dialog.showModal();
		if (next === 'update') {
			const reason = updateBlocked();
			if (reason) {
				error = reason;
				return;
			}
			if (!$pwa.ready) {
				error = message('pwaRuntime.stillDownloading');
				return;
			}
			busy = true;
			try {
				await applyUpdate(prepareForUpdate);
			} catch (e) {
				error = errorMessage(e);
				busy = false;
			}
		}
	}
	function close() {
		if (busy) return;
		dialog.close();
		mode = null;
		restoreTrigger(from);
	}
	async function updateInNewTab() {
		if (busy || !$pwa.ready) return;
		busy = true;
		error = '';
		try {
			const url = await prepareUpdateInNewTab();
			// Some browsers expire the click permission while preparing the release. Offer a direct link in that case.
			const tab = navigator.userActivation?.isActive === false ? null : window.open(url, '_blank');
			busy = false;
			if (tab) {
				tab.opener = null;
				close();
			} else {
				updateUrl = url;
				await tick();
				updateLink?.focus();
			}
		} catch (e) {
			error = errorMessage(e);
			busy = false;
		}
	}
	async function install() {
		if ((await installApp()) && mode === 'install') close();
	}
	$effect(() => {
		if (mode === 'install' && $pwa.installed) close();
	});
	function validateAutomatic() {
		assertStartupUpdate();
		if (mode || (app.key && !app.remembered) || updateBlocked()) throw new StartupUpdateCancelled();
	}
	$effect(() => {
		if (
			!import.meta.env.PROD ||
			!$pwa.available ||
			!$pwa.ready ||
			mode ||
			(app.key && !app.remembered) ||
			updateBlocked()
		)
			return;
		if (!claimStartupUpdate()) return;
		let committed = false;
		void applyUpdate(prepareForUpdate, {
			validate: validateAutomatic,
			beforeReload: () => {
				validateAutomatic();
				markStartupUpdateReload();
				dialog.showModal();
				mode = 'update';
				busy = true;
				committed = true;
			}
		}).catch((cause) => {
			if (cause instanceof StartupUpdateCancelled) return;
			const reason = errorMessage(cause);
			if (committed) {
				error = reason;
				busy = false;
			} else
				pwa.update((s) => ({
					...s,
					error: message('pwaRuntime.automaticPaused', { reason })
				}));
		});
	});
	onMount(() => {
		if (import.meta.env.PROD) openStartupUpdateWindow();
		const stop = startPwa();
		const off = setPwaActions(
			() => {
				void show('update');
			},
			() => {
				void show('install');
			}
		);
		// With Close disabled, native Tab can focus BODY outside the modal. Shield global Studio shortcuts there too.
		const shield = (event: Event) => {
			if (dialog.open && (!(event.target instanceof Node) || !dialog.contains(event.target))) {
				event.stopImmediatePropagation();
				if (event.cancelable) event.preventDefault();
			}
		};
		window.addEventListener('keydown', shield, true);
		window.addEventListener('wheel', shield, { capture: true, passive: false });
		return () => {
			window.removeEventListener('keydown', shield, true);
			window.removeEventListener('wheel', shield, true);
			off();
			stop();
		};
	});
</script>

<dialog
	bind:this={dialog}
	class="sheet center pwa-dialog"
	aria-labelledby="pwa-dialog-title"
	aria-describedby="pwa-dialog-description"
	onkeydown={(e) => e.stopPropagation()}
	onwheel={(e) => e.stopPropagation()}
	oncancel={(e) => {
		e.preventDefault();
		close();
	}}
>
	{#if mode}
		<header class="sheet-head">
			<span></span>
			<h2 id="pwa-dialog-title" class="sheet-title">
				{mode === 'install'
					? t('pwaRuntime.installationHelp')
					: busy
						? t('pwaRuntime.updatingPixelDoll')
						: updateUrl
							? t('pwaRuntime.updateReady')
							: t('pwaRuntime.updatePaused')}
			</h2>
			<button class="bu-action" data-variant="quiet" disabled={busy} onclick={close}
				>{t('common.close')}</button
			>
		</header>
		<div class="sheet-body" id="pwa-dialog-description">
			{#if mode === 'install'}
				{#if $pwa.installError}<p role="alert">{displayNestedMessage($pwa.installError)}</p>{/if}
				{#if $pwa.installable || $pwa.installing}
					<p>{t('pwaRuntime.yourBrowserIsReadyToInstallPixelDoll')}</p>
					<button
						class="bu-action"
						data-variant="primary"
						disabled={$pwa.installing}
						onclick={install}>{t('pwaRuntime.installPixelDoll')}</button
					>
				{:else}
					<p>
						{t('pwaRuntime.aBrowserInstallPromptIsnTAvailable')}
					</p>
					{#if ios}<p>
							{t('pwaRuntime.onIPhoneOrIPadOpenPixelDollIn')}
						</p>
					{:else}<p>
							{t('pwaRuntime.ifYourBrowserOffersInstallAppAdd')}
						</p>{/if}
				{/if}
				<p>
					{t('pwaRuntime.savedCharactersDressingRecoloringDeviceImportAnd')}
				</p>
				<p role="status">
					{$pwa.offlineReady
						? t('pwaRuntime.appFilesAreReadyForOfflineLaunches')
						: t('pwaRuntime.offlineFilesAreNotReadyYetKeep')}
				</p>
				{#if $pwa.error}<p role="status">{displayPwaError($pwa.error)}</p>{/if}
			{:else if updateUrl}
				<p role="status">{t('pwaRuntime.openTheUpdatedAppInANew')}</p>
				<a
					bind:this={updateLink}
					class="bu-action"
					data-variant="primary"
					href={updateUrl}
					target="_blank"
					rel="noopener"
					onclick={close}>{t('pwaRuntime.openUpdatedApp')}</a
				>
			{:else if error}
				<p role="alert">{displayNestedMessage(error)}</p>
				<p>{t('pwaRuntime.updateNowOpensTheVerifiedVersionIn')}</p>
				<button
					type="button"
					class="bu-action"
					data-variant="primary"
					disabled={!$pwa.ready}
					onclick={updateInNewTab}>{t('pwaRuntime.updateNow')}</button
				>
			{:else}<p role="status">
					{$pwa.reloading
						? t('pwaNotice.readyToUpdateReloading')
						: t('pwaRuntime.preparingTheUpdateKeepThisTabOpen')}
				</p>{/if}
		</div>
	{/if}
</dialog>

<style>
	.pwa-dialog {
		max-width: min(32rem, calc(100vw - 32px));
	}
	.pwa-dialog .sheet-head {
		grid-template-columns: 1fr auto 1fr;
	}
	.pwa-dialog .sheet-head button {
		justify-self: end;
	}
	.pwa-dialog .sheet-body {
		display: grid;
		gap: 12px;
	}
	.pwa-dialog p {
		margin: 0;
	}
</style>
