<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import CharacterThumb from './CharacterThumb.svelte';
	import { REFLECTION } from './config.ts';
	import { ui } from '../state.svelte.ts';
	import { carouselFrames, castPose, castTransform } from './carousel.ts';
	type Entry = { p: { id: string; name: string }; offset: number };
	type Actor = Entry & { leaving?: boolean; exitDirection?: number };
	let {
		entries,
		context,
		size,
		sideSize,
		direction,
		name,
		zoom = 1,
		cameraX,
		cameraRise = 0,
		culledOffsets = [],
		select
	}: {
		entries: Entry[];
		context: string;
		size: number;
		sideSize: number;
		direction: number;
		name: string;
		zoom?: number;
		cameraX?: number;
		/** Distance from the cast's frame-bottom line to the painted zoom pivot. */
		cameraRise?: number;
		culledOffsets?: number[];
		select: (id: string, activate: boolean) => void;
	} = $props();
	let width = $state(0),
		height = $state(0);
	let actors = $state.raw<Actor[]>([]);
	const nodes = new Map<string, HTMLButtonElement>();
	const animations = new Map<string, Animation>();
	let previous: Entry[] = [];
	let geometry = '';
	let generation = 0;
	let pressed: { id: string; activate: boolean } | null = null;
	function register(id: string) {
		return (node: HTMLButtonElement) => {
			nodes.set(id, node);
			return () => {
				if (nodes.get(id) === node) nodes.delete(id);
			};
		};
	}
	function cancel() {
		for (const animation of animations.values()) animation.cancel();
		animations.clear();
	}
	onDestroy(() => {
		generation++;
		cancel();
	});
	$effect(() => {
		const next = entries;
		const layout = [
			context,
			width,
			height,
			size,
			sideSize,
			ui.dpr,
			prefersReducedMotion.current
		].join('\0');
		const forward = untrack(() => direction) || 1;
		untrack(() => {
			void reconcile(next, layout, forward);
		});
	});
	async function reconcile(next: Entry[], layout: string, forward: number) {
		const epoch = ++generation;
		const old = previous;
		const moving =
			geometry === layout &&
			!prefersReducedMotion.current &&
			width > 0 &&
			next.length > 1 &&
			old.length > 1 &&
			old.find((actor) => !actor.offset)?.p.id !== next.find((actor) => !actor.offset)?.p.id;
		const poses = new Map<string, { transform: string; opacity: string }>();
		const durations = new Map<string, number>();
		for (const [id, node] of nodes) {
			const style = getComputedStyle(node);
			poses.set(id, { transform: style.transform, opacity: style.opacity });
			const animation = animations.get(id);
			if (animation)
				durations.set(
					id,
					Math.max(
						0,
						Number(animation.effect!.getTiming().duration) - Number(animation.currentTime)
					)
				);
		}
		cancel();
		geometry = layout;
		previous = next;
		const exits = moving
			? actors.filter(
					(actor) =>
						!next.some((entry) => entry.p.id === actor.p.id) &&
						(!actor.leaving || (durations.get(actor.p.id) ?? 0) > 0)
				)
			: [];
		for (const actor of exits) {
			const node = nodes.get(actor.p.id);
			if (node === document.activeElement)
				node?.closest<HTMLElement>('.selection-world')?.focus({ preventScroll: true });
		}
		actors = [
			...next,
			...exits.map((actor) => ({
				...actor,
				leaving: true,
				exitDirection: actor.exitDirection ?? forward
			}))
		];
		await tick();
		if (epoch !== generation) return;
		const edge = width / 2 + size;
		for (const actor of actors) {
			const node = nodes.get(actor.p.id);
			if (!node) continue;
			const pose = castPose(actor.offset, width, size, sideSize);
			if (actor.leaving) pose.x = -(actor.exitDirection ?? forward) * edge;
			const endpoint = castTransform(pose);
			node.style.transform = endpoint;
			node.style.opacity = actor.leaving ? '0' : '1';
			if (!moving) continue;
			const from = poses.get(actor.p.id) ?? {
				transform: castTransform({ ...pose, x: forward * edge }),
				opacity: '0'
			};
			const before = old.find((entry) => entry.p.id === actor.p.id);
			const wrap = Boolean(
				before?.offset && actor.offset && (actor.offset - before.offset) * forward > 0
			);
			const frames = carouselFrames(from, pose, edge, wrap, forward);
			if (actor.leaving) frames[frames.length - 1].opacity = 0;
			const animation = node.animate(frames, {
				duration:
					actor.leaving && exits.find((entry) => entry.p.id === actor.p.id)?.leaving
						? (durations.get(actor.p.id) ?? 220)
						: 220,
				easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
			});
			animations.set(actor.p.id, animation);
			animation.onfinish = () => {
				if (epoch !== generation) return;
				animations.delete(actor.p.id);
				if (actor.leaving) actors = actors.filter((entry) => entry.p.id !== actor.p.id);
			};
		}
	}
	function clicked(event: MouseEvent, actor: Actor) {
		const activate = event.detail && pressed?.id === actor.p.id ? pressed.activate : !actor.offset;
		pressed = null;
		select(actor.p.id, activate);
	}
</script>

<div class="cast" bind:clientWidth={width} bind:clientHeight={height}>
	<div
		class="cast-camera"
		style:transform="scale({zoom})"
		style:transform-origin="{cameraX ?? width / 2}px calc(100% - {cameraRise}px)"
	>
		{#each actors as actor (actor.p.id)}
			{@const culled = !!actor.offset && culledOffsets.includes(actor.offset)}
			<button
				{@attach register(actor.p.id)}
				class="cast-character carousel-character"
				class:chosen={!actor.offset && !actor.leaving}
				data-character-id={actor.p.id}
				inert={actor.leaving || culled}
				aria-hidden={actor.leaving || culled ? 'true' : undefined}
				style:visibility={culled ? 'hidden' : undefined}
				aria-label={actor.offset ? `Select ${actor.p.name}` : `Customize ${name}`}
				style:width="{size}px"
				style:margin-left="{-size / 2}px"
				onpointerdown={() => {
					pressed = { id: actor.p.id, activate: !actor.offset };
				}}
				onpointercancel={() => {
					pressed = null;
				}}
				onclick={(event) => clicked(event, actor)}
			>
				<CharacterThumb id={actor.p.id} name={actor.p.name} {size} />
				{#if REFLECTION.enabled && REFLECTION.selection}
					<span class="cast-reflection" aria-hidden="true">
						<CharacterThumb id={actor.p.id} name={actor.p.name} {size} />
					</span>
				{/if}
			</button>
		{/each}
	</div>
</div>

<style>
	.cast-camera {
		position: absolute;
		inset: 0;
	}

	.cast-character.carousel-character {
		position: absolute;
		left: 50%;
		bottom: 0;
		max-width: none;
		margin-bottom: 0;
		transform-origin: 50% 100%;
	}
</style>
