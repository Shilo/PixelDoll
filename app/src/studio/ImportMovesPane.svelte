<script lang="ts">
	// The Import page of New move and New State (moveImporter.svelte.ts holds its state): the ZIP's moves and States with what
	// importing each does here. The sheet renders the footer (ImportFoot).
	import Sprite from './Sprite.svelte';
	import ReportButton from './ReportButton.svelte';
	import ZipDrop from './ZipDrop.svelte';
	import { formatNumber, t } from 'svelte-whisper';
	import { displayError, displayNestedMessage } from '../lib/i18n.ts';
	import type { MoveImportRow } from '../lib/rig/moveImport.ts';
	import { DEFAULT_MOVE } from '../lib/rig/rig.ts';
	import { croppedBacking } from './experience/thumbnails.svelte.ts';
	import { displayMove } from './displayMove.ts';
	import { defaultMoveFrameCount } from './moveAnimationOptions.ts';
	import { genDirs, moveEstimate } from './movePricing.ts';
	import { moveMinimumTier, movePreflightWarnings, moveRigReady, type MoveSpec } from './create.ts';
	import { formatList } from './displayDirectionProblem.ts';
	import { importableMove as importable, type MoveImporter } from './moveImporter.svelte.ts';
	import { doc, queueMoves, store, ui, withKey } from './state.svelte.ts';

	let {
		importer,
		onqueued
	}: {
		importer: MoveImporter;
		/** A paid redraw was queued: show its progress. */
		onqueued: () => void;
	} = $props();
	const review = $derived(importer.review);
	const busy = $derived(importer.busy);

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
			onqueued();
		}, offer.tier);
	}
</script>

<div
	class="import-page"
	role="presentation"
	ondragenter={importer.drop.enter}
	ondragleave={importer.drop.leave}
	ondragover={importer.drop.over}
	ondrop={importer.drop.drop}
>
	<ZipDrop
		{busy}
		dragging={importer.dragging}
		intro={t('moveImport.intro')}
		compact={!!review}
		onfiles={(files) => void importer.read(files)}
	/>
	{#if !review}
		<p class="faint small">{t('moveImport.editHint')}</p>
	{:else}
		{@const fit = review.plan.fit}
		<p
			class="bu-notice"
			data-size="compact"
			data-tone={fit.same ? 'neutral' : 'warning'}
			role="status"
		>
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
		{#if !importer.rows.length}<p class="muted">{t('moveImport.empty')}</p>{/if}
		<ul class="rows">
			{#each importer.rows as row (row.id)}
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
									checked={importer.chosen.includes(row.id)}
									disabled={busy}
									onchange={(e) => importer.toggle(row.id, e.currentTarget.checked)}
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
							{#if offer.error}<span class="bu-notice" data-size="compact" data-tone="warning"
									>{offer.error}</span
								>
							{:else}
								{#each offer.warnings ?? [] as warning (warning.id)}<span
										class="bu-notice"
										data-size="compact"
										data-tone="warning">{displayError(warning)}</span
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
		{#if importer.blocked}<p
				class="bu-notice"
				data-size="compact"
				data-tone="warning"
				role="status"
			>
				{displayError(importer.blocked)}
			</p>{/if}
	{/if}
	{#if importer.error}<p class="bu-notice" data-size="compact" data-tone="danger" role="alert">
			{displayNestedMessage(importer.error)}{#if importer.cause}<ReportButton
					error={importer.cause}
				/>{/if}
		</p>{/if}
</div>

<style>
	.import-page {
		display: grid;
		gap: 12px;
		min-width: 0;
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
