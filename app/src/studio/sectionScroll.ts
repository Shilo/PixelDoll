// Shared by the Wardrobe and Colors lists: which section sits at the top of a list under its sticky header, and how a
// rail's click brings one there. Both rails follow their list with one rule, so they behave the same way.
import { scrollToTop } from '@shilo/bronze-ui/svelte';

/** The viewport y where a list's sticky section header ends: a section reads as current once its top reaches it. */
export function stickyTopOf(list: HTMLElement): number {
	const head = list.querySelector<HTMLElement>('.bu-section-head');
	return list.getBoundingClientRect().top + (head?.offsetHeight ?? 0);
}

/** The key of the last section whose top has reached the sticky header, else `fallback` (the first one shown). */
export function sectionInView(
	list: HTMLElement,
	sections: Iterable<HTMLElement>,
	keyOf: (section: HTMLElement) => string | undefined,
	fallback: string
): string {
	const top = stickyTopOf(list);
	let current = fallback;
	for (const section of sections) {
		const key = keyOf(section);
		if (section.getBoundingClientRect().top <= top && key) current = key;
	}
	return current;
}

/** Bring a section to the top of its list, under the sticky header. The first one goes to the very top so the list can
 *  rest there; everything else lands one pixel past it, which reads as current. Resolves when a smooth scroll ends. */
export function scrollToSection(
	list: HTMLElement,
	section: HTMLElement,
	{ first = false, instant = false } = {}
): Promise<void> {
	if (instant) {
		list.scrollTop = first
			? 0
			: list.scrollTop + section.getBoundingClientRect().top - list.getBoundingClientRect().top + 1;
		return Promise.resolve();
	}
	return scrollToTop(list, section, 1);
}
