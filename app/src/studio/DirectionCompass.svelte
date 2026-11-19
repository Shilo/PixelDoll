<script lang="ts">
	import MirrorViews from '@lucide/svelte/icons/triangles-centerline-dashed-vertical';
	import { directionLabel } from '../lib/rig/directions.ts';
	import { mirrorPartner } from '../lib/rig/mirror.ts';
	import type { DirectionName } from '../lib/rig/rig.ts';
	import { ANGLES, COMPASS, DIRECTION_LABELS, type Mirrors } from './characterConfig.ts';
	import { ArrowUp, Check, PersonStanding } from './icons.ts';

	let {
		label,
		describedBy,
		selected,
		available = COMPASS,
		mirrors = {},
		mirrorSources = COMPASS,
		disabled = false,
		shortLabels = false,
		compact = false,
		ontoggle,
		onmirror
	}: {
		label: string;
		describedBy?: string;
		selected: DirectionName[];
		available?: readonly (DirectionName | null)[];
		mirrors?: Mirrors;
		mirrorSources?: readonly (DirectionName | null)[];
		disabled?: boolean;
		shortLabels?: boolean;
		compact?: boolean;
		ontoggle: (dir: DirectionName) => void;
		onmirror?: (dir: DirectionName) => void;
	} = $props();
</script>

<div
	class={['compass', { 'with-mirrors': !!onmirror, compact }]}
	role="group"
	aria-label={label}
	aria-describedby={describedBy}
>
	{#each COMPASS as dir (dir ?? 'center')}
		{#if dir && available.includes(dir)}
			{@const west = dir.includes('west')}
			{@const opposite = mirrorPartner(dir)}
			{@const partner = onmirror && opposite && mirrorSources.includes(opposite) ? opposite : null}
			{@const source = mirrors[dir]}
			{@const name = shortLabels ? DIRECTION_LABELS[dir] : directionLabel(dir)}
			{@const description = `${name} direction${!onmirror && source ? ` · Mirrors ${directionLabel(source)}` : ''}`}
			{#snippet mirrorButton()}
				{#if onmirror && partner}<button
						type="button"
						class="mirror bu-action"
						data-variant="field"
						aria-label={shortLabels
							? `Mirror ${name}`
							: `Mirror ${name} from ${directionLabel(partner)}`}
						title="Mirror {name} from {directionLabel(partner)}"
						aria-pressed={!!source}
						{disabled}
						onclick={() => onmirror?.(dir)}><MirrorViews size={15} /></button
					>{/if}
			{/snippet}
			<div
				class={[
					'direction-tile bu-joined',
					{ west: west && !!partner, east: !west && !!partner, unpaired: !!opposite && !partner }
				]}
			>
				{#if west}{@render mirrorButton()}{/if}
				<button
					type="button"
					class="direction bu-action"
					data-variant="field"
					aria-label={description}
					title={description}
					aria-pressed={selected.includes(dir)}
					{disabled}
					onclick={() => ontoggle(dir)}
				>
					<ArrowUp size={18} style="transform:rotate({ANGLES[dir]}deg)" />
					<span>
						{DIRECTION_LABELS[dir]}{#if compact && selected.includes(dir)}<Check
								size={11}
								aria-hidden="true"
							/>{/if}{#if !onmirror && source}<MirrorViews size={12} />{/if}
					</span>
				</button>
				{#if !west}{@render mirrorButton()}{/if}
			</div>
		{:else if dir}<span aria-hidden="true"></span>
		{:else}<span class="compass-center" aria-hidden="true"><PersonStanding size={23} /></span>{/if}
	{/each}
</div>

<style>
	.compass {
		--mirror-width: 0px;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 56px));
		gap: 6px;
		width: max-content;
		max-width: 100%;
		margin-top: 4px;
	}
	.with-mirrors {
		--mirror-width: 29px;
		grid-template-columns: minmax(0, calc(56px + var(--mirror-width))) minmax(0, 56px) minmax(
				0,
				calc(56px + var(--mirror-width))
			);
	}
	.direction-tile {
		display: flex;
		height: 54px;
		min-width: 0;
	}
	.with-mirrors .unpaired {
		width: min(56px, 100%);
	}
	.with-mirrors .unpaired:nth-child(3n + 1) {
		justify-self: end;
	}
	.direction,
	.mirror,
	.direction span {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 3px;
	}
	.direction,
	.mirror {
		padding: 0;
		font: inherit;
	}
	.direction {
		flex: 1;
		min-width: 0;
		flex-direction: column;
		font-size: 10px;
	}
	.mirror {
		flex: 0 0 var(--mirror-width);
	}
	@media (pointer: coarse), (max-width: 599px), (max-height: 499px) {
		.with-mirrors {
			--mirror-width: 44px;
		}
	}
	@media (max-width: 599px), (max-height: 499px) {
		.direction-tile {
			height: 56px;
		}
	}
	.compact:not(.with-mirrors) {
		grid-template-columns: repeat(3, 44px);
		gap: 4px;
		margin-top: 0;
	}
	.compact:not(.with-mirrors) .direction-tile {
		height: 44px;
	}
	.west .direction {
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
	}
	.west .mirror {
		border-right: 0;
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
	}
	.east .direction {
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
	}
	.east .mirror {
		border-left: 0;
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
	}
	.compass-center {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-3);
		opacity: 0.55;
	}
</style>
