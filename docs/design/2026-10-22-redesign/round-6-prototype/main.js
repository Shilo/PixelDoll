import { esc, icon, button, iconButton, tabs, positionPopover } from './ui.js';
import { applyBronze } from './bronze.mjs';
import { createDraft, renderCreator, exactPrompt, basePrompt, autoFrame } from './creator.js';
import { applyTheme, themeName } from './theme.mjs';
import { direction, labelDir, DIRECTION_PRESETS, facingFromVector } from './directions.mjs';
import { MOVEMENT_KEYS, keyboardVector } from './input.mjs';
import { loadDemo } from './assets.js';
import { renderEquipment, EQUIPMENT_SLOTS } from './equipment.js';
import { World } from './world.js';
import { measureStage } from './stage-layout.mjs';
import { MOTION, REFLECTION } from './config.js';
import { unit, resolveMotion, resolvePreview, clipLabel, frameAt, advance } from './motion.mjs';
const $ = s => document.querySelector(s), ui = $('#ui'), dialog = $('#dialog'), stick = $('#joystick');
const state = { screen: 'selection', view: 'preview', theme: themeName(localStorage.getItem('bronze-prototype-theme')), character: 0, slot: 'head', panel: 'Wardrobe', menu: null, clip: 'walk', direction: 'south', playing: true, expanded: false, hint: false, search: '' };
applyTheme(state.theme);
$('#toast').className = 'bu-floating';
const position = { x: 0, y: 0 }, camera = { x: 0, y: 0 }, keys = new Set(), seenIssues = new Set();
let joystick = null, toastTimer, toastKey = '', hintTimer, elapsed = 0, last = 0, presentationKey = '', resolved = {}, lastHidden = '', drawnFrames = 0, world, demo, characters, hiddenItems = [], lastFacing = 'south';
const draft = createDraft();
const prompt = () => exactPrompt(draft);
let manualPrompt = '';
let dialogReturnAction = null;
function notify(message, key = message) { if (seenIssues.has(key))
    return; seenIssues.add(key); toastKey = key; const toast = $('#toast'); toast.textContent = message; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.hidden = true, 4800); }
function stop() { keys.clear(); joystick = null; stick.hidden = true; }
function showDialog(title, html) {
    dialogReturnAction = document.activeElement?.dataset.action ?? null;
    stop(); state.menu = null; render();
    const content = `${iconButton('Close', 'close-dialog', 'x')}<h2 id="dialog-title">${esc(title)}</h2>${html}`;
    dialog.innerHTML = `<div class="bu-dialog-surface dialog-panel">${content}</div>`;
    dialog.className = 'bronze-dialog-overlay';
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    dialog.querySelector('button').classList.add('close'); applyBronze(dialog); dialog.showModal();
}
function unavailable(title) { showDialog(title, '<p>This isolated prototype uses the bundled demo artwork. Generation, import, export and account actions are not connected.</p><p>You can switch characters, change demo equipment, inspect animations and move through both test views. No API calls or credits are used.</p>'); }
function current() { return characters[state.character]; }
function changeScreen(screen) { stop(); $('#toast').hidden = true; state.screen = screen; state.menu = null; state.expanded = false; elapsed = 0; presentationKey = ''; if (screen === 'studio')
    state.view = 'preview'; render(); world.backdrop(state); }
