<script lang="ts">
	import { currentLiveClips, currentLiveLayering } from './experience/liveViews.ts';
	import { MediaQuery } from 'svelte/reactivity';
	import SettingsItemButton from './SettingsItemButton.svelte';
	import { CURRENT_OUTFIT_ID } from '../lib/store/identity.ts';
	import { playbackClips } from '../lib/runtime/timeline.js';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import { assetUrl } from '../lib/assets.ts';
	// Export (M5): one engine at a time; the zip is built when the sheet opens so the button can name its size.
	import Sheet from './Sheet.svelte';
	import SettingsContent from './SettingsContent.svelte';
	import {
		closeSettingsExport,
		openSettings,
		settingsNavigation
	} from './settingsNavigation.svelte.ts';
	import { noteExportSettings, showExportSettings } from './settingsDefaults.svelte.ts';
	import { tick, untrack } from 'svelte';
	import { exportFormatNames } from './exportFormatNames.ts';
	import { buildExport } from '../lib/export/build.ts';
	import { characterZipId, editableData, saveZip } from './download.svelte.ts';
	import { ROWS as RPG_ROWS, walkMoves } from '../lib/export/rpg-maker.ts';
	import { DEFAULT_MOVE } from '../lib/rig/rig.ts';
	import { stableStringify } from '../lib/image/hash.ts';
	import { coverageGaps, missingFrames, moveDirs } from '../lib/dress/dress.ts';
	import { listProjects, type StoredProject } from '../lib/store/project.ts';
	import {
		exportAnimationCatalog,
		InvalidAnimationNames,
		InvalidExportSettings,
		readExportSettings,
		DEFAULT_EXPORT_ENGINE,
		resetInvalidExportSettings,
		saveExportSetting,
		subscribeExportSettings,
		type ExportSettingChange,
		type ExportSettings
	} from '../lib/store/export-settings.ts';
	import type { DirectionName, Engine } from '../lib/store/manifest.ts';
	import { ui, doc, store, toast } from './state.svelte.ts';
	import { displayMove } from './displayMove.ts';
	import { ChevronRight, Download, Settings2, TriangleAlert } from './icons.ts';
	import ExportVersionCard from './ExportVersionCard.svelte';
	import { getLocale, t } from 'svelte-whisper';
	import ReportButton from './ReportButton.svelte';
	import type { WhisperKey } from 'svelte-whisper';
	import { displayMessage } from '../lib/i18n.ts';
	import { message, type Message } from '../lib/message.ts';
	import { ACTION_LAYER_ENGINES, type NoteTerm } from '../lib/export/export.ts';
	import { displayDirectionInSentence } from './displayDirection.ts';
	import { slotLabelMessage } from './slots.ts';
	import RichMessage from './RichMessage.svelte';
	let {
		embedded = false,
		onSaving,
		focusEntry
	}: {
		embedded?: boolean;
		onSaving?: (saving: boolean) => void;
		focusEntry?: string;
	} = $props();

	type Target = { id: Engine; name: string; sub: WhisperKey; detail: WhisperKey };
	type Version = { id: Engine; value: WhisperKey; title: WhisperKey; sub: WhisperKey };
	// RPG Maker and Phaser cards carry a version picker (ExportVersionCard). A card's id is its first version, and each
	// version is a stored engine id, so it persists like any format.
	const VERSIONED: Partial<
		Record<
			Engine,
			{
				menuId: string;
				menuLabel: WhisperKey;
				buttonLabel: WhisperKey;
				versions: readonly Version[];
			}
		>
	> = {
		'rpg-maker': {
			menuId: 'rpg-version-menu',
			menuLabel: 'export.settings.versionMenu',
			buttonLabel: 'export.settings.versionLabel',
			versions: [
				{
					id: 'rpg-maker',
					value: 'export.version.standard',
					title: 'export.version.standardTitle',
					sub: 'export.version.standardSub'
				},
				{
					id: 'rpg-maker-xp',
					value: 'export.version.xp',
					title: 'export.version.xpTitle',
					sub: 'export.version.xpSub'
				}
			]
		},
		'phaser-ae': {
			menuId: 'phaser-version-menu',
			menuLabel: 'export.settings.phaserVersionMenu',
			buttonLabel: 'export.settings.phaserVersionLabel',
			versions: [
				{
					id: 'phaser-ae',
					value: 'export.version.phaserAe',
					title: 'export.version.phaserAeTitle',
					sub: 'export.version.phaserAeSub'
				},
				{
					id: 'phaser',
					value: 'export.version.phaser',
					title: 'export.version.phaserTitle',
					sub: 'export.version.phaserSub'
				}
			]
		}
	};
	// Versions other than a card's first, for the description under the cards.
	const ALTERNATE_TARGETS: Target[] = [
		{
			id: 'rpg-maker-xp',
			name: exportFormatNames['rpg-maker-xp'],
			sub: 'export.target.rpgMaker.sub',
			detail: 'export.target.rpgMakerXp.detail'
		},
		{
			id: 'phaser',
			name: exportFormatNames.phaser,
			sub: 'export.target.phaser.sub',
			detail: 'export.target.phaser.detail'
		}
	];
	const cardOf = (id: Engine): Engine =>
		(Object.entries(VERSIONED).find(([, card]) => card.versions.some((v) => v.id === id))?.[0] as
			Engine | undefined) ?? id;
	// Product order for this layered 2D workflow (docs/research/2026-11-26-engine-priority.md); asset formats are useful
	// across engines.
	const GROUPS: { id: string; name: WhisperKey; targets: Target[] }[] = [
		{
			id: 'engines',
			name: 'export.group.engines',
			targets: [
				{
					id: 'phaser-ae',
					name: exportFormatNames['phaser-ae'],
					sub: 'export.target.phaser.sub',
					detail: 'export.target.phaserAe.detail'
				},
				{
					id: 'godot',
					name: exportFormatNames.godot,
					sub: 'export.target.godot.sub',
					detail: 'export.target.godot.detail'
				},
				{
					id: 'unity',
					name: exportFormatNames.unity,
					sub: 'export.target.unity.sub',
					detail: 'export.target.unity.detail'
				},
				{
					id: 'gdevelop',
					name: exportFormatNames.gdevelop,
					sub: 'export.target.gdevelop.sub',
					detail: 'export.target.gdevelop.detail'
				},
				{
					id: 'rpg-maker',
					name: exportFormatNames['rpg-maker'],
					sub: 'export.target.rpgMaker.sub',
					detail: 'export.target.rpgMaker.detail'
				}
			]
		},
		{
			id: 'assets',
			name: 'export.group.assets',
			targets: [
				{
					id: 'aseprite',
					name: exportFormatNames.aseprite,
					sub: 'export.target.aseprite.sub',
					detail: 'export.target.aseprite.detail'
				},
				{
					id: 'generic',
					name: exportFormatNames.generic,
					sub: 'export.target.generic.sub',
					detail: 'export.target.generic.detail'
				}
			]
		}
	];
	const ENGINES = GROUPS.flatMap((group) => group.targets);
	const OTHER_ENGINES = ENGINES.filter((target) => target.id !== DEFAULT_EXPORT_ENGINE);
	let preferences = $state.raw<ExportSettings | null>(null);
	let savedProjects = $state.raw<StoredProject[]>([]);
	let formatChoice = $state<Engine | null>(null);
	const engine = $derived(formatChoice ?? preferences?.engine ?? DEFAULT_EXPORT_ENGINE);
	const supportsActionLayers = $derived(ACTION_LAYER_ENGINES.includes(engine));
	const actionLayers = $derived(preferences?.actionLayers ?? false);
	const selected = $derived(
		[...ENGINES, ...ALTERNATE_TARGETS].find((target) => target.id === engine)
	);
	const settings = $derived(ui.sheet === 'settings');
	const returningToExport = $derived(settings && settingsNavigation.fromExport);
	// Compact Settings shows one page at a time: a page other than Export's own steps back to the Settings index
	// first, as standalone Settings does.
	const compactSettings = new MediaQuery('(max-width: 659px), (max-height: 519px)');
	const compactPane = $derived(
		compactSettings.current &&
			!!settingsNavigation.section &&
			settingsNavigation.section !== 'export'
	);
	const viewingPreferences = $derived(
		embedded || !settings || settingsNavigation.section === 'export'
	);
	let pendingWrites = $state(0);
	const saving = $derived(pendingWrites > 0);
	let libraryBusy = $state(false);
	let reviewingBackup = $state(false);
	const settingsBusy = $derived(saving || libraryBusy || reviewingBackup);
	let writeSequence = 0,
		publishedSequence = 0;
	let refreshAgain = false,
		refreshPreferences = async () => {};
	let refreshing = $state(true);
	let ready = $state(false);
	let saveError = $state<Message | null>(null);
	let loadError = $state<Message | null>(null);
	let invalidPreferences = $state(false);
	let content = $state<HTMLDivElement>();
	// Settings' Reset buttons reuse this page's loaded preferences instead of reading them again.
	$effect(() => (embedded ? showExportSettings() : undefined));
	$effect(() => {
		if (!embedded) return;
		if (loadError) noteExportSettings(null);
		else if (ready && preferences) noteExportSettings(preferences);
	});
	$effect(() => {
		if (!ready || !focusEntry || !document.activeElement?.matches('.settings-heading')) return;
		const row = content?.querySelector<HTMLElement>(`[data-setting="${focusEntry}"]`);
		(
			row?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled)') ?? row
		)?.focus();
	});
	let result = $state.raw<{
		zip: Uint8Array | null;
		fileId?: string;
		files: string[];
		warnings: string[];
		warningMessages?: Map<string, Message>;
		kind: 'requested' | 'recovery' | 'failed';
		problem?: string;
		problemMessage?: Message;
		details?: string[];
		detailMessages?: (Message | undefined)[];
		requestedWarnings?: (Message | string)[];
		retryable?: boolean;
		rigIssues: Message[];
	} | null>(null);
	let busy = $state(false);
	let attempt = $state(0);
	const m = $derived(store.project?.manifest);
	const moveRefs = $derived(m?.rig.animations ?? []);
	const baked = $derived(preferences?.dressedCharacterSheets ?? true);
	const catalog = $derived.by(() => {
		if (!preferences || !ready) return { names: [], warningMessages: [] };
		const others = savedProjects.filter((p) => p.id !== doc.id).map((p) => p.manifest);
		try {
			return exportAnimationCatalog(m, others, preferences);
		} catch (error) {
			if (!(error instanceof InvalidAnimationNames)) throw error;
			const catalog = exportAnimationCatalog(undefined, others, preferences);
			return {
				...catalog,
				warningMessages: [message('export.warnings.missingMoves'), ...catalog.warningMessages]
			};
		}
	});
	const names = $derived(catalog.names);
	const once = $derived(preferences?.playOnce ?? []);
	const moveChoices = $derived(
		new Map(
			playbackClips(m?.rig.animations ?? []).map(({ id, clip }) => [id, clip.moveLoop] as const)
		)
	);
	const playsOnce = (name: string) => {
		const choice = moveChoices.get(name);
		return choice === undefined ? once.includes(name) : !choice;
	};
	const catalogOnce = $derived(names.filter(playsOnce));
	const playbackSummary = $derived(
		!catalogOnce.length
			? t('common.none')
			: catalogOnce.length === names.length
				? t('export.playback.all')
				: catalogOnce.map(animationLabel).join(', ')
	);
	const outfits = $derived(m?.presets.filter((p) => p.id !== CURRENT_OUTFIT_ID) ?? []);
	// RPG Maker sheets are always dressed composites, whatever the setting says
	const rpg = $derived(engine === 'rpg-maker' || engine === 'rpg-maker-xp');
	// The walk an RPG Maker sheet steps through, chosen for this export only; the first eligible walk until one is picked
	let walkChoice = $state<string>();
	const walks = $derived(rpg && m ? walkMoves(m) : []);
	const rpgWalk = $derived((walks.find((move) => move.id === walkChoice) ?? walks[0])?.id);
	const outfitSummary = $derived(
		!baked && !rpg
			? t('export.outfits.none')
			: outfits.length
				? t('export.outfits.saved')
				: t('export.outfits.current')
	);
	const items = $derived(m ? m.items.filter((i) => i.slot !== 'body') : []);
	const reviewItems = $derived(
		m
			? m.items
					.filter((i) => i.designWarnings?.length || (i.qa && i.qa.status !== 'pass'))
					.map((i) => i.name)
			: []
	);
	const PLAY_ONCE = $derived(t('export.settings.playOnce'));
	const DRESSED_SHEETS = $derived(t('export.settings.dressed'));
	const ACTION_LAYERS = $derived(t('export.settings.actionLayers'));
	function animationLabel(id: string): string {
		return displayMove(id, names);
	}
	// Notes keep raw terms until shown, so lists, directions, slots and nested messages follow a language switch.
	function noteValue(value: unknown): unknown {
		if (Array.isArray(value))
			// A comma list in each language ("a, b" in English), as these notes read before localization
			return new Intl.ListFormat(getLocale() || 'en', { type: 'unit', style: 'short' }).format(
				value.map((entry) => String(noteValue(entry)))
			);
		if (typeof value !== 'object' || value === null) return value;
		if ('direction' in value)
			return displayDirectionInSentence(
				(value as Extract<NoteTerm, { direction: unknown }>).direction
			);
		if ('slot' in value)
			return displayMessage(
				slotLabelMessage(m, (value as Extract<NoteTerm, { slot: unknown }>).slot)
			);
		if ('move' in value)
			return displayMove((value as Extract<NoteTerm, { move: unknown }>).move, moveRefs);
		if ('key' in value) return displayNote(value as Message);
		return value;
	}
	function displayNote(note: Message): string {
		const vars = note.vars;
		return t(
			note.key,
			vars && !Array.isArray(vars)
				? Object.fromEntries(Object.entries(vars).map(([name, value]) => [name, noteValue(value)]))
				: vars
		);
	}
	function displayWarning(warning: string): string {
		const translated = result?.warningMessages?.get(warning);
		return translated ? displayNote(translated) : warning;
	}
	$effect(() => {
		if (!viewingPreferences) return;
		const openedId = doc.id;
		let active = true,
			request = 0;
		ready = false;
		async function refresh() {
			if (openedId !== doc.id || document.visibilityState === 'hidden') return;
			if (saving) {
				refreshAgain = true;
				return;
			}
			const current = ++request,
				sequence = writeSequence;
			refreshing = true;
			try {
				const [saved, projects] = await Promise.all([readExportSettings(), listProjects()]);
				if (!active || current !== request) return;
				if (saving) {
					refreshAgain = true;
					return;
				}
				if (sequence !== writeSequence) {
					void refresh();
					return;
				}
				if (stableStringify(preferences) !== stableStringify(saved)) preferences = saved;
				savedProjects = projects;
				ready = true;
				loadError = null;
				invalidPreferences = false;
			} catch (error) {
				if (!active || current !== request) return;
				if (saving) {
					refreshAgain = true;
					return;
				}
				if (sequence !== writeSequence) {
					void refresh();
					return;
				}
				ready = false;
				invalidPreferences = error instanceof InvalidExportSettings;
				console.warn('Could not load export settings', error);
				loadError = invalidPreferences
					? message('export.settings.loadInvalid')
					: message('export.settings.loadFailed');
			} finally {
				if (active && current === request) refreshing = false;
			}
		}
		refreshPreferences = refresh;
		untrack(() => void refresh());
		window.addEventListener('focus', refresh);
		document.addEventListener('visibilitychange', refresh);
		const unsubscribe = subscribeExportSettings(() => void refresh());
		return () => {
			active = false;
			unsubscribe();
			window.removeEventListener('focus', refresh);
			document.removeEventListener('visibilitychange', refresh);
		};
	});
	async function navigate() {
		if (returningToExport) ui.sheet = 'export';
		else openSettings('export');
		await tick();
		content?.closest('.sheet-body')?.scrollTo(0, 0);
		// Into Settings, focus lands on the page title; back in Export, on the Settings button it left from.
		document
			.querySelector<HTMLElement>(
				ui.sheet === 'settings'
					? 'dialog.export-sheet .sheet-title'
					: 'dialog.export-sheet .sheet-start button'
			)
			?.focus();
	}
	async function changeSetting(input: HTMLInputElement, change: ExportSettingChange) {
		return persistSettings(
			() => saveExportSetting(change),
			input,
			'engine' in change ? change.engine : undefined
		);
	}
	function chooseEngine(id: Engine) {
		if (id !== engine) void persistSettings(() => saveExportSetting({ engine: id }), undefined, id);
	}
	async function resetSettings(event: MouseEvent) {
		const trigger = event.currentTarget,
			hadFocus = document.activeElement === trigger;
		refreshAgain = true;
		await persistSettings(resetInvalidExportSettings);
		await tick();
		if (
			hadFocus &&
			(document.activeElement === document.body ||
				document.activeElement === content?.closest('dialog'))
		)
			(
				document.querySelector<HTMLElement>('dialog.export-sheet .sheet-start button') ?? content
			)?.focus({ preventScroll: true });
	}
	async function persistSettings(
		commit: () => Promise<ExportSettings>,
		input?: HTMLInputElement,
		optimisticEngine?: Engine
	) {
		const checked = input?.checked,
			hadFocus = !!input && document.activeElement === input,
			sequence = ++writeSequence;
		pendingWrites++;
		onSaving?.(true);
		if (optimisticEngine) formatChoice = optimisticEngine;
		saveError = null;
		try {
			const saved = await commit();
			if (sequence > publishedSequence) {
				preferences = saved;
				publishedSequence = sequence;
			}
			if (sequence === writeSequence) saveError = null;
		} catch (e) {
			if (input && input.type !== 'radio') input.checked = !checked;
			console.warn('Could not save export settings', e);
			if (sequence === writeSequence) saveError = message('export.settings.saveFailed');
		} finally {
			pendingWrites--;
			onSaving?.(saving);
			if (!saving) {
				formatChoice = null;
				if (refreshAgain) {
					refreshAgain = false;
					void refreshPreferences();
				}
			}
			await tick();
			// Disabling a focused checkbox blurs it. Keep keyboard navigation at that setting without stealing a moved focus.
			if (
				hadFocus &&
				input?.isConnected &&
				(document.activeElement === document.body ||
					document.activeElement === input.closest('dialog'))
			)
				input.focus({ preventScroll: true });
		}
	}
	// B10 (T1 P1-1): views a move or an item doesn't have are empty in the sheets; say so before the download
	// RPG Maker sheets use only the standing view and the walk, and their export warns about walk views itself
	const gaps = $derived.by(() => {
		if (!m) return [];
		const out: Message[] = [],
			walk = rpgWalk;
		const facing = (key: string) => {
			const [move, direction] = key.split('/') as [string, DirectionName];
			return message('export.notes.rigIssue', { move: { move }, direction: { direction } });
		};
		const used = (key: string) => {
			const [move, dir] = key.split('/');
			return (
				!rpg || ((move === DEFAULT_MOVE || move === walk) && (RPG_ROWS as string[]).includes(dir))
			);
		};
		if (!rpg)
			for (const a of m.rig.animations) {
				const d = moveDirs(m, a.id);
				if (d.length < m.rig.directions.length)
					out.push(
						message('export.gaps.dirs', {
							move: { move: a.id },
							directions: d.map((direction): NoteTerm => ({ direction }))
						})
					);
			}
		// RPG Maker draws only the outfits it exports (current look and saved outfits), so an item none of them wears is not in a sheet
		const worn = new Set(
			[doc.items, ...outfits.map((x) => x.items)].flatMap((o) => Object.values(o))
		);
		for (const it of rpg ? items.filter((i) => worn.has(i.id)) : items) {
			const whole: string[] = [];
			for (const g of coverageGaps(m, it).filter(used)) {
				const [move, dir] = g.split('/') as [string, DirectionName],
					count = m.rig.animations.find((a) => a.id === move)!.cells,
					missed = missingFrames(m, it, move, dir).length;
				if (missed === count) whole.push(g);
				else
					out.push(
						message('export.gaps.missingFacing', {
							item: it.name,
							missing: missed,
							count,
							view: facing(g)
						})
					);
			}
			if (whole.length)
				out.push(message('export.gaps.noFrames', { item: it.name, views: whole.map(facing) }));
		}
		return out;
	});

	$effect(() => {
		if (settings || embedded) return;
		void attempt;
		const e = engine,
			b = baked,
			w = rpgWalk,
			p = store.project;
		const rec = store.exportRecord,
			exportPreferences = preferences;
		if (!p || !ready || saving) return;
		busy = true;
		result = null;
		const look = { items: $state.snapshot(doc.items), variants: $state.snapshot(doc.variants) };
		const snapshot = { ...p, manifest: structuredClone(p.manifest) };
		const layering = currentLiveLayering(doc.id);
		const clips = currentLiveClips(doc.id, snapshot.manifest.rig.animations);
		const actionLayering =
			actionLayers && supportsActionLayers
				? {
						waist: layering.waist,
						walk: clips.walk.slice(0, 1),
						attacks: [...clips.attack, ...clips.attackUp, ...clips.attackDown]
					}
				: undefined;
		let stale = false;
		void (async () => {
			const qa = rec?.rigQa as { clips?: Record<string, { fails?: unknown }> } | undefined;
			const rigIssues = Object.entries(qa?.clips ?? {})
				.filter(([clip, checks]) => {
					const [anim, dir] = clip.split('/');
					return (
						snapshot.manifest.rig.animations.some((a) => a.id === anim) &&
						moveDirs(snapshot.manifest, anim).some((d) => d === dir) &&
						Array.isArray(checks?.fails) &&
						checks.fails.length > 0
					);
				})
				.map(([clip]) => {
					const [anim, dir] = clip.split('/');
					return message('export.notes.rigIssue', {
						move: { move: anim },
						direction: { direction: dir as DirectionName }
					});
				});
			return {
				...(await buildExport(snapshot, {
					engine: e,
					baked: b,
					look,
					settings: exportPreferences!,
					projectData: editableData(rec),
					rpgWalk: w,
					actionLayering
				})),
				rigIssues
			};
		})()
			.then((r) => {
				if (stale) return;
				result = {
					zip: r.zip,
					fileId: characterZipId(snapshot.manifest),
					files: r.entries.map((x) => x.name),
					warnings: r.warnings,
					warningMessages: r.kind === 'failed' ? undefined : r.warningMessages,
					kind: r.kind,
					problem: r.problem,
					problemMessage: r.problemMessage,
					details: r.kind !== 'requested' ? r.errors : undefined,
					detailMessages: r.kind !== 'requested' ? r.errorMessages : undefined,
					requestedWarnings:
						r.kind === 'recovery'
							? r.requestedWarnings.map(
									(warning) => r.requestedWarningMessages?.get(warning) ?? warning
								)
							: undefined,
					retryable: r.kind === 'failed' && r.retryable,
					rigIssues: r.rigIssues
				};
				busy = false;
			})
			.catch((e: unknown) => {
				console.error('export', e);
				if (stale) return;
				result = {
					zip: null,
					files: [],
					warnings: [],
					kind: 'failed',
					problem: 'Could not prepare this export.',
					problemMessage: message('export.problem.prepareFailed'),
					retryable: true,
					rigIssues: []
				};
				busy = false;
			});
		return () => {
			stale = true;
		};
	});
	const kb = $derived(result?.zip ? Math.max(1, Math.round(result.zip.length / 1024)) : null);
	const pendingExport = $derived((busy && ready) || saving || refreshing);
	const hasNotes = $derived(
		!!(reviewItems.length || gaps.length || result?.warnings.length || result?.rigIssues.length)
	);
	const problem = $derived(
		result ? (result.problemMessage ? displayMessage(result.problemMessage) : result.problem) : ''
	);
	function download() {
		if (!result?.zip || !result.fileId || busy || saving || refreshing || !ready) return;
		const name = result.fileId;
		const filename =
			result.kind === 'recovery'
				? `${name}-recovered-artwork.zip`
				: `${name}-${engine}.pixeldoll.zip`;
		saveZip(result.zip, filename);
		toast(
			result.kind === 'recovery'
				? message('export.toast.artworkStarted')
				: message('download.started')
		);
		if (result.kind === 'requested') ui.sheet = null;
	}
