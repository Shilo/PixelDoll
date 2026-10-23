// Review-only variants; the app's only appearance preference remains Light/Dark.
const requested = new URLSearchParams(location.search).get('material');
export const material = ['baseline', 'rounded'].includes(requested) ? requested : 'restrained';
export const hasGlass = material !== 'baseline';
document.documentElement.dataset.material = material;

// Shared adapter, applied once per rendered surface. No observer or extra framework.
export function applyMaterial(root) {
    if (!hasGlass) return;
    const components = [
        ['.primary', 'glass-btn glass-btn--primary'],
        ['input:not([type=checkbox]):not([type=range])', 'glass-input'],
        ['textarea', 'glass-textarea'],
        ['.popover', 'glass-popover is-open'],
        ['.playback', 'glass-surface'],
    ];
    if (material === 'rounded') components.push(['.view-tabs', 'glass-segmented glass-surface'], ['.view-tabs button', 'glass-segmented__item']);
    for (const [selector, classes] of components)
        for (const node of root.querySelectorAll(selector)) node.classList.add(...classes.split(' '));
}
