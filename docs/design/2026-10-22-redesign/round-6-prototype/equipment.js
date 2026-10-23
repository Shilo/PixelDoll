import { esc, icon, button, iconButton, tabs } from './ui.js';
import { DEMO_EQUIPMENT_PALETTE } from './theme.mjs';
import { clipLabel } from './motion.mjs';
export const EQUIPMENT_SLOTS = [
    { id: 'head', label: 'Headwear', tab: 'Head', icon: 'crown' },
    { id: 'hair', label: 'Hair', tab: 'Hair', icon: 'scissors' },
    { id: 'torso_inner', label: 'Body', tab: 'Body', icon: 'shirt' },
    { id: 'back', label: 'Back' },
    { id: 'main_hand', label: 'Held item' },
];
export function renderEquipment({ state, demo, character, characters, coverage }) {
    function itemPanel() {
        const list = demo.m.items.filter(i => i.slot === state.slot && i.id !== demo.m.rig.baseItem), names = Object.fromEntries(EQUIPMENT_SLOTS.map(s => [s.id, s.label])), thumb = i => demo.thumbs[i.id];
        return `<div class="panel-heading"><h2>${names[state.slot] ?? state.slot}</h2><small>${list.length} ${list.length === 1 ? 'item' : 'items'}</small></div><div class="items">${list.map(i => button(`<img src="${thumb(i)}" alt="">${character.items[state.slot] === i.id ? `<span class="check">${icon('check')}</span>` : ''}<span>${esc(i.name)}</span>`, 'equip:' + i.id, { cls: 'item', pressed: character.items[state.slot] === i.id, title: i.name })).join('')}${button('None', 'equip:none', { cls: 'item none-mobile', icon: 'x', pressed: !character.items[state.slot] })}</div>${button('None', 'equip:none', { cls: 'none', icon: 'x', pressed: !character.items[state.slot] })}<p class="coverage-note" id="coverage-note" ${coverage ? '' : 'hidden'} role="status">${coverage}</p><div class="equipment-tools"><small>Palette</small><div class="palette" aria-label="Palette editing is not connected">${DEMO_EQUIPMENT_PALETTE.map((color, i) => button('', 'palette', { cls: 'swatch', title: 'Palette editing (not connected)', extra: `style="--swatch:${color}" aria-label="Palette swatch ${i + 1}"` })).join('')}</div>${button('New ' + (state.slot === 'head' ? 'head' : state.slot === 'main_hand' ? 'held' : 'equipment') + ' item', 'new-item', { cls: 'primary new-item', icon: 'plus' })}${button('Use a saved design', 'saved-design', { cls: 'saved', icon: 'folder-open' })}</div>`;
    }
    function panelContent() { if (state.panel === 'Wardrobe')
        return itemPanel(); if (state.panel === 'Outfits')
        return `<h2 style="margin-bottom:15px">Demo outfits</h2><div class="character-list">${characters.map((c, i) => button(esc(c.name), 'outfit:' + i, { cls: 'outline' })).join('')}</div>`; if (state.panel === 'Moves')
        return `<h2>Available animations</h2><div class="character-list" style="margin-top:14px">${demo.m.rig.animations.map(a => button(clipLabel(a.id), 'clip:' + a.id, { pressed: state.clip === a.id })).join('')}</div><p class="muted" style="font-size:13px;margin-top:18px">Walk: four directions.<br>Cross-punch: south only.<br>No Idle clip; live views use a still pose when stopped.</p>`; return '<h2>Equipment colours</h2><p class="muted" style="font-size:13px;margin-top:16px">Exact palette editing is outside this movement prototype. The demo artwork keeps its original colours.</p>'; }
    function wardrobe() { return `<aside class="wardrobe ${state.expanded ? 'expanded' : ''}" data-ui aria-label="Equipment"><div class="wardrobe-scroll">${button('', 'expand', { cls: 'sheet-handle', extra: `aria-label="${state.expanded ? 'Collapse' : 'Expand'} equipment" aria-expanded="${state.expanded}"` })}${tabs(['Wardrobe', 'Colours', 'Moves', 'Outfits'].map(name => name === 'Moves' && state.view !== 'preview' ? [null, null] : [name, name]), state.panel, { cls: 'mode-tabs', label: 'Customization', action: 'panel' })}${state.panel === 'Wardrobe' ? `<nav class="categories" aria-label="Equipment category">${[...EQUIPMENT_SLOTS.filter(s => s.tab).map(s => [s.id, s.tab, s.icon]), ['all', 'All parts', 'grid-2x2']].map(([id, text, ic]) => button(`${icon(ic)}${text}`, 'slot:' + id, { pressed: state.slot === id })).join('')}</nav>` : ''}${panelContent()}</div></aside>`; }
    return wardrobe();
}
