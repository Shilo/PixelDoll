<script lang="ts">
	// Adjust frame: move the character (every item, layer, frame and joint) up or down and change its frame, free and lossless
	// (lib/rig/reframe.ts). One preview of the worn outfit inside the frame outline; nothing is saved until Save.
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import Sheet from './Sheet.svelte';
	import Sprite from './Sprite.svelte';
	import { LocalizedError, errorMessage, type Message } from '../lib/message.ts';
	import { formatNumber, t } from 'svelte-whisper';
	import { displayError, displayMessage, displayNestedMessage } from '../lib/i18n.ts';
	import { composeCell } from '../lib/compose/compose.ts';
	import { makeImg, type Img } from '../lib/image/png.ts';
	import { loadProject, readStoredImage } from '../lib/store/project.ts';
	import {
		FRAME_COST_STEPS,
		frameFacts,
		frameIssue,
		makeRoom,
		roomShort,
		type FrameFacts
	} from '../lib/rig/reframe.ts';
	import { DEFAULT_MOVE, type DirectionName } from '../lib/rig/rig.ts';
	import { displayDirection } from './displayDirection.ts';
	import { downloadCharacterZip } from './download.svelte.ts';
	import { ArrowDown, ArrowUp, Download, WandSparkles } from './icons.ts';
	import NumberStepper from './NumberStepper.svelte';
	import {
		adjustCharacter,
		blockedByWork,
		doc,
		flushSave,
		frameEditsBlocked,
		openPendingWork,
		ui
	} from './state.svelte.ts';
	let { id }: { id: string } = $props();
	let loaded = $state.raw<Awaited<ReturnType<typeof loadProject>>>();
	let facts = $state.raw<FrameFacts>();
	let size = $state(0);
	let dy = $state(0);
	let dir = $state<DirectionName>('south');
	let busy = $state(false);
	let error = $state<string | Message>('');
	let note = $state<string | Message>('');
	const m = $derived(loaded?.project.manifest);
	const current = $derived(facts?.size ?? 0);
	const valid = $derived(Number.isInteger(size) && (size - current) % 2 === 0);
	// A typed size can be anything; only the allowed range is ever drawn (a huge one would freeze the page).
	const inRange = $derived(!!facts && size >= facts.min && size <= facts.max);
	const issue = $derived(facts && valid ? frameIssue(facts, { size, dy }) : undefined);
	const changed = $derived(!!facts && valid && (size !== current || dy !== 0));
	const blocked = $derived(frameEditsBlocked(id));
	const short = $derived(!!facts?.room && roomShort(facts.room));
	// The highest cost step the new frame crosses that the current one stays under: one consequence, at the decision.
	const step = $derived(
		valid ? [...FRAME_COST_STEPS].reverse().find((s) => size > s && current <= s) : undefined
	);
	const STEP_TEXT = {
		80: 'create.form.frameAbove80',
		96: 'adjustFrame.above96',
		128: 'create.form.frameAbove128',
		170: 'adjustFrame.above170'
	} as const;
	const directions = $derived(m?.rig.directions.map((d) => d.id) ?? []);
	// The worn outfit of the open character, else its first saved outfit.
	const outfit = $derived(
		doc.id === id ? $state.snapshot(doc.items) : (m?.presets[0]?.items ?? {})
	);
	// Whole device pixels per sprite pixel, about 300 CSS px tall (220 on phones, 160 in phone landscape).
	const k = $derived(
		Math.max(
			1,
			Math.floor(
				(ui.dpr * (ui.size === 'landscape' ? 160 : ui.size === 'compact' ? 220 : 300)) /
					Math.max(1, size)
			)
		)
	);
	// The view as Save will store it: re-centered on the new frame and moved; anything outside the frame is cut off.
	const view = $derived.by((): Img | null => {
		if (!loaded || !m || !valid || !inRange) return null;
		const d = directions.includes(dir) ? dir : directions[0];
		if (!d || !m.rig.animations.some((a) => a.id === DEFAULT_MOVE)) return null;
		const art = composeCell(loaded.project, outfit, DEFAULT_MOVE, d, 0),
			p = (size - current) / 2,
			out = makeImg(size, size);
		for (let y = 0; y < art.h; y++)
			for (let x = 0; x < art.w; x++) {
				const X = x + p,
					Y = y + p + dy;
				if (X < 0 || Y < 0 || X >= size || Y >= size) continue;
				out.data.set(
					art.data.subarray((y * art.w + x) * 4, (y * art.w + x + 1) * 4),
					(Y * size + X) * 4
				);
			}
		return out;
	});
	const moved = $derived(
		dy < 0
			? t('adjustFrame.movedUp', { px: formatNumber(-dy) })
			: dy > 0
				? t('adjustFrame.movedDown', { px: formatNumber(dy) })
				: t('adjustFrame.notMoved')
	);
	$effect(() => {
		const projectId = id;
		const controller = new AbortController();
		void (async () => {
			try {
				await flushSave();
				const saved = await loadProject(projectId, controller.signal);
				if (saved.rec.origin !== 'studio')
					throw new LocalizedError(
						'This saved character is no longer available.',
						'directionsSheet.characterUnavailable'
					);
				const found = await frameFacts(saved.rec, saved.project.images, readStoredImage);
				if (controller.signal.aborted) return;
				loaded = saved;
				facts = found;
				size = found.size;
				dir = saved.project.manifest.rig.directions[0]?.id ?? 'south';
			} catch (failure) {
				if (!controller.signal.aborted) error = errorMessage(failure);
			}
		})();
		return () => controller.abort();
	});
	const nudge = (rows: number) => {
		dy = Math.max(-size, Math.min(size, dy + rows));
		note = '';
	};
	function keys(event: KeyboardEvent) {
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
		event.preventDefault();
		const rows = event.shiftKey ? 4 : 1;
		nudge(event.key === 'ArrowUp' ? -rows : rows);
	}
	function room() {
		if (!facts) return;
		const plan = makeRoom(facts);
		if (plan.limit) {
			note = { key: 'adjustFrame.errors.limit', vars: { size: plan.size } };
			return;
		}
		size = plan.size;
		dy = plan.dy;
		note =
			plan.size === current && !plan.dy
				? { key: 'adjustFrame.roomy' }
				: { key: 'adjustFrame.madeRoom' };
	}
	async function save() {
		if (!changed || issue || blocked || busy) return;
		busy = true;
		error = '';
		try {
			// Saved only onto the version this preview showed: a change made elsewhere since then is refused, not overwritten.
			await adjustCharacter(id, { size, dy }, { expect: loaded?.rec });
			ui.sheet = null;
		} catch (failure) {
			error = errorMessage(failure);
			busy = false;
		}
	}
