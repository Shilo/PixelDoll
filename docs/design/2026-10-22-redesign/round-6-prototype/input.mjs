import { unit } from './directions.mjs';
export const MOVEMENT_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']);
export function keyboardVector(keys, horizontalOnly = false) {
    const held = (...names) => names.some(name => keys.has(name));
    return unit(Number(held('d', 'arrowright')) - Number(held('a', 'arrowleft')), horizontalOnly ? 0 : Number(held('w', 'arrowup')) - Number(held('s', 'arrowdown')));
}
