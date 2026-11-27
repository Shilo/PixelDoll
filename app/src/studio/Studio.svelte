<script lang="ts">
	import { message } from '../lib/message.ts';
	import { t } from 'svelte-whisper';
	import './studio.css';
	import './share.css';
	import './experience/theme.css';
	import './experience/layout.css';
	import './experience/hoverActions.css';
	import { rememberActivation } from './experience/focus.ts';
	import {
		closeSettings,
		closeSettingsAccount,
		closeSettingsActivity,
		closeSettingsCost,
		closeSettingsExport,
		isSettingsShortcut,
		openSettings,
		settingsNavigation
	} from './settingsNavigation.svelte.ts';
	import { alertOnTop, sheetBrowserBack } from './sheetExit.ts';
	import { localDeveloperToolsEnabled } from './developerMode.svelte.ts';
	import Experience from './experience/Experience.svelte';
	import { onMount, untrack } from 'svelte';
	import { app, refreshBalance } from '../lib/app.svelte.ts';
	import { queue } from '../lib/pixellab/queue.ts';
	import Lazy from './Lazy.svelte';
	import RenameSheet from './RenameSheet.svelte';
	import DeleteSheet from './DeleteSheet.svelte';
	import DirectionsSheet from './DirectionsSheet.svelte';
	import { moveDirs } from '../lib/dress/dress.ts';
	import { workspaceCopy } from '../lib/store/workspace-mode.ts';
	import { experience } from './experience/state.svelte.ts';
	import {
		ui,
		doc,
		store,
		view,
		gens,
		genOf,
		creates,
		createPresentation,
		reviewFailedCreate,
		settingUp,
		initUi,
		generationPending,
		refreshProjects,
		openProject,
		lastProject,
		loadGens,
		toast,
		activateToast,
		dismissToast,
		resumeCreate,
		resumeMove,
		resumeSetup,
		startupResumed,
		startupFailed,
		prefetchFlows,
		clearPendingConnection,
		cancelWaitingForTab,
		undo,
		redo,
		stepPreviewFrame
	} from './state.svelte.ts';
	import { lazy } from '../lib/lazy.ts';
	import { WifiOff } from './icons.ts';
	import { PRE_RELEASE, PREVIEW_NOTICE } from './previewNotice.ts';
	import Toast from './Toast.svelte';
	import ReportDialog from './ReportDialog.svelte';
	import { reportDialog } from './report.svelte.ts';
	import LibraryBackupButton from './LibraryBackupButton.svelte';
	import { downloadLibraryBackupWithFeedback } from './downloadLibraryBackup.ts';
	import PwaRuntime from './PwaRuntime.svelte';

	// On-demand parts, out of the startup bundle.
	const parts = {
		connect: () => import('./ConnectSheet.svelte'),
		create: () => import('./CreateSheet.svelte'),
		newitem: () => import('./NewItemSheet.svelte'),
		export: () => import('./ExportSheet.svelte'),
		settings: () => import('./SettingsSheet.svelte'),
		activity: () => import('./ActivitySheet.svelte'),
		move: () => import('./MoveSheet.svelte'),
		moveReview: () => import('./MoveReviewSheet.svelte'),
		itemGeneration: () => import('./ItemGenerationSheet.svelte'),
		stateCapture: () => import('./StateCaptureSheet.svelte'),
		stateReview: () => import('./StateReviewSheet.svelte'),
		appearance: () => import('./AppearanceSheet.svelte'),
		importZip: () => import('./ImportSheet.svelte'),
		importPixelLab: () => import('./ImportSheet.svelte'),
		setup: () => import('./SetupSheet.svelte'),
		item: () => import('./ItemPane.svelte'),
		notes: () => import('./StageNote.svelte'),
		gen: () => import('./GenCard.svelte'),
		details: () => import('./CharacterWindow.svelte'),
		slots: () => import('./SlotsSheet.svelte'),
		frames: () => import('./FramesSheet.svelte'),
		adjustFrame: () => import('./AdjustFrameSheet.svelte'),
		cost: () => import('./CostSheet.svelte'),
		workspace: () => import('./WorkspaceSheet.svelte')
	};

	$effect(() => {
		if (ui.sheet === 'gen' && (!genOf(ui.selected) || genOf(ui.selected)?.phase === 'running'))
			ui.sheet = null;
	});
	$effect(() => {
		if (experience.screen === 'studio' && ui.toast === previewNoticeDetails && !backingUp)
			untrack(dismissToast);
	});
	$effect(() => {
		if (!workspaceCopy || !generationPending()) return;
		const warn = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	});

	// once on mount (an $effect would re-run on every state it reads, e.g. the theme)
	onMount(() => {
		document.documentElement.dataset.app = 'studio';
		if (import.meta.env.DEV)
			(window as unknown as { __studio: unknown }).__studio = {
				ui,
				doc,
				store,
				gens,
				creates,
				createPresentation,
				reviewFailedCreate,
				loadGens
			};
		if (workspaceCopy) ui.welcome = false;
		const off = initUi();
		if (PRE_RELEASE && !workspaceCopy)
			toast(previewNoticeDetails, { ...PREVIEW_NOTICE, action: downloadLibraryBackupWithFeedback });
		void (async () => {
			const listed = await refreshProjects();
			const initial = lastProject();
			const initialProject = store.projects.find((project) => project.id === initial);
			await openProject(
				(workspaceCopy && !initialProject) || (initialProject?.dev && !localDeveloperToolsEnabled())
					? 'fixture:s2'
					: initial
			);
			if (workspaceCopy) {
				ui.playing = false;
				return;
			}
			// A failed read keeps item work stopped (startItem and Clear finished wait for it); create and moves still resume.
			await loadGens().catch((e: Error) => {
				console.error('drafts', e);
				toast(message('state.savedItemDraftsCouldNotBeRead', { reason: e.message }), {
					tone: 'danger'
				});
			});
			await resumeCreate();
			await resumeMove();
			await resumeSetup();
			// An unreadable character list means saved work did not load; the update controls offer recovery. refreshProjects
			// already said so.
			if (!listed)
				return startupFailed(new Error('Your saved characters could not be read.'), true);
			startupResumed();
			// Once startup is done, fetch the on-demand code so it keeps working if the connection drops or a deploy replaces its
			// files. Production only: the dev server would transform every module on each page load. lazy() logs failures.
			if (import.meta.env.PROD)
				void Promise.allSettled([
					...Object.values(parts).map((load) => lazy<unknown>(load)),
					prefetchFlows()
				]);
		})().catch(startupFailed);
		return () => {
			off();
			delete document.documentElement.dataset.app;
		};
	});

	// one playback clock for every visible sprite (D1 §3.6 rule 5)
	$effect(() => {
		const a = view.anim;
		if (!a || !ui.playing) return;
		const t = setTimeout(() => ui.frame++, a.frames[ui.frame % a.frames.length].ms);
		return () => clearTimeout(t);
	});

	// Back (browser button, Android gesture) closes an open sheet first: one history entry while any sheet is open.
	// ponytail: not reactive on purpose (plain flag); a sheet -> sheet switch keeps the same entry.
	let sheetEntry = false;
	$effect(() => {
		const open = !!ui.sheet || ui.settingsOverlay;
		if (open && !sheetEntry) {
			history.pushState({ pixeldollSheet: 1 }, '');
			sheetEntry = true;
		} else if (!open && sheetEntry) {
			sheetEntry = false;
			history.back();
		}
	});
	// Closing Connect cancels its spending action, also when the sheet closes before its code loaded (ConnectSheet never mounted).
	$effect(() => {
		if (ui.sheet !== 'connect') {
			clearPendingConnection();
			settingsNavigation.accountOpen = false;
		}
	});
	// Leaving Activity by any route (Done, Back, another sheet) cancels a click waiting there for the other tab. Before
	// Activity opens, the click waits quietly for an idle tab to hand over the jobs.
	let sheetBefore: typeof ui.sheet = null;
	$effect(() => {
		const sheet = ui.sheet;
		if (sheetBefore === 'activity' && sheet !== 'activity') cancelWaitingForTab();
		if (sheet !== 'activity') settingsNavigation.activityOpen = false;
		if (sheet !== 'cost') settingsNavigation.costOpen = false;
		// A character tool returns to the character's window only while one of them, or the window, is open.
		if (
			sheet !== 'details' &&
			sheet !== 'adjustFrame' &&
			sheet !== 'directions' &&
			sheet !== 'cost'
		)
			ui.returnTo = null;
		if (sheet !== 'export' && !(sheet === 'settings' && settingsNavigation.fromExport))
			settingsNavigation.exportOpen = false;
		sheetBefore = sheet;
	});
	const onpop = () => {
		if (!sheetEntry) return;
		// An atomic local save/publish has the same disabled-close rule for browser Back as for its X and Escape.
		if (ui.sheetBusy && !ui.settingsOverlay && !alertOnTop()) {
			history.pushState({ pixeldollSheet: 1 }, '');
			return;
		}
		// An open menu or picker answers Back first, as Escape does, before the sheet behind it.
		const popup = [...document.querySelectorAll<HTMLElement>('[popover]:popover-open')]
			.filter((element) => element.getAttribute('popover') !== 'manual')
			.at(-1);
		if (popup) {
			popup.hidePopover();
			history.pushState({ pixeldollSheet: 1 }, '');
			return;
		}
		// Otherwise Back takes the sheet's own Back (an inner pane) or its close request, which may ask first.
		sheetEntry = false;
		// A sheet still loading (lazy) has not claimed its exits yet: a Settings child still steps back to Settings.
		if (ui.settingsOverlay && !document.querySelector('dialog.settings-sheet:modal'))
			closeSettings();
		else if (
			!sheetBrowserBack() &&
			!(
				closeSettingsAccount() ||
				closeSettingsActivity() ||
				closeSettingsCost() ||
				closeSettingsExport()
			)
		)
			ui.sheet = null;
		if (ui.sheet || ui.settingsOverlay) {
			history.pushState({ pixeldollSheet: 1 }, '');
			sheetEntry = true;
		}
	};

	// balance after every settled job (like TopBar)
	const settled = $derived($queue.counts.done + $queue.counts.failed);
	let observedFinished = new Set<string>();
	$effect(() => {
		void settled;
		// One balance read may serve several jobs that finished together. Link it to all their peeks.
		const fresh = untrack(() => {
			const finished = $queue.jobs.filter(
				(job) => job.state === 'done' || job.state === 'failed' || job.state === 'lost'
			);
			const added = finished.filter((job) => !observedFinished.has(job.id));
			observedFinished = new Set(finished.map((job) => job.id));
			return added;
		});
		untrack(() =>
			refreshBalance({
				background: true,
				label: 'Update account balance',
				relatedQueueIds: fresh.map((job) => job.id),
				relatedScopes: [
					...new Set(fresh.flatMap((job) => (job.activityScope ? [job.activityScope] : [])))
				]
			})
		);
	});
	// the page title shows running work
	const running = $derived(
		gens.filter((g) => g.phase === 'running').length +
			creates.filter((run) => run.running && !run.error).length +
			(settingUp.spec && !settingUp.done && !settingUp.error ? 1 : 0)
	);
	$effect(() => {
		document.title = workspaceCopy
			? t('studio.workspaceCopyTabTitle')
			: running
				? `(${running}) PixelDoll`
				: 'PixelDoll';
	});

	function onkey(e: KeyboardEvent) {
		// Like other apps, the settings shortcut works from anywhere, including text fields and other sheets.
		if (isSettingsShortcut(e)) {
			e.preventDefault();
			if (ui.sheet !== 'settings' && !ui.settingsOverlay) openSettings();
			return;
		}
		const t = e.target as HTMLElement;
		// T2: arrow keys (Home/End) move between the options of a segmented control, tab list, radio group or a [data-arrows]
		// rail (selection follows focus, WAI-ARIA) and between the rows of a menu (focus only)
		const group = t.closest?.(
			'[role=tablist], [role=radiogroup], .seg[role=group], [role=menu], [data-arrows]'
		);
		if (group && /^(Arrow(Left|Right|Up|Down)|Home|End)$/.test(e.key)) {
			const menu = group.getAttribute('role') === 'menu';
			const all = [...group.querySelectorAll<HTMLElement>(menu ? '.row' : 'button')].filter(
				(o) => !(o as HTMLButtonElement).disabled && o.getClientRects().length
			);
			// aria-disabled options stay focusable by Tab with their reason, but arrows (which select) skip them; from one,
			// arrows step to its nearest enabled neighbor.
			const opts = all.filter((o) => o.getAttribute('aria-disabled') !== 'true');
			const at = all.indexOf(t);
			if (at < 0 || !opts.length) return;
			e.preventDefault();
			const before = opts.filter((o) => all.indexOf(o) < at).length,
				enabled = opts.includes(t);
			const n =
				e.key === 'Home'
					? 0
					: e.key === 'End'
						? opts.length - 1
						: (before + (/Right|Down/.test(e.key) ? (enabled ? 1 : 0) : -1) + opts.length) %
							opts.length;
			opts[n].focus();
			if (!menu && opts[n].getAttribute('aria-haspopup') !== 'dialog') opts[n].click();
			return;
		}
		if (
			ui.settingsOverlay ||
			(ui.sheet && ui.sheet !== 'inspect') ||
			t.closest('input, textarea, select, [contenteditable]')
		)
			return;
		const mod = e.ctrlKey || e.metaKey;
		const m = store.project?.manifest;
		if (mod && e.key.toLowerCase() === 'z') {
			e.preventDefault();
			if (e.shiftKey) redo();
			else undo();
			return;
		}
		if (mod && e.key.toLowerCase() === 'y') {
			e.preventDefault();
			redo();
			return;
		}
		if (mod && e.altKey && e.key.toLowerCase() === 'i') {
			e.preventDefault();
			if (m) ui.sheet = ui.sheet === 'inspect' ? null : 'inspect';
			return;
		}
		if (mod || e.altKey || !m) return;
		if (ui.sheet !== 'inspect') return;
		if (e.key === ' ' && !t.closest('button, a')) {
			e.preventDefault();
			ui.playing = !ui.playing;
		} else if (e.key === ',' || e.key === '.') {
			e.preventDefault();
			stepPreviewFrame(e.key === '.' ? 1 : -1);
		} else if (e.key === '0') ui.all = !ui.all;
		else if (
			/^[1-8]$/.test(e.key) &&
			m.rig.directions[+e.key - 1] &&
			moveDirs(m, ui.anim).includes(m.rig.directions[+e.key - 1].id)
		) {
			ui.dir = m.rig.directions[+e.key - 1].id;
			ui.all = false;
		}
	}

	// B15: offline (browser says so, or PixelLab got no answer and the queue paused): a small banner, never a blocker
	let online = $state(navigator.onLine);
	const offline = $derived(!online || $queue.paused === 'offline');
	let backingUp = $state(false);
