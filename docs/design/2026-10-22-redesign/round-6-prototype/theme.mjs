// Scene art controls only. UI roles come from the installed Bronze CSS package.
export const APPEARANCES = {
    obsidian: { scheme: 'dark', world: { floor: [.085, .095, .105], seam: [.49, .40, .27], fog: [.145, .155, .165] } },
    porcelain: { scheme: 'light', world: { floor: [.92, .90, .85], seam: [.48, .36, .22], fog: [.94, .92, .88] } },
};
export const DEFAULT_THEME = 'obsidian';
export const themeName = name => Object.hasOwn(APPEARANCES, name) ? name : DEFAULT_THEME;
export function applyTheme(name) {
    const theme = APPEARANCES[themeName(name)];
    document.body.dataset.theme = themeName(name);
    document.documentElement.dataset.theme = theme.scheme;
}
// Sample equipment ramp: authored item colors, deliberately independent of appearance.
export const DEMO_EQUIPMENT_PALETTE = ['#858581', '#a73933', '#428d7a', '#72549d', '#d7af65'];