function changeView(view) { stop(); $('#toast').hidden = true; state.view = view; state.menu = null; state.panel = state.panel === 'Moves' && view !== 'preview' ? 'Wardrobe' : state.panel; position.x = position.y = camera.x = camera.y = 0; elapsed = 0; presentationKey = ''; lastFacing = view === 'side' ? 'east' : state.direction; state.hint = view !== 'preview'; clearTimeout(hintTimer); hintTimer = setTimeout(() => { state.hint = false; render(); }, 6500); render(); world.backdrop(state); }
function changeCharacter(index) {
    // Keep the clicked row under the pointer across selection rerenders. Without
    // this, a second click can hit a different row in a scrolled landscape list.
    const scroll = state.screen === 'selection'
        ? ['.library', '.library .character-list'].map(selector => [selector, ui.querySelector(selector)?.scrollTop ?? 0]) : [];
    stop(); $('#toast').hidden = true; state.character = index; lastFacing = 'south';
    state.direction = 'south'; state.menu = null;
    position.x = position.y = camera.x = camera.y = 0;
    elapsed = 0; presentationKey = ''; lastHidden = ''; render();
    for (const [selector, top] of scroll) { const element = ui.querySelector(selector); if (element) element.scrollTop = top; }
}
function activateCharacter(index) {
    if (state.screen === 'selection' && index === state.character) changeScreen('studio');
    else changeCharacter(index);
}
function top() { const select = state.screen === 'selection', create = state.screen === 'creation'; return `<header>${button(select ? 'PixelDoll' : 'Characters', select ? 'home' : 'back', { icon: select ? 'person-standing' : 'arrow-left' })}<div class="top-actions">${create ? button('Cancel', 'back') : select ? `${button('<span class="label">Import</span>', 'import', { icon: 'upload', cls: 'desktop-only', title: 'Import (not connected in prototype)' })}${button('<span class="label">New character</span>', 'create', { icon: 'plus', cls: 'outline desktop-only', title: 'New character' })}${iconButton('More options', 'more', 'ellipsis')}` : `${button('<span class="label">Undo</span>', 'undo', { icon: 'undo-2', cls: 'desktop-only', disabled: !current().history.length, title: 'Undo equipment change' })}${button('<span class="label">Export</span>', 'export', { icon: 'download', title: 'Export (not connected in prototype)' })}${iconButton('More options', 'more', 'ellipsis')}`}</div></header>`; }
const STUDIO_VIEWS = [['preview', 'Preview'], ['topdown', 'Top-down'], ['side', 'Side-scroller']];
function viewTabs() { return tabs(STUDIO_VIEWS, state.view, { cls: 'view-tabs', label: 'Character view', action: 'view' }); }
function identity() { return `<section class="identity"><p class="eyebrow">Customize character</p><h1>${button(esc(current().name) + icon('chevron-down'), 'characters', { cls: 'name-switch', extra: 'aria-label="Switch character" aria-expanded="' + (state.menu === 'characters') + '"' })}</h1>${button(`<span>${esc(current().prompt)}</span>${icon('chevron-down')}`, 'description', { cls: 'prompt-line', title: 'Read character prompt', extra: `aria-expanded="${state.menu === 'description'}"` })}</section>`; }
function selected() { return `<div class="selected-name"><h2>${esc(current().name)}</h2><div class="stage-nav">${iconButton('Previous character', 'previous', 'chevron-left')}<small>Demo outfit · ${state.character + 1} / ${characters.length}</small>${iconButton('Next character', 'next', 'chevron-right')}</div></div>`; }
function library() { return `<section class="identity"><h1>Characters</h1><p class="muted" style="margin-top:10px;font-size:13px">${characters.length} demo outfits</p></section><div class="mobile-library-actions"><input class="search" data-field="search" placeholder="Search characters" aria-label="Search characters" value="${esc(state.search)}">${button('New', 'create', { cls: 'outline', icon: 'plus' })}${button('Import', 'import', { cls: 'outline' })}</div><aside class="library" data-ui><h2>Your characters</h2><input class="search" data-field="search" placeholder="Search characters" aria-label="Search characters" value="${esc(state.search)}"><div class="character-list">${characterButtons()}</div>${button('Customize ' + esc(current().name), 'customize', { cls: 'primary', icon: 'arrow-right' })}</aside>${selected()}`; }
const characterThumbs = new WeakMap();
function characterThumbnail(c) { const canvas = demo.sprite(c.items, 'walk', 'south', 0).canvas; if (!characterThumbs.has(canvas))
    characterThumbs.set(canvas, canvas.toDataURL()); return characterThumbs.get(canvas); }
