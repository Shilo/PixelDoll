<script lang="ts">
	// Frame size: free, lossless room around a saved character (lib/rig/reframe.ts). The standing view previews the new frame.
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	import Sheet from './Sheet.svelte';
	import Sprite from './Sprite.svelte';
	import { LocalizedError, errorMessage, type Message } from '../lib/message.ts';
	import { formatNumber, t } from 'svelte-whisper';
	import { displayError } from '../lib/i18n.ts';
	import { composeCell } from '../lib/compose/compose.ts';
	import { makeImg, type Img } from '../lib/image/png.ts';
	import { loadProject, readStoredImage } from '../lib/store/project.ts';
	import {
		FRAME_COST_STEPS,
		frameLimits,
		roomFrame,
		roomShort,
		standingRoom,
		standingViews
	} from '../lib/rig/reframe.ts';
	import { DEFAULT_MOVE } from '../lib/rig/rig.ts';
	import {
		blockedByWork,
		flushSave,
		frameEditsBlocked,
		openPendingWork,
		resizeCharacter,
		ui
	} from './state.svelte.ts';
	let { id }: { id: string } = $props();
	let loaded = $state.raw<Awaited<ReturnType<typeof loadProject>>>();
	let limits = $state.raw<{ min: number; max: number }>();
	let size = $state<number>();
	let busy = $state(false);
	let error = $state<string | Message>('');
	const m = $derived(loaded?.project.manifest);
	const current = $derived(m?.rig.cell.w ?? 0);
	const room = $derived(
		m && loaded ? standingRoom(standingViews(m, loaded.project.images), current) : undefined
	);
	const suggested = $derived(
		room && limits && roomShort(room) ? roomFrame(current, room, limits.max) : undefined
	);
	const valid = $derived(
		!!limits &&
			Number.isInteger(size) &&
			size! >= limits.min &&
			size! <= limits.max &&
			(size! - current) % 2 === 0
	);
	const changed = $derived(valid && size !== current);
	const blocked = $derived(frameEditsBlocked(id));
	// The highest cost step the new frame crosses that the current one stays under: one consequence, at the decision.
	const step = $derived(
		valid ? [...FRAME_COST_STEPS].reverse().find((s) => size! > s && current <= s) : undefined
	);
	const STEP_TEXT = {
		80: 'create.form.frameAbove80',
		96: 'frameSheet.above96',
		128: 'create.form.frameAbove128',
		170: 'frameSheet.above170'
	} as const;
	const k = $derived(Math.max(1, Math.floor(ui.dpr * (ui.size === 'compact' ? 2 : 3))));
	// The first outfit's standing view, centered on the chosen frame as the transform will place it.
	const standing = $derived.by((): Img | null => {
		if (!loaded || !m) return null;
		const dir = m.rig.directions[0]?.id;
		if (!dir || !m.rig.animations.some((a) => a.id === DEFAULT_MOVE)) return null;
		const view = composeCell(loaded.project, m.presets[0]?.items ?? {}, DEFAULT_MOVE, dir, 0),
			to = valid ? size! : current,
			p = (to - current) / 2,
			out = makeImg(to, to);
		for (let y = 0; y < view.h; y++)
			for (let x = 0; x < view.w; x++) {
				const X = x + p,
					Y = y + p;
				if (X < 0 || Y < 0 || X >= to || Y >= to) continue;
				out.data.set(
					view.data.subarray((y * view.w + x) * 4, (y * view.w + x + 1) * 4),
					(Y * to + X) * 4
				);
			}
		return out;
	});
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
				const found = await frameLimits(saved.rec, saved.project.images, readStoredImage);
				if (controller.signal.aborted) return;
				loaded = saved;
				limits = found;
				size = saved.project.manifest.rig.cell.w;
			} catch (failure) {
				if (!controller.signal.aborted) error = errorMessage(failure);
			}
		})();
		return () => controller.abort();
	});
	async function save() {
		if (!changed || blocked || busy) return;
		busy = true;
		error = '';
		try {
			await resizeCharacter(id, size!);
			ui.sheet = null;
		} catch (failure) {
			error = errorMessage(failure);
			busy = false;
		}
	}
</script>

<Sheet title={t('frameSheet.title')} cancelDisabled={busy} onclose={() => (ui.sheet = null)}>
	{#if loaded && m && limits}
		<p class="muted">{t('frameSheet.intro', { name: m.name })}</p>
		<div class="frame-preview">
			<Sprite
				img={standing}
				{k}
				limit={200}
				checker
				label={t('frameSheet.preview', { size: formatNumber(valid ? size! : current) })}
			/>
		</div>
		<div class="frame-row">
			<div class="pixel-input">
				<input
					class="bu-input input"
					aria-label={t('frameSheet.size')}
					aria-describedby="frame-size-hint"
					type="number"
					min={limits.min}
					max={limits.max}
					step="2"
					disabled={busy}
					bind:value={size}
				/><span aria-hidden="true">px</span>
			</div>
			{#if suggested && suggested !== current}<button
					class="bu-action btn"
					data-variant="outline"
					disabled={busy || size === suggested}
					onclick={() => (size = suggested)}
					>{t('frameSheet.useRecommended', { size: formatNumber(suggested) })}</button
				>{/if}
		</div>
		<p class="muted small" id="frame-size-hint">
			{t('frameSheet.range', {
				current: formatNumber(current),
				min: formatNumber(limits.min),
				max: formatNumber(limits.max)
			})}
		</p>
		{#if suggested && suggested !== current}<p class="notice warn small">
				{t('frameSheet.roomShort', { size: formatNumber(suggested) })}
			</p>{/if}
		{#if step}<p class="notice small">{t(STEP_TEXT[step])}</p>{/if}
		{#if changed}<p class="muted small">{t('frameSheet.consequences')}</p>{/if}
		{#if blocked}<p class="notice warn small" role="status">{displayError(blocked)}</p>{/if}
		{#if blockedByWork(blocked)}<button
				class="bu-btn"
				onclick={() =>
					void openPendingWork({
						projectId: id,
						flows: !!blocked && blocked.translation.key !== 'frameSheet.errors.resolveDrafts'
					})}>{openerLabel(t('deleteSheet.viewPendingWork'))}<SurfaceChevron /></button
			>{/if}
		{#if error}<p class="notice bad small" role="alert">{displayError(error)}</p>{/if}
	{:else if error}<p class="notice bad small" role="alert">{displayError(error)}</p>
	{:else}<p class="muted" role="status">{t('frameSheet.loading')}</p>{/if}
	{#snippet footer()}
		<button
			class="bu-action btn primary"
			data-variant="primary"
			disabled={!changed || !!blocked || busy}
			onclick={() => void save()}>{busy ? t('directionsSheet.saving') : t('common.save')}</button
		>
	{/snippet}
</Sheet>

<style>
	.frame-preview {
		display: grid;
		place-items: center;
		padding-block: var(--space-2, 8px);
	}
	.frame-row {
		display: flex;
		gap: 8px;
		align-items: stretch;
		flex-wrap: wrap;
	}
	.pixel-input {
		position: relative;
		flex: 1 1 120px;
		min-width: 0;
	}
	.pixel-input input {
		padding-right: 33px;
		font-variant-numeric: tabular-nums;
		appearance: textfield;
		-moz-appearance: textfield;
	}
	.pixel-input input::-webkit-inner-spin-button {
		-webkit-appearance: none;
	}
	.pixel-input > span {
		position: absolute;
		right: 10px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-3);
		font-size: var(--fs-sm);
		pointer-events: none;
	}
</style>
