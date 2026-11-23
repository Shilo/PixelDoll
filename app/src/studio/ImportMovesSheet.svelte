<script lang="ts">
	// Import moves: read a PixelDoll character ZIP (a move's Download ZIP, a backup, or a friend's character) and bring its
	// moves and States into the open character. Same body: free, frames and matching items as they are. Another body: a
	// move's motion can redraw this character, paid like Add a move (lib/rig/moveImport.ts).
	import Sheet from './Sheet.svelte';
	import Sprite from './Sprite.svelte';
	import ReportButton from './ReportButton.svelte';
	import { FileArchive } from './icons.ts';
	import { fileDrop, preventFileNavigation } from './fileDrop.ts';
	import { formatNumber, t } from 'svelte-whisper';
	import { LocalizedError, errorMessage, message, type Message } from '../lib/message.ts';
	import { displayError, displayNestedMessage } from '../lib/i18n.ts';
	import { lazy } from '../lib/lazy.ts';
	import { MAX_ZIP_BYTES } from '../lib/store/zip.ts';
	import { loadProject } from '../lib/store/project.ts';
	import type { StoredProject } from '../lib/store/project.ts';
	import type { Img } from '../lib/image/png.ts';
	import type { MoveImportPlan, MoveImportRow } from '../lib/rig/moveImport.ts';
	import type { RigAnimation } from '../lib/store/manifest.ts';
	import { DEFAULT_MOVE } from '../lib/rig/rig.ts';
	import { croppedBacking } from './experience/thumbnails.svelte.ts';
	import { clipNameId } from './clipName.ts';
	import { moveLabel } from './model.ts';
	import { displayMove } from './displayMove.ts';
	import { stateAttempts } from './stateRecovery.ts';
	import { defaultMoveFrameCount } from './moveAnimationOptions.ts';
	import { genDirs, moveEstimate } from './movePricing.ts';
	import { moveMinimumTier, movePreflightWarnings, moveRigReady, type MoveSpec } from './create.ts';
	import { formatList } from './displayDirectionProblem.ts';
	import {
		doc,
		flushSave,
		importMoves,
		moveImportBlocked,
		pendingMoves,
		queueMoves,
		store,
		toast,
		ui,
		withKey
	} from './state.svelte.ts';

	let busy = $state(false);
	let dragging = $state(false);
	let error = $state<string | Message>('');
	let cause = $state<unknown>();
	let fileInput = $state<HTMLInputElement>();
	let review = $state.raw<{
		projectId: string;
		rec: StoredProject;
		plan: MoveImportPlan;
		clips: readonly RigAnimation[];
		frames: Map<string, Img>;
	}>();
	let chosen = $state<string[]>([]);
	let alive = true;
	$effect(() => () => (alive = false));

	const importable = (row: MoveImportRow) => row.action === 'add' || row.action === 'copy';
	const blocked = $derived(review ? moveImportBlocked(review.projectId) : '');
	const rows = $derived(review?.plan.rows ?? []);

	function fail(e: unknown) {
		error = errorMessage(e);
		cause = e instanceof LocalizedError ? undefined : e;
	}
	const drop = fileDrop(
		() => busy,
		(active) => (dragging = active),
		(files) => void read(files)
	);
	async function read(files: readonly File[]) {
		if (busy) return;
		error = '';
		cause = undefined;
		busy = true;
		try {
			if (files.length !== 1)
				throw new LocalizedError('Choose one character ZIP at a time.', 'import.error.oneAtATime');
			const [file] = files;
			if (!/\.zip$/i.test(file.name))
				throw new LocalizedError(
					'Choose a ZIP file exported from PixelLab or PixelDoll.',
					'import.error.chooseZip'
				);
			if (file.size > MAX_ZIP_BYTES)
				throw new LocalizedError('Choose a ZIP smaller than 64 MB.', 'zip.tooLarge');
			const projectId = doc.id;
			const [{ readCharacterZip }, { planMoveImport }] = await Promise.all([
				lazy(() => import('../lib/store/import.ts')),
				lazy(() => import('../lib/rig/moveImport.ts'))
			]);
			const imported = await readCharacterZip(
				new Uint8Array(await file.arrayBuffer()),
				undefined,
				'all'
			);
			await flushSave();
			const { rec, project } = await loadProject(projectId);
			const plan = await planMoveImport({ record: rec, images: project.images }, imported, {
				label: moveLabel,
				idOf: clipNameId,
				taken: [
					...Object.keys(rec.moveReviews ?? {}),
					...stateAttempts(rec).map((attempt) => attempt.id),
					...pendingMoves(projectId).map((spec) => spec.id)
				]
			});
			if (!alive) return;
			const m = imported.project.manifest,
				base = m.items.find((item) => item.id === m.rig.baseItem),
				dir = m.rig.directions.find((d) => !d.mirrorOf)?.id;
			const frames = new Map<string, Img>();
			for (const row of plan.rows) {
				const hash = dir && base?.layers[0]?.cells?.[row.id]?.[dir]?.find(Boolean);
				const image = hash && imported.project.images.get(hash);
				if (image) frames.set(row.id, image);
			}
			review = { projectId, rec, plan, clips: m.rig.animations, frames };
			chosen = plan.rows.filter(importable).map((row) => row.id);
		} catch (e) {
			if (alive) fail(e);
		} finally {
			if (alive) busy = false;
		}
	}
	function fileChanged(e: Event) {
		const input = e.currentTarget as HTMLInputElement,
			files = Array.from(input.files ?? []);
		input.value = '';
		void read(files);
	}
	function toggle(id: string, on: boolean) {
		chosen = on ? [...chosen, id] : chosen.filter((entry) => entry !== id);
	}
	async function save() {
		if (!review || !chosen.length || busy || blocked) return;
		busy = true;
		error = '';
		try {
			const added = await importMoves(review.projectId, review.plan, chosen, review.rec);
			const clips = store.project?.manifest.rig.animations ?? [];
			toast(
				message('moveImport.imported', {
					names: formatList(added.map((entry) => displayMove(entry.id, clips)))
				}),
				{ tone: 'success' }
			);
			if (added[0]) ui.anim = added[0].id;
			ui.sheet = null;
		} catch (e) {
			if (alive) fail(e);
		} finally {
			if (alive) busy = false;
		}
	}
	const label = (row: MoveImportRow) => displayMove(row.id, review?.clips ?? []);
	const itemNames = (ids: readonly string[]) =>
		formatList(
			ids.map((id) => review?.rec.manifest.items.find((item) => item.id === id)?.name ?? id)
		);
	/** This character's items worn on its other moves that get no frames on an imported one (made later, like any move). */
	function missing(row: MoveImportRow): string[] {
		const m = review?.rec.manifest;
		if (!m) return [];
		return m.items
			.filter(
				(item) =>
					!item.variantOf &&
					item.id !== m.rig.baseItem &&
					!row.items.includes(item.id) &&
					!!item.coverage?.some((cell) => !cell.startsWith(`${DEFAULT_MOVE}/`))
			)
			.map((item) => item.id);
	}

	/** The paid Add a move request that redraws this body in an imported move's motion. */
	function motionSpec(row: MoveImportRow): MoveSpec | undefined {
		if (!review || !row.poses) return;
		const m = review.rec.manifest,
			clip = review.clips.find((entry) => entry.id === row.id),
			n = Object.values(row.poses)[0]?.length ?? 0;
		return {
			id: row.targetId,
			poses: row.poses,
			frames: n,
			animation: {
				model: 'skeleton-v3',
				frameCount: defaultMoveFrameCount('skeleton-v3', m.rig.cell.w, n),
				loop: clip?.moveLoop ?? clip?.loop ?? true
			},
			items: [],
			reviewBeforePublish: true,
			seed: 1 + Math.floor(Math.random() * 1_000_000),
			approvedDirs: genDirs(m)
		};
	}
	function motionOffer(row: MoveImportRow) {
		const spec = motionSpec(row);
		if (!spec || !review) return;
		try {
			if (!moveRigReady(review.rec)) return { spec, error: t('create.errors.setUpRigFirst') };
			// App-side warnings (too little frame room) are shown here; choosing the button generates past them, as
			// "Generate anyway" does in New move.
			const warnings =
				store.project && doc.id === review.projectId
					? movePreflightWarnings(store.project, spec)
					: [];
			if (warnings.length) spec.acceptedWarnings = warnings.map((warning) => warning.id);
			return {
				spec,
				warnings,
				frames: spec.animation!.frameCount!,
				gens: moveEstimate(review.rec.manifest, spec).gens,
				tier: moveMinimumTier(review.rec.manifest, spec)
			};
		} catch (e) {
			return { spec, error: displayError(e) };
		}
	}
	function useMotion(row: MoveImportRow) {
		const offer = motionOffer(row);
		if (!offer || offer.error || !review) return;
		const { projectId } = review;
		withKey(() => {
			if (doc.id !== projectId) return;
			void queueMoves(projectId, [offer.spec]);
			ui.sheet = 'move';
		}, offer.tier);
	}