function characterButtons() { const filtered = characters.map((c, i) => ({ c, i })).filter(({ c }) => c.name.toLowerCase().includes(state.search.toLowerCase())); return filtered.length ? filtered.map(({ c, i }) => button(`<img class="character-thumb" src="${characterThumbnail(c)}" alt=""><span class="character-copy"><span>${esc(c.name)}</span><small>Demo outfit</small></span>`, 'character:' + i, { cls: 'character-row', pressed: i === state.character })).join('') : '<p class="muted">No matching demo outfits.</p>'; }
function equipmentCoverage() { return hiddenItems.length ? hiddenItems.map(i => i.name).join(', ') + ' hidden — missing ' + (resolved.clip ?? '') + ' / ' + (resolved.dir ?? '') + ' frames' : ''; }
function coverageText() { const preview = state.view === 'preview' && state.screen === 'studio' ? previewPresentation() : null; return [preview?.missing ? `${labelDir[state.direction]} ${clipLabel(state.clip)} unavailable — ${preview.clip ? 'showing a still pose' : 'no artwork for this facing'}.` : '', equipmentCoverage()].filter(Boolean).join(' '); }
const previewPresentation = () => resolvePreview({ clip: state.clip, dir: state.direction, available: demo.available, still: demo.still });
function wardrobe() { return renderEquipment({ state, demo, character: current(), characters, coverage: coverageText() }); }
function playback() { const presentation = previewPresentation(); return `<div class="playback" data-ui aria-label="Animation playback">${presentation.missing ? button('Still', 'play', { disabled: true, title: 'The selected animation has no frames for this facing' }) : iconButton(state.playing ? 'Pause animation' : 'Play animation', 'play', state.playing ? 'pause' : 'play')}<select data-field="clip" aria-label="Animation">${demo.m.rig.animations.map(a => `<option value="${a.id}" ${state.clip === a.id ? 'selected' : ''}>${clipLabel(a.id)}</option>`).join('')}</select>${demo.dirs.map(d => button(direction(d)?.short ?? d, 'direction:' + d, { cls: 'dir', pressed: state.direction === d, title: labelDir[d], extra: `aria-label="Face ${esc(labelDir[d] ?? d)}"` })).join('')}${iconButton('Animation details', 'animation-info', 'settings-2')}</div>`; }
function menus() {
    if (state.menu === 'more')
        return `<div class="popover" data-ui>${button(state.theme === 'obsidian' ? 'Light mode' : 'Dark mode', 'theme:' + (state.theme === 'obsidian' ? 'porcelain' : 'obsidian'), { icon: state.theme === 'obsidian' ? 'sun' : 'moon', cls: 'theme-toggle' })}<div class="divider"></div><a href="https://github.com/Shilo/PixelDoll" target="_blank" rel="noopener" class="menu-link">${icon('github')}<span>GitHub</span>${icon('external-link')}</a>${button('About this prototype', 'about', { icon: 'circle-help' })}</div>`;
    if (state.menu === 'characters')
        return `<div class="popover character-popover" data-ui><small>Switch character</small>${characterButtons()}</div>`;
    if (state.menu === 'description')
        return `<section class="popover description" data-ui aria-label="Character prompt"><div class="popover-head"><h2>Character prompt</h2>${iconButton('Close prompt', 'dismiss', 'x')}</div><p>${esc(current().prompt)}</p>${button('Copy prompt', 'copy-description', { icon: 'copy' })}<small>Walk available. Idle absent; live views use a still frame.</small></section>`;
    if (state.menu === 'parts')
        return `<div class="popover parts-popover" data-ui><small>Additional equipment</small>${EQUIPMENT_SLOTS.filter(s => !s.tab).map(s => [s.id, s.label]).map(([id, n]) => button(n, 'slot:' + id, { pressed: state.slot === id })).join('')}</div>`;
    return '';
}
function positionPartsMenu() { positionPopover(ui.querySelector('.parts-popover'), ui.querySelector('[data-action="slot:all"]'), ui.querySelector('.mode-tabs')); }
function render() { if (!demo)
    return; applyTheme(state.theme); document.body.dataset.screen = state.screen; document.body.dataset.view = state.view; ui.innerHTML = top() + (state.screen === 'selection' ? library() : state.screen === 'creation' ? renderCreator(draft, manualPrompt) : viewTabs() + identity() + wardrobe() + (state.view === 'preview' ? playback() : state.hint ? `<p class="hint">${matchMedia('(pointer:coarse)').matches ? 'Drag in the world to move' : 'WASD / arrow keys to move'}</p>` : '')) + menus() + `<p class="footnote">${state.screen === 'creation' ? '' : 'Local visual prototype · demo artwork'}</p>`; applyBronze(ui); measureStage(state.screen, ui); positionPartsMenu(); }
