<script lang="ts">
	import {
		Backpack,
		Crown,
		Footprints,
		Glasses,
		PersonStanding,
		Scissors,
		Shield,
		Shirt,
		Sword
	} from './icons.ts';
	let { group, size = 16 }: { group: string; size?: number } = $props();
	const I = $derived(
		{
			Head: Crown,
			Hair: Scissors,
			Face: Glasses,
			Body: Shirt,
			Legs: PersonStanding,
			Feet: Footprints,
			Back: Backpack,
			'Main hand': Sword,
			'Off hand': Shield
		}[group] ?? Shirt
	);
</script>

<I {size} aria-hidden="true" />