</script>

{#snippet previewNoticeDetails()}
	<div><strong class="preview-risk">{t('studio.previewRisk')}</strong></div>
	<span>{t('studio.previewBackupDescription')}</span>
	<div class="toast-actions">
		<LibraryBackupButton
			disabled={!store.project}
			bind:pending={backingUp}
			onbackup={activateToast}
		/>
	</div>
{/snippet}

<svelte:window
	onkeydown={onkey}
	onpopstate={onpop}
	ononline={() => (online = true)}
	onoffline={() => (online = false)}
/>

<div class="studio-app" onclickcapture={rememberActivation}>
	{#if !workspaceCopy}<PwaRuntime />{/if}
	<Experience />
	{#if !workspaceCopy && offline}<div class="offline-banner" role="status">
			<WifiOff size={14} aria-hidden="true" />{t('studio.youReOfflineEditAndExportLocally')}
		</div>{/if}
	{#if !ui.sheet && !ui.settingsOverlay}<Toast />{/if}

	{#if ui.sheet === 'inspect'}<Lazy load={parts.notes} />{/if}
	{#if ui.sheet === 'connect'}<Lazy load={parts.connect} />{/if}
	{#if ui.sheet === 'create'}<Lazy load={parts.create} />{/if}
	{#if ui.sheet === 'newitem'}<Lazy load={parts.newitem} />{/if}
	{#if ui.sheet === 'export' || (ui.sheet === 'settings' && settingsNavigation.fromExport)}<Lazy
			load={parts.export}
		/>
	{/if}
	{#if ui.sheet === 'activity'}<Lazy load={parts.activity} />{/if}
	{#if ui.sheet === 'workspaceReport' && workspaceCopy}<Lazy load={parts.workspace} />{/if}
	{#if ui.sheet === 'move'}<Lazy load={parts.move} />{/if}
	{#if ui.sheet === 'moveReview'}{#key ui.moveReview}<Lazy load={parts.moveReview} />{/key}{/if}
	{#if ui.sheet === 'itemGeneration'}{#key ui.itemGeneration}<Lazy
				load={parts.itemGeneration}
			/>{/key}{/if}
	{#if ui.sheet === 'stateCapture'}<Lazy load={parts.stateCapture} />{/if}
	{#if ui.sheet === 'stateReview'}{#key ui.stateReview}<Lazy load={parts.stateReview} />{/key}{/if}
	{#if ui.sheet === 'appearance' && ui.appearance}<Lazy load={parts.appearance} />{/if}
	{#if ui.sheet === 'rename'}<RenameSheet />{/if}
	{#if ui.sheet === 'directions'}<DirectionsSheet id={ui.directionProject} />{/if}
	{#if ui.sheet === 'adjustFrame'}<Lazy load={parts.adjustFrame} id={ui.frameProject} />{/if}
	{#if ui.sheet === 'cost'}<Lazy load={parts.cost} />{/if}
	{#if ui.sheet === 'importZip' || ui.sheet === 'importPixelLab'}{#key ui.sheet}<Lazy
				load={parts[ui.sheet]}
				source={ui.sheet === 'importZip' ? 'device' : 'pixellab'}
			/>{/key}{/if}
	{#if ui.sheet === 'delete'}<DeleteSheet />{/if}
	{#if ui.sheet === 'details'}<Lazy load={parts.details} />{/if}
	{#if ui.sheet === 'setup'}<Lazy load={parts.setup} />{/if}
	{#if ui.sheet === 'slots'}<Lazy load={parts.slots} />{/if}
	{#if ui.sheet === 'frames' && store.project}<Lazy load={parts.frames} />{/if}
	{#if ui.sheet === 'item' && store.project?.manifest.items.some((i) => i.id === ui.selected)}
		<Lazy load={parts.item} id={ui.selected} />
	{/if}
	{#if ui.sheet === 'gen' && genOf(ui.selected)}
		<Lazy load={parts.gen} g={genOf(ui.selected)!} />
	{/if}
	{#if ui.settingsOverlay || (ui.sheet === 'settings' && !settingsNavigation.fromExport)}
		<Lazy load={parts.settings} onLoadError={closeSettings} />
	{/if}
	{#if reportDialog.report}{#key reportDialog.report}<ReportDialog
				report={reportDialog.report}
			/>{/key}{/if}
</div>

<style>
	.preview-risk {
		font-weight: 600;
		text-wrap: pretty;
	}
</style>
