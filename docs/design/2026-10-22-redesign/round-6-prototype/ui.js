import icons from '../round-5-mockups/assets/lucide.json';
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function icon(name) {
    const id = name === 'circle-help' ? 'circle-question-mark' : name;
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons.icons[id]?.body ?? ''}</svg>`;
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
export const field = (label, key, value, type = 'text', extra = '') => `<label>${esc(label)}<input data-draft="${esc(key)}" type="${esc(type)}" value="${esc(value)}" ${extra}></label>`;
// Native mode buttons styled as tabs. Arrow keys remain the scene's facing input;
// do not claim ARIA tablist semantics without a separate tab keyboard controller.
export function tabs(items, selected, { cls, label, action }) {
    const controls = items.map(([id, text]) => id === null
        ? '<span class="placeholder"></span>'
        : button(esc(text), action + ':' + id, { pressed: selected === id }));
    return `<nav class="${esc(cls)}" aria-label="${esc(label)}">${controls.join('')}</nav>`;
}
