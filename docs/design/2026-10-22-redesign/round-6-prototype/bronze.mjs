// Apply only reusable package recipes; the prototype owns screen geometry.
export function applyBronze(root) {
    for (const button of root.querySelectorAll('.primary')) {
        button.classList.add('bu-btn');
        button.dataset.variant = 'primary';
    }
    for (const field of root.querySelectorAll('input:not([type=checkbox]):not([type=range]), textarea, .creator select'))
        field.classList.add('bu-input');
    for (const select of root.querySelectorAll('select'))
        select.classList.add('bu-select');
    for (const surface of root.querySelectorAll('.popover, .playback'))
        surface.classList.add('bu-floating');
}