</script>

{#snippet exportFooter()}
	<span class="foot-note"
		>{pendingExport
			? saving
				? t('export.sheet.saving')
				: ''
			: !ready
				? t('export.sheet.unavailable')
				: result?.kind === 'recovery'
					? t('export.sheet.sourceOnly')
					: result?.kind === 'failed'
						? t('export.sheet.noZip')
						: hasNotes
							? t('export.sheet.readyNotes')
							: t('export.sheet.free')}</span
	>
	{#if ready && !pendingExport && result?.kind === 'failed' && result.retryable}
		<button class="bu-action btn primary lg" data-variant="primary" onclick={() => attempt++}
			>{t('common.tryAgain')}</button
		>
	{:else}<button
			class="bu-action btn primary lg"
			data-variant="primary"
			onclick={download}
			disabled={pendingExport || !ready || !result?.zip}
			><Download size={16} aria-hidden="true" />{(ready && busy) || refreshing
				? t('common.preparing')
				: !pendingExport && result?.kind === 'recovery'
					? t('export.sheet.downloadArtwork')
					: kb && !pendingExport
						? t('export.sheet.downloadSize', { size: kb })
						: t('common.downloadZip')}</button
		>{/if}
{/snippet}

{#snippet preferencesStatus(inSettings = false)}
	{#if loadError || saveError}<p class="notice bad small" role="alert">
			<TriangleAlert size={14} aria-hidden="true" />{saveError
				? displayMessage(saveError)
				: loadError
					? displayMessage(loadError)
					: ''}<ReportButton area="Export" error={saveError || loadError} />
		</p>{/if}
	{#if invalidPreferences}
		<p class="bu-muted settings-description">
			{t('export.settings.resetHint')}
		</p>
		{#if inSettings}
			<SettingsItemButton onclick={resetSettings} disabled={saving || refreshing}
				>{t('export.settings.reset')}</SettingsItemButton
			>
		{:else}
			<button class="bu-action btn" onclick={resetSettings} disabled={saving || refreshing}
				>{t('export.settings.reset')}</button
			>
		{/if}
	{/if}
	{#if !ready && refreshing}<p class="bu-muted settings-description" role="status">
			{t('export.settings.loading')}
		</p>{/if}
	{#each catalog.warningMessages as warning}<p class="notice warn small">
			<TriangleAlert size={14} aria-hidden="true" />{displayMessage(warning)}
		</p>{/each}
{/snippet}

{#snippet exportSettings(_entry?: string)}
	<div class="export-page export-preferences" bind:this={content} tabindex="-1">
		{@render preferencesStatus(true)}
		<fieldset
			class="export-playback"
			data-setting="playback"
			tabindex="-1"
			aria-describedby="export-playback-description"
		>
			<legend class="settings-label">{PLAY_ONCE}</legend>
			<p class="bu-muted settings-description" id="export-playback-description">
				{t('export.settings.playOnceHint')}
			</p>
			<div class="export-moves">
				{#each names as name (name)}
					{@const choice = moveChoices.get(name)}
					<label class="bu-action bu-check export-move" data-variant="field" aria-disabled={saving}>
						<span
							>{animationLabel(name)}{#if choice !== undefined}
								<small class="bu-muted">{t('export.settings.playbackSetInMove')}</small>
							{/if}</span
						><input
							type="checkbox"
							checked={once.includes(name)}
							disabled={saving || !ready}
							onchange={(e) =>
								changeSetting(e.currentTarget, {
									animation: name,
									playOnce: e.currentTarget.checked
								})}
						/>
					</label>
				{/each}
			</div>
		</fieldset>
		<hr class="bu-separator export-divider" />
		<div class="export-dressed" data-setting="sheets" tabindex="-1">
			<label class="check">
				<input
					type="checkbox"
					checked={baked}
					disabled={saving || !ready}
					aria-describedby="export-dressed-description"
					onchange={(e) =>
						changeSetting(e.currentTarget, {
							dressedCharacterSheets: e.currentTarget.checked
						})}
				/>
				<span class="settings-label">{DRESSED_SHEETS}</span>
			</label>
			<p class="bu-muted settings-description" id="export-dressed-description">
				{t('export.settings.dressedHint')}
			</p>
		</div>
		<hr class="bu-separator export-divider" />
		<div class="export-dressed" data-setting="action-layers" tabindex="-1">
			<label class="check">
				<input
					type="checkbox"
					checked={actionLayers}
					disabled={saving || !ready}
					aria-describedby="export-action-layers-description"
					onchange={(e) =>
						changeSetting(e.currentTarget, { actionLayers: e.currentTarget.checked })}
				/>
				<span class="settings-label">{ACTION_LAYERS}</span>
			</label>
			<p class="bu-muted settings-description" id="export-action-layers-description">
				{t('export.settings.actionLayersHint')}
			</p>
		</div>
		<hr class="bu-separator export-divider" />
		<div class="export-format" data-setting="format" tabindex="-1">
			<label class="settings-label" for="default-export-target"
				>{t('export.settings.defaultTarget')}</label
			>
			<select
				id="default-export-target"
				class="bu-input input"
				value={engine}
				aria-describedby="default-export-target-hint"
				disabled={!ready || saving}
				onchange={(event) => chooseEngine(event.currentTarget.value as Engine)}
			>
				<option value={DEFAULT_EXPORT_ENGINE}>{exportFormatNames[DEFAULT_EXPORT_ENGINE]}</option>
				{#each OTHER_ENGINES as target (target.id)}
					{#if VERSIONED[target.id]}
						{#each VERSIONED[target.id]!.versions as version (version.id)}
							<option value={version.id}>{target.name} {t(version.value)}</option>
						{/each}
					{:else}
						<option value={target.id}>{target.name}</option>
					{/if}
				{/each}
			</select>
			<span class="bu-muted settings-description" id="default-export-target-hint"
				>{t('export.settings.defaultTargetHint')}</span
			>
		</div>
	</div>
{/snippet}

{#if embedded}
	{@render exportSettings()}
{:else}
	<Sheet
		title={t(settings ? 'export.sheet.settings' : 'export.sheet.title')}
		className="export-sheet"
		onclose={() => (ui.sheet = null)}
		locked={settingsBusy}
		back={returningToExport
			? compactPane
				? () => (settingsNavigation.section = null)
				: navigate
			: settingsNavigation.exportOpen
				? closeSettingsExport
				: undefined}
		backTo={t(returningToExport && !compactPane ? 'export.sheet.title' : 'export.sheet.settings')}
		opener={settings
			? undefined
			: { label: t('export.sheet.settings'), icon: Settings2, onclick: navigate }}
		footer={settings ? undefined : exportFooter}
	>
		{#key settings}
			{#if settings}
				<SettingsContent
					busy={settingsBusy}
					bind:libraryBusy
					bind:reviewingBackup
					{exportSettings}
					openExport={navigate}
				/>
			{:else}
				<div class="export-page" bind:this={content}>
					{@render preferencesStatus()}
					<fieldset class="export-picker" aria-label={t('export.settings.format')}>
						{#each GROUPS as group (group.id)}
							<section aria-labelledby={`export-${group.id}`}>
								<h3 class="label" id={`export-${group.id}`}>{t(group.name)}</h3>
								<div class="export-targets">
									{#each group.targets as e (e.id)}
										{#snippet target()}
											<label class="export-target">
												<span
													class="target-icon"
													aria-hidden="true"
													style:mask-image={`url("${assetUrl(`icons/exports/${e.id === 'phaser-ae' ? 'phaser' : e.id}.svg`)}")`}
												></span>
												<span class="target-label"
													><span class="engine-name">{e.name}</span><span class="engine-sub"
														>{t(e.sub)}</span
													></span
												>
												<input
													type="radio"
													name="export-format"
													value={e.id}
													checked={cardOf(engine) === e.id}
													disabled={!ready}
													onchange={(event) => changeSetting(event.currentTarget, { engine: e.id })}
													aria-label={e.name}
													aria-describedby={cardOf(engine) === e.id
														? 'export-description'
														: undefined}
												/>
											</label>
										{/snippet}
										{@const card = VERSIONED[e.id]}
										{#if card}
											<ExportVersionCard
												menuId={card.menuId}
												versions={card.versions}
												current={engine}
												on={cardOf(engine) === e.id}
												disabled={!ready}
												menuLabel={card.menuLabel}
												buttonLabel={card.buttonLabel}
												onchoose={chooseEngine}
											>
												{@render target()}
											</ExportVersionCard>
										{:else}
											{@render target()}
										{/if}
									{/each}
								</div>
							</section>
						{/each}
					</fieldset>
					{#if selected}<p
							class="export-description muted small"
							id="export-description"
							aria-live="polite"
						>
							{#snippet engineName()}<strong>{selected?.name}</strong>{/snippet}
							<RichMessage
								key="export.sheet.description"
								vars={{ detail: t(selected.detail) }}
								slots={{ name: engineName }}
							/>
						</p>{/if}
					{#if walks.length > 1}<label class="field"
							><span class="label small">{t('export.settings.walkMove')}</span><select
								class="bu-input input"
								value={rpgWalk}
								disabled={!ready}
								onchange={(e) => (walkChoice = e.currentTarget.value)}
								>{#each walks as a (a.id)}<option value={a.id}>{displayMove(a.id, moveRefs)}</option
									>{/each}</select
							></label
						>{/if}
					{#if ready && !pendingExport && (result?.kind === 'recovery' || result?.kind === 'failed')}
						<p
							class="notice {result.kind === 'recovery' ? 'warn' : 'bad'} small"
							role={result.kind === 'recovery' ? 'status' : 'alert'}
						>
							<TriangleAlert size={14} aria-hidden="true" />
							<span
								>{problem}
								{result.kind === 'recovery'
									? t('export.recovery.canDownloadSources')
									: t('export.failure.noZip')}
								{result.warnings.map(displayWarning).join(' ')}</span
							>{#if result.kind === 'failed'}<ReportButton
									area="Export"
									error={result.problemMessage}
								/>{/if}
						</p>
					{/if}
					{#if m && result?.kind === 'requested'}
						{#if rpg}<p class="muted">
								{outfits.length
									? t('export.summary.rpgOutfits', {
											count: outfits.length
										})
									: t('export.summary.rpgCurrent')}
							</p>{:else}
							<p class="muted">
								{t(
									outfits.length ? 'export.summary.sheetsOutfits' : 'export.summary.sheetsCurrent',
									{
										directions: t('export.count.directions', {
											count: m.rig.directions.length
										}),
										moves: t('export.count.moves', { count: m.rig.animations.length }),
										items: t('export.count.items', { count: items.length }),
										outfits: t('export.count.outfits', {
											count: outfits.length
										})
									}
								)}
							</p>{/if}
						{#if reviewItems.length || result.rigIssues.length}
							<p class="notice warn small">
								<TriangleAlert size={14} aria-hidden="true" /><span
									>{t('export.notes.artworkWarning')}</span
								>
							</p>
						{/if}
						{#if hasNotes}
							<details class="disclosure">
								<summary><ChevronRight size={14} />{t('export.notes.title')}</summary>
								<div class="small">
									{#if reviewItems.length}<p>
											{displayNote(message('export.notes.checkArtwork', { names: reviewItems }))}
										</p>{/if}
									{#if result.rigIssues.length}<p>
											{displayNote(message('export.notes.checkBody', { names: result.rigIssues }))}
										</p>{/if}
									{#if result.warnings.length}<ul>
											{#each result.warnings as warning}<li>{displayWarning(warning)}</li>{/each}
										</ul>{/if}
									{#if gaps.length}
										<p>
											{rpg ? t('export.notes.missingRpg') : t('export.notes.missingEmpty')}
										</p>
										<ul>
											{#each gaps as gap}<li>{displayNote(gap)}</li>{/each}
										</ul>
									{/if}
								</div>
							</details>
						{/if}
					{/if}
					{#if ready && !pendingExport && (result?.details?.length || result?.requestedWarnings?.length)}
						<details class="disclosure">
							<summary><ChevronRight size={14} />{t('export.notes.technical')}</summary>
							<div class="small">
								{#if result.details?.length}<ul>
										{#each result.details as detail, index (index)}
											{@const translated = result.detailMessages?.[index]}
											<li>{translated ? displayNote(translated) : detail}</li>
										{/each}
									</ul>{/if}
								{#if result.requestedWarnings?.length}
									<p>{t('export.recovery.requestedWarnings')}</p>
									<ul>
										{#each result.requestedWarnings as warning}<li>
												{typeof warning === 'string' ? warning : displayNote(warning)}
											</li>{/each}
									</ul>
								{/if}
							</div>
						</details>
					{/if}
					{#if result?.kind !== 'recovery'}<hr class="bu-separator export-divider" />
						<section aria-labelledby="export-settings-summary">
							<h3 class="label" id="export-settings-summary">
								{t('export.notes.currentSettings')}
							</h3>
							<dl class="export-summary small">
								{#if !rpg}<dt>{PLAY_ONCE}</dt>
									<dd>
										{ready
											? playbackSummary
											: refreshing
												? t('common.loading')
												: t('common.unavailable')}
									</dd>{/if}
								<dt>{DRESSED_SHEETS}</dt>
								<dd>
									{ready
										? outfitSummary
										: refreshing
											? t('common.loading')
											: t('common.unavailable')}
								</dd>
								{#if supportsActionLayers}
									<dt>{ACTION_LAYERS}</dt>
									<dd>
										{!ready
											? refreshing
												? t('common.loading')
												: t('common.unavailable')
											: actionLayers
												? t('export.settings.actionLayersOn')
												: t('export.settings.actionLayersOff')}
									</dd>
								{/if}
							</dl>
						</section>{/if}
					{#if result?.zip}<details class="disclosure">
							<summary><ChevronRight size={14} />{t('export.notes.files')}</summary>
							<div>
								{#if result}<p class="faint small">
										{t('export.notes.fileCount', { count: result.files.length })}
									</p>
									<pre
										class="mono faint"
										style="max-height:160px;overflow:auto;margin:0">{result.files.join(
											'\n'
										)}</pre>{/if}
							</div>
						</details>{/if}
				</div>
			{/if}
		{/key}
	</Sheet>
{/if}

<style>
	:global(dialog.export-sheet) {
		height: min(680px, calc(100dvh - 32px));
	}
	.export-page {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
	}
	.export-page:not(.export-preferences) {
		animation: export-back 150ms ease-out;
	}
	.export-preferences {
		gap: 12px;
	}
	.export-format {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 4px;
	}
	@keyframes export-back {
		from {
			transform: translateX(-12px);
		}
		to {
			transform: translateX(0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.export-page:not(.export-preferences) {
			animation: none;
		}
	}
	.export-playback {
		min-width: 0;
		border: 0;
		padding: 0;
		margin: 0;
	}
	.export-playback legend {
		padding: 0;
		margin-bottom: 8px;
	}
	.export-playback p {
		margin: 0 0 12px;
	}
	.export-moves {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.export-move {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		min-width: 0;
		min-height: 44px;
		padding: 10px 12px;
	}
	.export-move span {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.export-move input {
		flex: none;
	}
	.export-dressed .check {
		gap: 10px;
	}
	.export-dressed input {
		flex: none;
	}
	.export-dressed p {
		margin: 4px 0 0;
	}
	.export-divider {
		width: 100%;
		margin: 0;
	}
	.export-summary {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 8px 16px;
		margin: 8px 0 0;
	}
	.export-summary dt {
		color: var(--text-2);
	}
	.export-summary dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.export-picker {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.export-picker h3 {
		margin: 0 0 8px;
	}
	.export-targets {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.export-target {
		display: grid;
		grid-template-columns: 28px minmax(0, 1fr) 16px;
		align-items: center;
		gap: 10px;
		padding: 12px;
		min-height: 68px;
		border: 1px solid var(--line-strong);
		border-radius: var(--r-card);
		background: var(--bg);
		cursor: pointer;
	}
	.export-target:has(input:checked) {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
		background: var(--accent-soft);
	}
	.export-target:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.export-target input {
		margin: 0;
		width: 16px;
		height: 16px;
		accent-color: var(--accent);
	}
	.target-icon {
		display: block;
		width: 28px;
		height: 28px;
		background: currentColor;
		mask-size: contain;
		mask-position: center;
		mask-repeat: no-repeat;
		color: var(--text-2);
	}
	.target-label {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.engine-name {
		font-weight: 600;
	}
	.engine-sub {
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.engine-name,
	.engine-sub {
		overflow-wrap: anywhere;
	}
	.export-description {
		margin: 0;
		min-height: 3em;
	}
	@media (max-width: 420px) {
		.export-target {
			grid-template-columns: 24px minmax(0, 1fr) 16px;
			gap: 8px;
			padding: 10px;
		}
		.target-icon {
			width: 24px;
			height: 24px;
		}
	}
	@media (max-width: 359px) {
		.export-targets,
		.export-moves {
			grid-template-columns: 1fr;
		}
	}
</style>
