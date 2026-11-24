<!-- The live views' actions. Touch shows a thumb cluster at the stage's lower right: the Attack stick with Jump, Sprint and
     Mount on an arc around it (config.ts MOTION.actions). A mouse shows a compact icon bar there, with shortcut tooltips.
     Nothing here ever takes keyboard focus: Space, Shift, E and F stay the stage's (gameAction.ts). Jump and Attack last
     while held; Sprint and Mount toggle. A press in the air does nothing, without dimming the buttons on every jump. -->
<script lang="ts">
	import { t } from 'svelte-whisper';
	import { gameAction } from '../../lib/input/gameAction.ts';
	import type { JoystickSnapshot } from '../../lib/input/joystick.ts';
	import StickControl from '../../lib/input/StickControl.svelte';
	import TouchActionButton from '../../lib/input/TouchActionButton.svelte';
	import { ArrowBigUp, ChevronsRight, PawPrint, Sword } from '../icons.ts';
	import { actionArc } from './actionArc.ts';
	import { MOTION } from './config.ts';

	let {
		touch,
		mounted,
		sprinting,
		onattack,
		onattackrelease,
		onstick,
		onjump,
		onjumprelease,
		onsprint,
		onmount
	}: {
		touch: boolean;
		mounted: boolean;
		/** The Sprint toggle's state (Shift sprints without it). */
		sprinting: boolean;
		/** Attack held along the travel or facing: the desktop button, or the stick tapped by assistive technology. */
		onattack: () => void;
		onattackrelease: () => void;
		/** The touch Attack stick's every press, drag and release. */
		onstick: (snapshot: JoystickSnapshot) => void;
		onjump: () => void;
		onjumprelease: () => void;
		onsprint: () => void;
		onmount: () => void;
	} = $props();
	const attack = $derived(t('liveViews.attack')),
		jump = $derived(t('liveViews.jump')),
		sprint = $derived(t('liveViews.sprint')),
		mount = $derived(t('liveViews.mount'));
	const { stick } = MOTION.actions,
		arc = actionArc(),
		radius = stick.base / 2;
	/** A button's place in the cluster, measured from the cluster's lower right like the stick itself. */
	const place = ({ size, x, y }: { size: number; x: number; y: number }) =>
		`right: ${radius - x - size / 2}px; bottom: ${radius - y - size / 2}px;`;
	// The cluster's box: from the stick's lower right to the leftmost and topmost button edges.
	const width = Math.max(...Object.values(arc).map((b) => radius - b.x + b.size / 2)),
		height = Math.max(...Object.values(arc).map((b) => radius - b.y + b.size / 2));
</script>

{#if touch}
	<div
		class="game-touch"
		role="group"
		aria-label={t('liveViews.actions')}
		style:--cluster-w="{width}px"
		style:--cluster-h="{height}px"
	>
		<div class="stick-place">
			<StickControl
				label={attack}
				size={stick}
				deadZone={MOTION.joystick.deadZone}
				onchange={onstick}
				onactivate={() => {
					onattack();
					onattackrelease();
				}}><Sword aria-hidden="true" /></StickControl
			>
		</div>
		<div class="button-place" style={place(arc.jump)}>
			<TouchActionButton
				label={jump}
				size={arc.jump.size}
				onactivate={onjump}
				onrelease={onjumprelease}><ArrowBigUp aria-hidden="true" /></TouchActionButton
			>
		</div>
		<div class="button-place" style={place(arc.sprint)}>
			<TouchActionButton
				label={sprint}
				size={arc.sprint.size}
				pressed={sprinting}
				onactivate={onsprint}><ChevronsRight aria-hidden="true" /></TouchActionButton
			>
		</div>
		<div class="button-place" style={place(arc.mount)}>
			<TouchActionButton label={mount} size={arc.mount.size} pressed={mounted} onactivate={onmount}
				><PawPrint aria-hidden="true" /></TouchActionButton
			>
		</div>
	</div>
{:else}
	<div class="game-bar bu-floating" role="group" aria-label={t('liveViews.actions')}>
		<button
			type="button"
			class="bu-action"
			data-variant="quiet"
			aria-label={attack}
			aria-keyshortcuts="E"
			title={t('liveViews.withShortcut', { action: attack, key: t('liveViews.attackKeys') })}
			{@attach gameAction(
				() => onattack(),
				() => onattackrelease()
			)}><Sword size={18} aria-hidden="true" /></button
		>
		<button
			type="button"
			class="bu-action"
			data-variant="quiet"
			aria-label={jump}
			aria-keyshortcuts="Space"
			title={t('liveViews.withShortcut', { action: jump, key: t('liveViews.spaceKey') })}
			{@attach gameAction(
				() => onjump(),
				() => onjumprelease()
			)}><ArrowBigUp size={18} aria-hidden="true" /></button
		>
		<button
			type="button"
			class="bu-action"
			data-variant="quiet"
			aria-label={sprint}
			aria-pressed={sprinting}
			aria-keyshortcuts="Shift"
			title={t('liveViews.withShortcut', { action: sprint, key: t('liveViews.shiftKey') })}
			{@attach gameAction(() => onsprint())}><ChevronsRight size={18} aria-hidden="true" /></button
		>
		<button
			type="button"
			class="bu-action"
			data-variant="quiet"
			aria-label={mount}
			aria-pressed={mounted}
			aria-keyshortcuts="F"
			title={t('liveViews.withShortcut', { action: mount, key: 'F' })}
			{@attach gameAction(() => onmount())}><PawPrint size={18} aria-hidden="true" /></button
		>
	</div>
{/if}

<style>
	/* Both sit at the stage's lower right, beside the side panel, clear of the notch and home indicator. */
	.game-touch,
	.game-bar {
		position: fixed;
		z-index: 4;
		/* Right-aligned with the zoom controls at the top right (layout.css .scene-zoom), clear of the notch. */
		right: calc(var(--stage-right) + max(var(--edge), env(safe-area-inset-right)));
		bottom: calc(var(--stage-bottom, 0px) + max(12px, env(safe-area-inset-bottom)));
	}
	.game-touch {
		inline-size: var(--cluster-w);
		block-size: var(--cluster-h);
		/* The cluster's empty corners let presses through to the stage, so movement can start anywhere. */
		pointer-events: none;
	}
	.stick-place,
	.button-place {
		position: absolute;
		display: grid;
		pointer-events: auto;
	}
	.stick-place {
		right: 0;
		bottom: 0;
	}
	.game-bar {
		bottom: calc(var(--stage-bottom, 0px) + 16px);
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 2px;
	}
	.game-bar .bu-action {
		min-inline-size: 40px;
		min-block-size: 40px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.game-bar .bu-action:global([data-pressed]) {
		scale: 0.94;
	}
</style>
