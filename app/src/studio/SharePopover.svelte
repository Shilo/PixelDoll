<script lang="ts">
	import type { DirectionName } from '../lib/store/manifest.ts';
	import Sprite from './Sprite.svelte';
	import PopoverArrow from './PopoverArrow.svelte';
	import { doc, store, ui, view } from './state.svelte.ts';
	import { displayDirection } from './displayDirection.ts';
	import { directionLabel } from '../lib/rig/directions.ts';
	import { errorTranslation } from '../lib/message.ts';
	import { displayMove } from './displayMove.ts';
	import { popoverFocus } from './experience/focus.ts';
	import {
		ALL_DIRECTIONS,
		ALL_MOVES,
		SHARE_SCALES,
		buildShareMedia,
		buildSharePresentation,
		canAnimateShare,
		encodeShareMedia,
		encodeSharePng,
		shareDimensions,
		sharePreviewFrames
	} from './shareMedia.ts';
	import {
		Clapperboard,
		Compass,
		Copy,
		Download,
		LoaderCircle,
		PersonStanding,
		Scaling,
		Share2,
		ChevronDown
	} from './icons.ts';
	import { getLocale, t } from 'svelte-whisper';

	let popover: HTMLElement;
	let open = $state(false);
	let move = $state('');
	let direction = $state<string>('south');
	let wantedAnimate = $state(true);
	let index = $state(0);
	let scale = $state(1);
	let png = $state.raw<Blob | null>(null);
	let copying = $state(false);
	let file = $state.raw<File | null>(null);
	let encoding = $state(false);
	// Kept as a function so a shown message follows a language switch.
	let feedback = $state<(() => string) | null>(null);
	let viewportWidth = $state(innerWidth);
	let viewportHeight = $state(innerHeight);
	const moveRefs = $derived(store.project?.manifest.rig.animations ?? []);
	let serial = 0;
	let rememberedId = '';
	const availability = $derived.by(() => {
		void doc.rev;
		return open && view.project
			? buildSharePresentation(view.project, { loading: doc.loading })
			: null;
	});
	const canAnimate = $derived(
		availability ? canAnimateShare(availability, move, direction) : false
	);
	const animate = $derived(wantedAnimate && canAnimate);
	const planned = $derived.by(() => {
		if (!availability) return { media: null, error: null };
		try {
			return {
				media: buildShareMedia(availability, view.items, move, direction, animate),
				error: null
			};
		} catch (error) {
			return { media: null, error: error as unknown };
		}
	});
	const previewFrames = $derived(planned.media ? sharePreviewFrames(planned.media) : []);
	const image = $derived(previewFrames[index % previewFrames.length] ?? null);
	const previewHeight = $derived(Math.max(72, Math.min(220, viewportHeight - 370)));
	const previewWidth = $derived(
		Math.min(360, viewportWidth - 16) - (viewportWidth <= 440 ? 14 : 18)
	);
	const previewLimit = $derived(
		image
			? Math.max(
					1,
					Math.floor(
						Math.min(
							((previewWidth - 8) * Math.max(image.w, image.h)) / image.w,
							((previewHeight - 12) * Math.max(image.w, image.h)) / image.h
						)
					)
				)
			: 112
	);
	const label = $derived(planned.media?.animated ? 'GIF' : 'PNG');
	const dimensions = $derived(planned.media ? shareDimensions(planned.media, scale) : null);
	const canShare = $derived(
		!!file &&
			typeof navigator.share === 'function' &&
			typeof navigator.canShare === 'function' &&
			navigator.canShare({ files: [file] })
	);
	const name = $derived(
		(
			store.projects.find((project) => project.id === doc.id)?.name ??
			store.project?.manifest.name ??
			'character'
		)
			.replace(/[^a-z0-9-]+/gi, '-')
			.replace(/^-|-$/g, '')
			.toLowerCase() || 'character'
	);
	const omittedText = $derived.by(() => {
		const missing = planned.media?.omitted ?? [];
		if (!missing.length) return '';
		const english = getLocale() === 'en';
		const names = missing
			.slice(0, 3)
			.map(({ move, direction }) =>
				english
					? `${move.replaceAll('-', ' ')} ${directionLabel(direction)}`
					: `${displayMove(move, moveRefs)} ${displayDirection(direction)}`
			);
		const more = missing.length - 3;
		return t(more > 0 ? 'share.omittedMore' : 'share.omitted', {
			count: missing.length,
			names: names.join(', '),
			more
		});
	});

	/** A share error in the active language; its direction id is shown by name. */
	function shareError(error: unknown): string {
		const translation = errorTranslation(error);
		if (!translation) return (error as Error).message;
		const { direction, ...vars } = (translation.vars ?? {}) as Record<string, unknown>;
		return t(
			translation.key,
			typeof direction === 'string'
				? { ...vars, direction: displayDirection(direction as DirectionName) }
				: vars
		);
	}

	$effect(() => {
		if (!open) return;
		void doc.rev;
		reconcileSelection();
	});
	$effect(() => {
		const frames = planned.media?.frames;
		if (!open || !frames || frames.length < 2) return;
		const timer = window.setTimeout(
			() => {
				index = (index + 1) % frames.length;
			},
			Math.max(20, frames[index % frames.length].ms)
		);
		return () => window.clearTimeout(timer);
	});
	$effect(() => {
		const media = planned.media;
		const size = scale;
		const filename = `${name}-${move === ALL_MOVES ? 'all-moves' : move}-${direction === ALL_DIRECTIONS ? 'all-directions' : direction}`;
		file = null;
		png = null;
		feedback = null;
		copying = false;
		if (!open || !media) {
			encoding = false;
			return;
		}
		encoding = true;
		const run = ++serial;
		const controller = new AbortController();
		// Prepare both outputs before activation, retaining the click's clipboard/share permission.
		void new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
			.then(async () => {
				controller.signal.throwIfAborted();
				const pngBytes = await encodeSharePng(media, size);
				if (run !== serial) return;
				png = new Blob([pngBytes as Uint8Array<ArrayBuffer>], { type: 'image/png' });
				const bytes = media.animated
					? await encodeShareMedia(media, size, controller.signal)
					: pngBytes;
				if (run !== serial) return;
				file = new File([bytes as Uint8Array<ArrayBuffer>], `${filename}.${media.extension}`, {
					type: media.mime
				});
				encoding = false;
			})
			.catch((error) => {
				if (run !== serial) return;
				feedback = () =>
					t('share.prepareFailed', {
						format: media.extension.toUpperCase(),
						detail: shareError(error)
					});
				encoding = false;
			});
		return () => {
			serial++;
			controller.abort();
		};
	});

	function reconcileSelection() {
		const manifest = store.project?.manifest;
		if (!manifest || !doc.id || doc.loading) return;
		const moves = manifest.rig.animations.map((animation) => animation.id);
		const directions: string[] = manifest.rig.directions.map((entry) => entry.id);
		const currentMove = moves.includes(ui.anim) ? ui.anim : (moves[0] ?? '');
		const currentDirection = directions.includes(ui.dir) ? ui.dir : (directions[0] ?? 'south');
		if (rememberedId !== doc.id) {
			rememberedId = doc.id;
			move = currentMove;
			direction = currentDirection;
			wantedAnimate = true;
			scale = 1;
			index = 0;
			return;
		}
		if (move !== ALL_MOVES && !moves.includes(move)) {
			move = currentMove;
			index = 0;
		}
		if (direction !== ALL_DIRECTIONS && !directions.includes(direction)) {
			direction = currentDirection;
			index = 0;
		}
	}
	function toggle(event: ToggleEvent & { currentTarget: EventTarget & HTMLElement }) {
		popoverFocus(event);
		open = event.newState === 'open';
		if (open) {
			reconcileSelection();
			index = 0;
			requestAnimationFrame(() => {
				if (open) popover.querySelector<HTMLSelectElement>('select')?.focus();
			});
		}
	}
	function download() {
		if (!file) return;
		const url = URL.createObjectURL(file);
		const link = document.createElement('a');
		link.href = url;
		link.download = file.name;
		document.body.append(link);
		link.click();
		link.remove();
		window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
	}
	function copyPng() {
		if (!png || copying) return;
		if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
			feedback = () => t('share.copyUnavailable');
			return;
		}
		const run = serial;
		copying = true;
		try {
			void navigator.clipboard
				.write([new ClipboardItem({ 'image/png': png })])
				.then(() => {
					if (run === serial) feedback = () => t('share.copied');
				})
				.catch((error) => {
					if (run === serial)
						feedback = () => t('share.copyFailed', { detail: (error as Error).message });
				})
				.finally(() => {
					if (run === serial) copying = false;
				});
		} catch (error) {
			copying = false;
			feedback = () => t('share.copyFailed', { detail: (error as Error).message });
		}
	}
	function share() {
		if (!file || !canShare) return;
		void navigator
			.share({ files: [file], title: store.project?.manifest.name ?? t('share.untitled') })
			.catch((error) => {
				if ((error as Error).name !== 'AbortError')
					feedback = () => t('share.shareFailed', { detail: (error as Error).message });
			});
	}