function applyOutfit(items) { current().history.push({ ...current().items }); current().items = { ...items }; lastHidden = ''; render(); }
function equip(id) { applyOutfit({ ...current().items, [state.slot]: id === 'none' ? null : id }); }
function chooseClip(clip) { state.clip = clip; elapsed = 0; presentationKey = ''; render(); }
function setFacing(dir) { if (!demo.dirs.includes(dir) || state.direction === dir)
    return; state.direction = dir; render(); }
function previewFacing() { if (demo && state.screen === 'studio' && state.view === 'preview' && !dialog.open && !state.menu)
    setFacing(facingFromVector(demo.dirs, keyboardVector(keys), state.direction)); }
async function action(action) {
    const [name, value] = action.split(':');
    if (name === 'close-dialog') {
        dialog.close();
        return;
    }
    if (name === 'home' || name === 'back') {
        changeScreen('selection');
        return;
    }
    if (name === 'customize') {
        changeScreen('studio');
        return;
    }
    if (name === 'create') {
        changeScreen('creation');
        return;
    }
    if (name === 'view') {
        changeView(value);
        return;
    }
    if (name === 'theme') {
        state.theme = themeName(value);
        $('#toast').hidden = true;
        localStorage.setItem('bronze-prototype-theme', value);
        state.menu = null;
        stop();
        render();
        await world.backdrop(state);
        return;
    }
    if (name === 'character') {
        activateCharacter(+value);
        return;
    }
    if (name === 'previous' || name === 'next') {
        changeCharacter((state.character + (name === 'next' ? 1 : characters.length - 1)) % characters.length);
        return;
    }
    if (['more', 'characters', 'description'].includes(name)) {
        stop();
        state.menu = state.menu === name ? null : name;
        render();
        return;
    }
    if (name === 'dismiss') {
        state.menu = null;
        stop();
        render();
        return;
    }
    if (name === 'slot') {
        state.menu = value === 'all' ? 'parts' : null;
        if (value !== 'all')
            state.slot = value;
        render();
        return;
    }
    if (name === 'panel') {
        state.menu = null;
        state.panel = value;
        render();
        return;
    }
    if (name === 'expand') {
        state.expanded = !state.expanded;
        stop();
        render();
        return;
    }
    if (name === 'equip') {
        equip(value);
        return;
    }
    if (name === 'outfit') {
        applyOutfit(characters[+value].original);
        return;
    }
    if (name === 'undo') {
        const prev = current().history.pop();
        if (prev)
            current().items = prev;
        lastHidden = '';
        render();
        return;
    }
    if (name === 'play') {
        state.playing = !state.playing;
        render();
        return;
    }
    if (name === 'clip') {
        chooseClip(value);
        return;
    }
    if (name === 'direction') {
        setFacing(value);
        return;
    }
    if (name === 'copy-description' || name === 'copy-draft') {
        try {
            await navigator.clipboard.writeText(name === 'copy-description' ? current().prompt : manualPrompt || prompt());
            notify('Prompt copied', 'copy:' + Date.now());
        }
        catch {
            notify('Select the prompt text to copy it.', 'copy-failed');
        }
        return;
    }
    if (name === 'editor') {
        if (value === 'Prompt')
            manualPrompt = prompt();
        else if (manualPrompt) {
            for (const k of ['kind', 'build', 'proportions', 'skin']) {
                const m = manualPrompt.match(new RegExp('^' + k + ': (.+)$', 'im'));
                draft[k] = m ? m[1] : 'Not set';
            }
            draft.details = manualPrompt.split('\n').filter(l => !/^Kind:|^Build:|^Proportions:|^Skin:/.test(l) && l !== basePrompt).join('\n');
        }
        draft.editor = value;
        render();
        return;
    }
    if (name === 'size') {
        draft.size = +value;
        if (draft.auto)
            draft.frame = autoFrame(draft.size);
        render();
        return;
    }
    if (name === 'auto') {
        draft.auto = !draft.auto;
        if (draft.auto)
            draft.frame = autoFrame(draft.size);
        render();
        return;
    }
    if (name === 'preset') {
        const preset = DIRECTION_PRESETS[+value];
        if (!preset)
            return;
        draft.directions = [...preset.dirs];
        draft.mirrors = preset.unique ? [] : draft.directions.filter(d => d.includes('west'));
        render();
        return;
    }
    if (name === 'draft-direction' || name === 'mirror') {
        const key = name === 'mirror' ? 'mirrors' : 'directions';
        draft[key] = draft[key].includes(value) ? draft[key].filter(d => d !== value) : [...draft[key], value];
        render();
        return;
    }
    if (name === 'animation-info') {
        showDialog('Animation details', '<p>Walk: 8 frames at 100 ms each, four directions. Cross-punch: 6 frames at 100 ms each, south only.</p><p>The demo has no Idle animation. Live modes hold a real Walk frame when stopped. Missing equipment stays equipped and returns when compatible.</p>');
        return;
    }
    if (name === 'about') {
        showDialog('Bronze visual prototype', '<p>Test the approved interface with original demo sprites. Use WASD or arrow keys in Top-down and Side-scroller; on touch screens, drag in any open area of the world.</p><p>Equipment changes work while moving. Characters are separate demo outfit copies. Creation is an editable visual draft; paid generation and project storage are disconnected.</p><p>Reflections and per-screen backgrounds are configured in <code>config.js</code>. This prototype does not modify your saved PixelDoll projects.</p>');
        return;
    }
    if (name === 'creator-help') {
        showDialog('Create character', '<p>Appearance and Prompt edit the same draft. Body size uses 4 px increments; the frame adds space around it. Direction buttons select views; the attached controls mirror paired views.</p><p>This screen tests layout and navigation only. Generation, enhancement, pricing and saving are not connected.</p>');
        return;
    }
    unavailable({ 'import': 'Import character', 'export': 'Export character', 'new-item': 'Create equipment', 'saved-design': 'Saved equipment designs', 'palette': 'Equipment palette', 'api-info': 'API details' }[name] ?? 'Prototype scope');
}
// Browsers do not consistently synthesize click for a non-primary touch. A second finger
// can operate equipment while the first owns movement; scroll/drag gestures are not taps.
const secondaryTouches = new Map();
let consumedTouch = null;
document.addEventListener('pointerdown', e => { const b = e.target.closest('[data-action]'); if (joystick && e.pointerType === 'touch' && !e.isPrimary && b && !b.disabled)
    secondaryTouches.set(e.pointerId, { button: b, x: e.clientX, y: e.clientY }); });
