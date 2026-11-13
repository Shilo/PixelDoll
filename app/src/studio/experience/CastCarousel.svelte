<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import CharacterThumb from './CharacterThumb.svelte';
	import CastReflection from './CastReflection.svelte';
	import { ui } from '../state.svelte.ts';
	import { carouselFrames, castPose, castTransform } from './carousel.ts';
	import { groundedThumb, stills } from './thumbnails.svelte.ts';
	type Entry = { p: { id: string; name: string }; offset: number };
	type Actor = Entry & { leaving?: boolean; exitDirection?: number };
	let {
		entries,
		context,
		size,
		span = 1,
		direction,
		name,
		zoom = 1,
		cameraX,
		cameraRise = 0,
		cameraOffset = { x: 0, y: 0 },
		culledOffsets = [],
		floorHorizon,
		floorFocal,
		select
	}: {
		entries: Entry[];
		context: string;
		size: number;
		span?: number;
		direction: number;
		name: string;
		zoom?: number;
		cameraX?: number;
		/** Distance from the cast's frame-bottom line to the painted zoom pivot. */
		cameraRise?: number;
		cameraOffset?: { x: number; y: number };
		culledOffsets?: number[];
		floorHorizon: number;
		floorFocal: number;
		select: (id: string, activate: boolean) => void;
	} = $props();
	let width = $state(0),
		height = $state(0);
	let actors = $state.raw<Actor[]>([]);
	const nodes = new Map<string, HTMLButtonElement>();
	const reflections = new Map<string, HTMLElement>();
	const reflectionAnimations = new Map<string, Animation>();
	const animations = new Map<string, Animation>();
	let previous: Entry[] = [];
	const heroArt = $derived(
		groundedThumb(size, stills.get(entries.find((entry) => !entry.offset)?.p.id ?? ''), ui.dpr)
	);
	const artwork = $derived(
		JSON.stringify(entries.map(({ p }) => groundedThumb(size, stills.get(p.id), ui.dpr)))
	);
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
		for (const animation of reflectionAnimations.values()) animation.cancel();
		reflectionAnimations.clear();
	}
	function registerReflection(id: string) {
		return (node: HTMLElement) => {
			reflections.set(id, node);
			return () => {
				if (reflections.get(id) === node) reflections.delete(id);
			};
		};
	}
	onDestroy(() => {
		generation++;
		cancel();
	});
	$effect(() => {
		const next = entries;
		const art = JSON.parse(artwork) as ReturnType<typeof groundedThumb>[];
		const layout = [context, width, height, size, span, ui.dpr, prefersReducedMotion.current].join(
			'\0'
		);
		const forward = untrack(() => direction) || 1;
		untrack(() => {
			void reconcile(next, layout, forward, heroArt, art);
		});
	});
	async function reconcile(
		next: Entry[],
		layout: string,
		forward: number,
		hero: ReturnType<typeof groundedThumb>,
		artwork: ReturnType<typeof groundedThumb>[]
	) {
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
			const side =
				artwork[next.findIndex((entry) => entry.p.id === actor.p.id)] ??
				groundedThumb(size, stills.get(actor.p.id), ui.dpr);
			const pose = castPose(actor.offset, width, size, span, { hero, side });
			if (actor.leaving) pose.x = -(actor.exitDirection ?? forward) * edge;
			const endpoint = castTransform(pose);
			node.style.transform = endpoint;
			node.style.opacity = actor.leaving ? '0' : '1';
			const reflection = reflections.get(actor.p.id);
			if (reflection) {
				reflection.style.transform = endpoint;
				reflection.style.opacity = node.style.opacity;
			}
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
			if (reflection)
				reflectionAnimations.set(
					actor.p.id,
					reflection.animate(frames, animation.effect!.getTiming())
				);
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
		style:transform="translate({cameraOffset.x}px, {cameraOffset.y}px) scale({zoom})"
		style:transform-origin="{cameraX ?? width / 2}px calc(100% - {cameraRise}px)"
	>
		{#each actors as actor (actor.p.id)}
			{@const culled = !!actor.offset && culledOffsets.includes(actor.offset)}
			{@const art = groundedThumb(size, stills.get(actor.p.id), ui.dpr)}
			<div
				{@attach registerReflection(actor.p.id)}
				class="cast-reflection-actor"
				aria-hidden="true"
				style:visibility={culled ? 'hidden' : undefined}
				style:width="{size}px"
				style:margin-left="{-size / 2}px"
			>
				<div
					class="cast-art"
					style:width="{size}px"
					style:transform="translate({art.x}px, {art.y}px) scale({art.scale})"
				>
					<CastReflection
						id={actor.p.id}
						{size}
						floorY={castPose(actor.offset, width, size, span).y}
						horizon={floorHorizon}
						focal={floorFocal}
					/>
				</div>
			</div>
			<button
				{@attach register(actor.p.id)}
				class="cast-character carousel-character"
				class:chosen={!actor.offset && !actor.leaving}
				data-character-id={actor.p.id}
				inert={actor.leaving || culled}
				aria-hidden={actor.leaving || culled ? 'true' : undefined}
				style:visibility={culled ? 'hidden' : undefined}
				aria-label={actor.offset ? `Select ${actor.p.name}` : `Customize ${name}`}
				style:width="{art.r - art.l}px"
				style:height="{Math.max(0, -art.t)}px"
				style:margin-left="{art.l}px"
				style:transform-origin="{-art.l}px 100%"
				onpointerdown={() => {
					pressed = { id: actor.p.id, activate: !actor.offset };
				}}
				onpointercancel={() => {
					pressed = null;
				}}
				onclick={(event) => clicked(event, actor)}
			>
				<div
					class="cast-art"
					style:width="{size}px"
					style:left="{-size / 2 - art.l}px"
					style:transform="translate({art.x}px, {art.y}px) scale({art.scale})"
				>
					<CharacterThumb id={actor.p.id} name={actor.p.name} {size} />
				</div>
			</button>
		{/each}
	</div>
</div>

<style>
	.cast-camera {
		position: absolute;
		inset: 0;
	}
	.cast-art {
		position: absolute;
		bottom: 0;
		transform-origin: 50% 100%;
		pointer-events: none;
	}

	.cast-character.carousel-character,
	.cast-reflection-actor {
		position: absolute;
		left: 50%;
		bottom: 0;
		max-width: none;
		margin-bottom: 0;
		transform-origin: 50% 100%;
	}
	button.carousel-character {
		z-index: 1;
	}
	.cast-reflection-actor {
		z-index: 0;
		pointer-events: none;
	}
</style>