</script>

<Sheet title={t('adjustFrame.title')} wide cancelDisabled={busy} onclose={() => (ui.sheet = null)}>
	{#if loaded && m && facts}
		<p class="muted">{t('adjustFrame.intro')}</p>
		<div class="adjust">
			<div
				class="preview"
				role="slider"
				tabindex="0"
				aria-orientation="vertical"
				aria-label={t('adjustFrame.previewLabel')}
				aria-describedby="adjust-frame-keys"
				aria-valuemin={-size}
				aria-valuemax={size}
				aria-valuenow={-dy}
				aria-valuetext={moved}
				onkeydown={keys}
			>
				<span class="frame-outline"
					><Sprite
						img={view}
						{k}
						w={size}
						h={size}
						checker
						label={t('adjustFrame.preview', {
							direction: displayDirection(dir),
							size: formatNumber(size)
						})}
					/></span
				>
				<p class="faint small" id="adjust-frame-keys">{t('adjustFrame.keys')}</p>
			</div>
			<div class="controls">
				<button class="bu-action btn room" data-variant="outline" disabled={busy} onclick={room}
					><WandSparkles size={16} />{t('adjustFrame.makeRoom')}</button
				>
				<p class="muted small">{t('adjustFrame.makeRoomHelp')}</p>
				{#if note}<p class="notice small" role="status">{displayMessage(note)}</p>{/if}
				{#if short && !changed}<p class="notice warn small">{t('adjustFrame.short')}</p>{/if}
				{#if directions.length > 1}
					<div class="seg" role="group" aria-label={t('adjustFrame.direction')}>
						{#each directions as d (d)}
							<button type="button" aria-pressed={dir === d} onclick={() => (dir = d)}
								>{displayDirection(d)}</button
							>
						{/each}
					</div>
				{/if}
				<div class="control-row">
					<span class="label">{t('adjustFrame.position')}</span>
					<div class="buttons">
						<button
							class="bu-action btn"
							data-variant="outline"
							disabled={busy}
							onclick={() => nudge(-1)}><ArrowUp size={16} />{t('adjustFrame.up')}</button
						>
						<button
							class="bu-action btn"
							data-variant="outline"
							disabled={busy}
							onclick={() => nudge(1)}><ArrowDown size={16} />{t('adjustFrame.down')}</button
						>
					</div>
					<span class="readout" aria-live="polite">{moved}</span>
				</div>
				<div class="control-row">
					<span class="label" id="adjust-frame-size">{t('adjustFrame.size')}</span>
					<NumberStepper
						bind:value={size}
						min={facts.min}
						max={facts.max}
						step={2}
						accept={Number.isFinite}
						suffix="px"
						disabled={busy}
						labelledby="adjust-frame-size"
						decreaseLabel={t('adjustFrame.smaller')}
						increaseLabel={t('adjustFrame.larger')}
						onchange={() => (note = '')}
					/>
				</div>
				{#if issue}<p class="notice warn small" role="status">{displayError(issue)}</p>
				{:else if step}<p class="notice small">{t(STEP_TEXT[step])}</p>{/if}
				{#if changed}<p class="muted small">{t('adjustFrame.consequences')}</p>{/if}
				{#if blocked}<p class="notice warn small" role="status">{displayError(blocked)}</p>{/if}
				{#if blockedByWork(blocked)}<button
						class="bu-btn"
						onclick={() =>
							void openPendingWork({
								projectId: id,
								flows: !!blocked && blocked.translation.key !== 'adjustFrame.errors.resolveDrafts'
							})}>{openerLabel(t('deleteSheet.viewPendingWork'))}<SurfaceChevron /></button
					>{/if}
				{#if error}<p class="notice bad small" role="alert">{displayNestedMessage(error)}</p>{/if}
			</div>
		</div>
	{:else if error}<p class="notice bad small" role="alert">{displayNestedMessage(error)}</p>
	{:else}<p class="muted" role="status">{t('adjustFrame.loading')}</p>{/if}
	{#snippet footer()}
		{#if loaded}<button
				class="bu-action btn plain"
				data-variant="quiet"
				disabled={busy}
				onclick={() => void downloadCharacterZip(id)}
				><Download size={16} />{t('directionsSheet.downloadBackup')}</button
			>{/if}
		<button
			class="bu-action btn primary"
			data-variant="primary"
			disabled={!changed || !!issue || !!blocked || busy}
			onclick={() => void save()}>{busy ? t('directionsSheet.saving') : t('common.save')}</button
		>
	{/snippet}
</Sheet>

<style>
	/* Two columns only when the sheet itself has room; a narrow sheet (phone landscape) stacks instead of squeezing the preview. */
	.adjust {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
		gap: 24px;
		align-items: start;
	}
	.preview {
		display: grid;
		justify-items: center;
		gap: 8px;
		padding: 12px;
		border-radius: var(--r-ctl);
		min-width: 0;
	}
	.preview:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	/* The frame edge itself: a 1px line just outside the sprite's own pixels, so the outline never covers artwork. */
	.frame-outline {
		display: inline-grid;
		padding: 0;
		outline: 1px solid var(--text-3);
		outline-offset: 0;
		max-width: 100%;
		overflow: hidden;
	}
	.controls {
		display: grid;
		gap: 12px;
		align-content: start;
		min-width: 0;
	}
	.control-row {
		display: grid;
		gap: 6px;
	}
	.buttons {
		display: flex;
		gap: 8px;
		align-items: stretch;
	}
	.buttons > .btn {
		min-height: 44px;
		flex: 1 1 auto;
	}
	.readout {
		font-variant-numeric: tabular-nums;
		color: var(--text-2);
	}
	.room {
		min-height: 44px;
		justify-self: start;
	}
	@media (max-width: 760px) {
		.adjust {
			gap: 16px;
		}
	}
</style>
