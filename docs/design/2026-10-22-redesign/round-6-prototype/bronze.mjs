// Apply only reusable package recipes; the prototype owns screen geometry.
export function applyBronze(root) {
    for (const control of root.querySelectorAll('button,a,input,textarea,select'))
        control.classList.add('bu-focus');
    for (const button of root.querySelectorAll('button:not(.swatch)')) {
        button.classList.add('bu-action');
        const variant = button.matches('.view-tabs button,.mode-tabs button,.editor-tabs button') ? 'tab'
            : button.matches('.primary') ? 'primary'
            : button.matches('.item,.none') ? 'tile'
            : button.matches('.outline') ? 'outline'
            : button.matches('.creator .presets button,.creator .frame-row button,.creator .compass button') ? 'field'
            : button.matches('.character-row') ? 'row'
            : button.matches('.playback .dir') ? 'direction' : null;
        if (variant) button.dataset.variant = variant;
    }
    for (const swatch of root.querySelectorAll('.swatch')) swatch.classList.add('bu-swatch-flat');
    for (const field of root.querySelectorAll('input:not([type=checkbox]):not([type=range]), textarea, .creator select'))
        field.classList.add('bu-input');
    for (const select of root.querySelectorAll('select'))
        select.classList.add('bu-select');
    for (const select of root.querySelectorAll('.playback select')) select.dataset.variant = 'quiet';
    for (const surface of root.querySelectorAll('.popover, .playback'))
        surface.classList.add('bu-floating');
    for (const pair of root.querySelectorAll('.compass>div:has(.mirror)'))
        pair.classList.add('bu-joined');
}
