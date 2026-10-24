// Stable identities keep keyboard focus through this prototype's string renders.
// Production Svelte components should preserve their actual DOM nodes instead.
const keys = ['data-action', 'data-field', 'data-draft', 'href'];
export function focusIdentity(element, root) {
    if (!element || !root.contains(element)) return null;
    for (const key of keys) {
        const value = element.getAttribute(key);
        if (value !== null) {
            const selector = `[${key}="${CSS.escape(value)}"]`;
            return { selector, index: [...root.querySelectorAll(selector)].indexOf(element) };
        }
    }
    return null;
}
export function restoreFocus(identity, root, fallback) {
    const matches = identity ? [...root.querySelectorAll(identity.selector)] : [];
    const candidate = matches[identity?.index] ?? matches[0];
    const target = candidate?.checkVisibility() && !candidate.disabled ? candidate : fallback;
    target?.focus({ preventScroll: true });
}