document.addEventListener('pointerup', e => { const touch = secondaryTouches.get(e.pointerId); secondaryTouches.delete(e.pointerId); if (!touch)
    return; const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-action]'); if (under !== touch.button || Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > 8)
    return; e.preventDefault(); consumedTouch = { x: e.clientX, y: e.clientY, until: performance.now() + 500 }; action(touch.button.dataset.action); });
document.addEventListener('pointercancel', e => secondaryTouches.delete(e.pointerId));
document.addEventListener('click', e => { if (consumedTouch && performance.now() < consumedTouch.until && Math.hypot(e.clientX - consumedTouch.x, e.clientY - consumedTouch.y) < 8) {
    consumedTouch = null;
    return;
} const b = e.target.closest('[data-action]'); if (b && !b.disabled) {
    action(b.dataset.action);
    return;
} if (state.menu && !e.target.closest('.popover') && !e.target.closest('.name-switch,.prompt-line')) {
    stop();
    state.menu = null;
    render();
} });
document.addEventListener('input', e => { const el = e.target; if (el.dataset.field === 'search') {
    state.search = el.value;
    const list = $('.character-list');
    if (list)
        list.innerHTML = characterButtons();
    return;
} if (el.dataset.draft) {
    const k = el.dataset.draft;
    if (k === 'exact')
        manualPrompt = el.value;
    else {
        draft[k] = ['size', 'frame'].includes(k) ? +el.value : el.value;
        if (k === 'size' && draft.auto) {
            draft.frame = autoFrame(draft.size);
            const input = $('[data-draft=frame]');
            if (input)
                input.value = draft.frame;
        }
        const exact = $('#exact-excerpt');
        if (exact)
            exact.textContent = prompt();
        document.querySelectorAll('[data-guide]').forEach(n => n.textContent = n.dataset.guide === 'size' ? draft.size + ' px' : draft.frame + ' × ' + draft.frame + ' px');
    }
} });
document.addEventListener('change', e => { if (e.target.dataset.field === 'clip') {
    chooseClip(e.target.value);
    ui.querySelector('[data-field=clip]')?.focus({ preventScroll: true });
} });
dialog.addEventListener('close', () => {
    stop();
    if (dialogReturnAction) ui.querySelector(`[data-action="${CSS.escape(dialogReturnAction)}"]`)?.focus({ preventScroll: true });
    dialogReturnAction = null;
});
const editTarget = el => el?.closest('input,textarea,select,[contenteditable=true]');
window.addEventListener('keydown', e => {
    if (!demo || e.ctrlKey || e.altKey || e.metaKey)
        return;
    const k = e.key.toLowerCase();
    // A native select owns Escape; dismissing its picker must not leave the screen.
    if (k === 'escape' && e.target.closest('select')) return;
    if (k === 'escape' || (k === 'backspace' && !editTarget(e.target))) {
    e.preventDefault();
    if (e.repeat)
        return;
    stop();
    if (dialog.open)
        dialog.close();
    else if (state.menu) {
        state.menu = null;
        render();
    }
    else if (state.screen !== 'selection')
        changeScreen('selection');
    return;
} if (editTarget(e.target) || dialog.open || state.menu)
    return;
if (state.screen === 'studio' && k === 'tab' && (!e.target.closest('button,a,[tabindex]') || e.target.closest('.view-tabs'))) {
    e.preventDefault();
    if (!e.repeat) {
        const index = STUDIO_VIEWS.findIndex(([id]) => id === state.view);
        changeView(STUDIO_VIEWS[(index + (e.shiftKey ? -1 : 1) + STUDIO_VIEWS.length) % STUDIO_VIEWS.length][0]);
    }
    return;
} if (state.screen === 'selection' && (MOVEMENT_KEYS.has(k) || k === 'enter')) {
    e.preventDefault();
    if (!e.repeat) {
        const [horizontal, vertical] = keyboardVector(new Set([k]));
        action(k === 'enter' ? 'customize' : horizontal - vertical < 0 ? 'previous' : 'next');
    }
    return;
} if (state.screen === 'studio' && MOVEMENT_KEYS.has(k)) {
    e.preventDefault();
    if (e.repeat && !keys.has(k))
        return;
    keys.add(k);
    previewFacing();
} });
window.addEventListener('keyup', e => { keys.delete(e.key.toLowerCase()); previewFacing(); });
window.addEventListener('blur', stop);
document.addEventListener('visibilitychange', () => { stop(); last = 0; });
window.addEventListener('resize', () => { stop(); measureStage(state.screen, ui); positionPartsMenu(); world?.backdrop(state); });
ui.addEventListener('scroll', e => { if (e.target.classList.contains('wardrobe-scroll')) positionPartsMenu(); }, true);

