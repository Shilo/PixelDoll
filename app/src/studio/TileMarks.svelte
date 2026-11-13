<script lang="ts" module>
	import { Ban, Check, Clapperboard, EyeOff, Puzzle, TriangleAlert, UsersRound } from './icons.ts';

	/** What a wardrobe tile's corner icons can say about an item; several can apply at once. */
	export type MarkKind =
		'worn' | 'shared' | 'blocked' | 'unfitted' | 'check' | 'missing' | 'hidden';
	export interface Mark {
		kind: MarkKind;
		/** A few words, for accessible names. */
		label: string;
		/** The full explanation: the icon's tooltip and its line in the ⋮ menu. */
		text: string;
	}
	/** Each kind's icon and Bronze tone; `check` is the theme's worn check mark (accent) rather than a status tone. Red is
	 *  only for the one status that stops the tile wearing the item; amber asks for a look; grey only informs. */
	export const MARK: Record<MarkKind, { icon: typeof Check; tone: string }> = {
		worn: { icon: Check, tone: 'check' },
		shared: { icon: UsersRound, tone: 'hidden' },
		blocked: { icon: Ban, tone: 'danger' },
		unfitted: { icon: Puzzle, tone: 'warning' },
		check: { icon: TriangleAlert, tone: 'warning' },
		missing: { icon: Clapperboard, tone: 'warning' },
		hidden: { icon: EyeOff, tone: 'hidden' }
	};
	/** Left to right: the worn check keeps its corner, then problems worst first, then where the item came from. */
	const ORDER: MarkKind[] = ['worn', 'blocked', 'unfitted', 'check', 'missing', 'hidden', 'shared'];
	export const sortMarks = (marks: (Mark | false | undefined | null | '')[]) =>
		(marks.filter(Boolean) as Mark[]).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
</script>

<script lang="ts">
	let { marks, list = false }: { marks: Mark[]; list?: boolean } = $props();
</script>

{#snippet glyph(mark: Mark, title?: string)}
	{@const Icon = MARK[mark.kind].icon}
	{#if MARK[mark.kind].tone === 'check'}<span class="bu-tile-check" {title}><Icon /></span
		>{:else}<span class="bu-tile-status tile-status" data-tone={MARK[mark.kind].tone} {title}
			><Icon size={14} /></span
		>{/if}
{/snippet}
{#if list}
	<!-- The ⋮ menu explains every icon its tile shows, in the same order. -->
	{#if marks.length}<ul class="item-menu-marks small">
			{#each marks as mark (mark.kind)}<li>{@render glyph(mark)}<span>{mark.text}</span></li>{/each}
		</ul>{/if}
{:else if marks.length}
	<!-- A row in the tile's top-left corner that wraps after three icons and never grows the tile. Each icon's title
	     explains it on hover; a click on one still reaches the tile it sits in. The words are in the tile's accessible
	     name. -->
	<span class="tile-marks" aria-hidden="true"
		>{#each marks as mark (mark.kind)}{@render glyph(mark, mark.text)}{/each}</span
	>
{/if}