</script>

<svelte:window bind:innerWidth={viewportWidth} bind:innerHeight={viewportHeight} />
<div
	id="share-popover"
	class="share-popover bu-popover-anchor"
	data-placement="bottom-end"
	popover
	bind:this={popover}
	role="dialog"
	aria-label={t('share.dialog')}
	ontoggle={toggle}
>
	<PopoverArrow />
	<div class="share-surface bu-popover bu-popover-surface bu-floating">
		<div
			class="share-preview"
			style:--share-preview-height="{previewHeight}px"
			aria-label={t('share.preview')}
			role="img"
		>
			{#if image}<Sprite
					img={image}
					k={Math.max(1, Math.floor(3 * ui.dpr))}
					limit={previewLimit}
					label={t('share.artwork')}
				/>{/if}
		</div>
		<div class="share-controls">
			<label class="share-picker">
				<PersonStanding size={16} aria-hidden="true" />
				<select
					class="bu-select"
					aria-label={t('common.move')}
					bind:value={move}
					onchange={() => (index = 0)}
				>
					{#each store.project?.manifest.rig.animations ?? [] as animation (animation.id)}<option
							value={animation.id}>{displayMove(animation.id, moveRefs)}</option
						>{/each}
					<option value={ALL_MOVES}>{t('share.allMoves')}</option>
				</select>
				<ChevronDown size={14} aria-hidden="true" />
			</label>
			<label class="share-picker">
				<Compass size={16} aria-hidden="true" />
				<select
					class="bu-select"
					aria-label={t('common.direction')}
					bind:value={direction}
					onchange={() => (index = 0)}
				>
					{#each store.project?.manifest.rig.directions ?? [] as entry (entry.id)}<option
							value={entry.id}>{displayDirection(entry.id as DirectionName)}</option
						>{/each}
					<option value={ALL_DIRECTIONS}>{t('stage.allDirections')}</option>
				</select>
				<ChevronDown size={14} aria-hidden="true" />
			</label>
		</div>
		<div class="share-controls">
			<label class="share-picker">
				<Scaling size={16} aria-hidden="true" />
				<select class="bu-select" aria-label={t('share.size')} bind:value={scale}>
					{#each SHARE_SCALES as size}<option value={size}>{t('share.sizeOption', { size })}</option
						>{/each}
				</select>
				<ChevronDown size={14} aria-hidden="true" />
			</label>
			<label class="share-animate bu-check bu-action" data-variant="field">
				<span><Clapperboard size={16} aria-hidden="true" />{t('share.animated')}</span>
				<input
					class="bu-switch"
					type="checkbox"
					role="switch"
					checked={animate}
					disabled={!canAnimate}
					onchange={(event) => {
						wantedAnimate = event.currentTarget.checked;
						index = 0;
					}}
				/>
			</label>
		</div>
		<hr class="share-divider bu-separator" />
		<div class="share-actions">
			<button class="bu-action" data-variant="outline" disabled={!png || copying} onclick={copyPng}
				><Copy size={16} aria-hidden="true" />{copying
					? t('common.copying')
					: t('share.copy')}</button
			>
			<button
				class="bu-action"
				data-variant="outline"
				disabled={!canShare || encoding}
				onclick={share}><Share2 size={16} aria-hidden="true" />{t('share.shareTo')}</button
			>
			<button
				class="share-download bu-action"
				data-variant="primary"
				aria-label={encoding
					? t('share.preparingLabel', { format: label })
					: t('share.downloadLabel', { format: label })}
				aria-describedby={dimensions ? 'share-output-resolution' : undefined}
				disabled={!file || encoding}
				onclick={download}
			>
				{#if encoding}<LoaderCircle
						class="share-spinner"
						size={16}
						aria-hidden="true"
					/>{:else}<Download size={16} aria-hidden="true" />{/if}
				<span>{encoding ? t('common.preparing') : t('share.downloadLabel', { format: label })}</span
				>
				{#if dimensions}<span id="share-output-resolution" class="share-resolution"
						>{t('share.resolution', { width: dimensions.w, height: dimensions.h })}</span
					>{/if}
			</button>
		</div>
		{#if planned.error !== null}<p class="share-message bu-error" role="status">
				{shareError(planned.error)}
			</p>{/if}
		{#if planned.media?.empty || omittedText}<p
				class="share-message bu-badge"
				data-tone="warning"
				role="status"
			>
				{planned.media?.empty ? t('share.error.noArtwork') : omittedText}
			</p>{/if}
		{#if feedback}<p class="share-message" role="status">{feedback()}</p>{/if}
	</div>
</div>