document.addEventListener('focusin', e => { if (editTarget(e.target))
    stop(); });
$('#actors').addEventListener('pointerdown', e => { if (dialog.open)
    return; if (state.menu) {
    state.menu = null;
    stop();
    render();
    return;
} if (state.screen === 'selection') {
    const hit = world.hitAreas.findLast(a => e.clientX >= a.x && e.clientX <= a.x + a.w && e.clientY >= a.y && e.clientY <= a.y + a.h);
    if (hit)
        activateCharacter(hit.index);
    return;
} if (state.screen !== 'studio' || state.view === 'preview' || joystick || e.button > 0)
    return; e.preventDefault(); joystick = { id: e.pointerId, x: e.clientX, y: e.clientY, v: [0, 0] }; e.target.setPointerCapture(e.pointerId); stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; stick.firstElementChild.style.transform = ''; stick.hidden = false; });
$('#actors').addEventListener('pointermove', e => { if (!joystick || e.pointerId !== joystick.id)
    return; const dx = e.clientX - joystick.x, dy = state.view === 'side' ? 0 : joystick.y - e.clientY, length = Math.hypot(dx, dy), u = unit(dx, dy), amount = Math.min(1, Math.max(0, (length - MOTION.deadZone) / (MOTION.joystickRadius - MOTION.deadZone))); joystick.v = u.map(v => v * amount); const travel = Math.min(length, MOTION.joystickRadius); stick.firstElementChild.style.transform = `translate(${u[0] * travel}px,${-u[1] * travel}px)`; });
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
    $('#actors').addEventListener(event, e => { if (joystick?.id === e.pointerId)
        stop(); });
