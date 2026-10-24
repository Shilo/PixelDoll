import icons from '../round-5-mockups/assets/lucide.json';
// Lucide github via better-icons; ISC license, matching the shared icon set.
const supplementalIcons = { github: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5c.08-1.25-.27-2.48-1-3.5c.28-1.15.28-2.35 0-3.5c0 0-1 0-3 1.5c-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5c-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4M9 18c-4.51 2-5-2-7-2"/>' };
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function icon(name) {
    const id = name === 'circle-help' ? 'circle-question-mark' : name;
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons.icons[id]?.body ?? supplementalIcons[id] ?? ''}</svg>`;
}
// label and extra contain trusted component markup; dynamic text must use esc().
export function button(label, action, options = {}) {
    const { cls = '', icon: iconName = '', pressed, disabled = false, title = '', extra = '' } = options;
    return `<button type="button" class="${esc(cls)}" data-action="${esc(action)}"
    ${pressed === undefined ? '' : `aria-pressed="${pressed}"`}
    ${disabled ? 'disabled' : ''} ${title ? `title="${esc(title)}"` : ''} ${extra}>
    ${iconName ? icon(iconName) : ''}${label}</button>`;
}
export const iconButton = (label, action, name) => button('', action, {
    cls: 'icon', icon: name, title: label, extra: `aria-label="${esc(label)}"`,
});
// Anchor a floating menu to its real trigger; flip above when space is short.
export function positionPopover(menu, trigger, navigation) {
    if (!menu || !trigger) return;
    const margin = 12, gap = 8, anchor = trigger.getBoundingClientRect();
    menu.style.maxHeight = `${innerHeight - margin * 2}px`;
    const box = menu.getBoundingClientRect();
    const below = anchor.bottom + gap, belowSpace = innerHeight - below - margin;
    const above = anchor.top - gap - box.height, nav = navigation?.getBoundingClientRect();
    const coversNavigation = nav && above < nav.bottom && above + box.height > nav.top;
    // Keep panel navigation reachable. On short phones a scrollable menu below
    // its trigger is preferable to hiding every tab underneath a flipped menu.
    const preferredTop = belowSpace >= box.height ? below
        : above >= margin && !coversNavigation ? above
        : belowSpace >= 64 ? below
        : Math.max(margin, (nav?.top ?? anchor.top) - gap - box.height);
    const top = Math.max(margin, Math.min(preferredTop, innerHeight - margin - 64));
    menu.style.left = `${Math.max(margin, Math.min(anchor.right - box.width, innerWidth - box.width - margin))}px`;
    menu.style.right = 'auto';
    menu.style.setProperty('--popover-top', `${top}px`);
    menu.style.maxHeight = `${innerHeight - top - margin}px`;
}
export const field = (label, key, value, type = 'text', extra = '') => `<label>${esc(label)}<input data-draft="${esc(key)}" type="${esc(type)}" value="${esc(value)}" ${extra}></label>`;
// Native mode buttons styled as tabs. Arrow keys remain the scene's facing input;
// do not claim ARIA tablist semantics without a separate tab keyboard controller.
export function tabs(items, selected, { cls, label, action }) {
    const controls = items.map(([id, text]) => id === null
        ? '<span class="placeholder"></span>'
        : button(esc(text), action + ':' + id, { pressed: selected === id }));
    return `<nav class="${esc(cls)}" aria-label="${esc(label)}">${controls.join('')}</nav>`;
}