</script>

<svelte:window ondragover={preventFileNavigation} ondrop={preventFileNavigation} />

<Sheet
	title={ui.tab === 'states' ? t('moveImport.importStates') : t('moveImport.title')}
	onclose={() => (ui.sheet = null)}
	locked={busy && !!review}
	back={review && !busy ? () => (review = undefined) : undefined}
	backDiscards
	dirty={!!review}
>
	<div
		class="import-moves"
		role="presentation"
		ondragenter={drop.enter}
		ondragleave={drop.leave}
		ondragover={drop.over}
		ondrop={drop.drop}
	>
		{#if !review}
			<section
				class="bu-dialog-surface import-drop"
				aria-label={t('moveImport.dropArea')}
				aria-busy={busy}
			>
				<FileArchive size={32} />
				<strong aria-live="polite"
					>{busy
						? t('import.reading')
						: dragging
							? t('import.release')
							: t('moveImport.drop')}</strong
				>
				<span class="muted small">{t('moveImport.intro')}</span>
				<button
					class="bu-action btn"
					data-variant="outline"
					disabled={busy}
					onclick={() => fileInput?.click()}>{t('import.chooseZip')}</button
				>
				<input
					hidden
					type="file"
					accept=".zip,application/zip"
					aria-label={t('moveImport.zip')}
					bind:this={fileInput}
					disabled={busy}
					onchange={fileChanged}
				/>
			</section>
			<p class="faint small">{t('moveImport.editHint')}</p>
		{:else}
			{@const fit = review.plan.fit}
			<p class={fit.same ? 'notice small' : 'notice warn small'} role="status">
				{fit.same
					? fit.differing
						? t('moveImport.fit.near', { count: fit.differing })
						: fit.shift
							? t('moveImport.fit.shifted')
							: t('moveImport.fit.same')
					: fit.reason === 'directions'
						? t('moveImport.fit.directions')
						: t('moveImport.fit.body')}
			</p>
			{#if !rows.length}<p class="muted">{t('moveImport.empty')}</p>{/if}
			<ul class="rows">
				{#each rows as row (row.id)}
					{@const image = review.frames.get(row.id)}
					{@const offer = row.action === 'motion' ? motionOffer(row) : undefined}
					<li class="row">
						<span class="thumb"
							><Sprite
								img={image ?? null}
								k={image ? croppedBacking(48, image, ui.dpr) : 1}
								fitToBox={!!image && (image.w > 48 || image.h > 48)}
								label={t('moves.preview', { move: label(row) })}
							/></span
						>
						<span class="text">
							{#if importable(row)}
								<label class="check"
									><input
										type="checkbox"
										checked={chosen.includes(row.id)}
										disabled={busy}
										onchange={(e) => toggle(row.id, e.currentTarget.checked)}
									/><b>{label(row)}</b></label
								>
							{:else}<b>{label(row)}</b>{/if}
							<span class="muted small"
								>{t(row.kind === 'state' ? 'moveImport.state' : 'moveImport.move')} · {t(
									'moves.frames',
									{ count: row.cells }
								)}</span
							>
							<span class="small">
								{#if row.action === 'add'}{t('moveImport.row.add')}
								{:else if row.action === 'copy'}{t('moveImport.row.copy', {
										name: row.targetName ?? row.targetId
									})}
								{:else if row.action === 'present'}{t('moveImport.row.present')}
								{:else if row.action === 'motion'}{t('moveImport.row.motion')}
								{:else}{t(
										row.kind === 'state'
											? 'moveImport.row.stateUnavailable'
											: 'moveImport.row.unavailable'
									)}{/if}
							</span>
							{#if importable(row) && row.items.length}<span class="muted small"
									>{t('moveImport.row.items', { items: itemNames(row.items) })}</span
								>{/if}
							{#if importable(row) && row.left.length}<span class="muted small"
									>{t('moveImport.row.left', { items: formatList(row.left) })}</span
								>{/if}
							{#if importable(row) && missing(row).length}<span class="muted small"
									>{t('moveImport.row.missing', { items: itemNames(missing(row)) })}</span
								>{/if}
							{#if offer}
								{#if offer.error}<span class="notice warn small">{offer.error}</span>
								{:else}
									{#each offer.warnings ?? [] as warning (warning.id)}<span
											class="notice warn small">{displayError(warning)}</span
										>{/each}
									<button
										class="bu-action btn motion"
										data-variant="outline"
										disabled={busy}
										onclick={() => useMotion(row)}
										>{offer.warnings?.length
											? t('moveSheet.checkpoint.generateAnyway', {
													move: row.targetName ?? label(row)
												})
											: t('moveImport.useMotion', { move: row.targetName ?? label(row) })}<span
											class="cost"
											>{t('moves.frames', { count: offer.frames ?? 0 })} · {t('moves.estimate', {
												gens: formatNumber(Math.ceil(offer.gens ?? 0))
											})}</span
										></button
									>
								{/if}
							{/if}
						</span>
					</li>
				{/each}
			</ul>
			{#if blocked}<p class="notice warn small" role="status">{displayError(blocked)}</p>{/if}
		{/if}
		{#if error}<p class="notice bad small" role="alert">
				{displayNestedMessage(error)}{#if cause}<ReportButton error={cause} />{/if}
			</p>{/if}
	</div>
	{#snippet footer()}
		{#if review && rows.some(importable)}
			<span class="foot-note muted small">{t('moveImport.free')}</span>
			<button
				class="bu-action btn primary"
				data-variant="primary"
				disabled={!chosen.length || busy || !!blocked}
				onclick={() => void save()}
				>{busy ? t('moveImport.importing') : t('moveImport.import')}</button
			>
		{/if}
	{/snippet}
</Sheet>

<style>
	.import-moves {
		display: grid;
		gap: 12px;
		min-width: 0;
	}
	.import-drop {
		display: grid;
		justify-items: center;
		gap: 12px;
		padding: 28px 16px;
		text-align: center;
	}
	.rows {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		min-width: 0;
	}
	.thumb {
		flex: none;
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
	}
	.text {
		display: grid;
		gap: 2px;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.check {
		align-items: center;
	}
	.motion {
		justify-self: start;
		margin-top: 6px;
		min-height: 44px;
		gap: 8px;
	}
</style>