$('#actors').addEventListener('contextmenu', e => e.preventDefault());
function velocity() { if (dialog.open || state.menu || state.screen !== 'studio' || state.view === 'preview')
    return [0, 0]; return joystick?.v ?? keyboardVector(keys, state.view === 'side'); }
function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, .05) : 0;
    last = now;
    const live = state.screen === 'studio' && state.view !== 'preview', v = velocity();
    if (live)
        advance(position, camera, v, dt, MOTION.speed, MOTION.cameraResponse);
    if (state.screen === 'studio') {
        resolved = live ? resolveMotion({ velocity: v, dirs: demo.dirs, available: demo.available, previous: lastFacing, still: demo.still }) : previewPresentation();
        if (resolved.dir)
            lastFacing = resolved.dir;
        const key = resolved.clip + ':' + !!resolved.still;
        if (key !== presentationKey) {
            elapsed = 0;
            presentationKey = key;
        }
        else if (live || state.playing)
            elapsed += dt * 1000;
        if (!resolved.still)
            resolved.cell = frameAt(demo.m.rig.animations.find(a => a.id === resolved.clip)?.frames ?? [], elapsed);
        if (live && resolved.issue)
            notify(`${resolved.request === 'idle' ? 'Idle' : 'Walk'} missing — showing ${resolved.still ? 'a still pose' : resolved.clip}`, `${state.character}:${resolved.issue}`);
        if (resolved.clip && resolved.dir) {
            hiddenItems = demo.sprite(current().items, resolved.clip, resolved.dir, resolved.cell).hidden;
            if (!hiddenItems.length && toastKey.includes(':gear:'))
                $('#toast').hidden = true;
            const hiddenKey = hiddenItems.map(i => i.id).join(',') + resolved.clip + resolved.dir;
            if (hiddenKey !== lastHidden) {
                lastHidden = hiddenKey;
                const note = $('#coverage-note');
                if (note) {
                    note.textContent = coverageText();
                    note.hidden = !coverageText();
                }
                if (hiddenItems.length)
                    notify(equipmentCoverage(), `${state.character}:gear:${hiddenKey}`);
            }
        }
    }
    world.draw(state, demo, characters, resolved, camera, position);
    drawnFrames++;
    requestAnimationFrame(tick);
}
async function boot() {
    try {
        world = new World();
        [demo] = await Promise.all([loadDemo(), world.prepare()]);
        demo.thumbs = Object.fromEntries(demo.m.items.filter(i => i.id !== demo.m.rig.baseItem).map(i => [i.id, demo.thumbnail(i)]));
        const original = demo.m.presets[0].items, hat = demo.m.items.find(i => i.slot === 'head' && i.id !== original.head);
        characters = [{ name: 'Adventurer', items: { ...original } }, { name: 'Mira', items: { ...original, head: hat?.id ?? null, main_hand: null } }, { name: 'Rowan', items: { ...original, head: null, back: null, main_hand: null } }].map(c => ({ ...c, original: { ...c.items }, history: [], prompt: 'plain grey t-shirt and plain grey shorts, bald, barefoot (S2 b48, padded to 64)' }));
        render();
        await world.backdrop(state);
        // Read-only diagnostics for offline verification; no production state or credentials.
        window.prototype = { snapshot: () => ({ state: structuredClone(state), position: { ...position }, camera: { ...camera }, resolved: { ...resolved }, hiddenItems: hiddenItems.map(i => i.id), equipped: { ...current().items }, drawnFrames, backgroundLoads: { ...world.loadCounts }, reflection: { ...REFLECTION }, actorBounds: world.actorBounds, selectionActors: world.hitAreas.map(box => ({ ...box })), cacheSize: demo.cache.size, velocity: velocity() }), ready: true };
        requestAnimationFrame(tick);
    }
    catch (error) {
        ui.innerHTML = `<div class="loading" data-ui><h2>Prototype could not load</h2><p>${esc(error.message)}</p></div>`;
        console.error(error);
    }
}
boot();
