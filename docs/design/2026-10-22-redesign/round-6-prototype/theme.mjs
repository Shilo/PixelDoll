// Semantic UI and environment tokens. Sprite/equipment colors never use these.
export const APPEARANCES = {
    obsidian: { scheme: 'dark', ui: { bg: '#111317', surface: '#202329', text: '#f2eee6', muted: '#b8b5ad', accent: '#c9a66b', ink: '#111317' }, lineAlpha: .26, world: { floor: [.085, .095, .105], seam: [.49, .40, .27], fog: [.145, .155, .165] } },
    porcelain: { scheme: 'light', ui: { bg: '#eeeae2', surface: '#faf7f0', text: '#25282d', muted: '#5e625f', accent: '#76562f', ink: '#ffffff' }, lineAlpha: .28, world: { floor: [.92, .90, .85], seam: [.48, .36, .22], fog: [.94, .92, .88] } },
};
export const DEFAULT_THEME = 'obsidian';
export const themeName = name => Object.hasOwn(APPEARANCES, name) ? name : DEFAULT_THEME;
export const rgb = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16));
export function applyTheme(name, element = document.body) {
    const theme = APPEARANCES[themeName(name)];
    element.dataset.theme = themeName(name);
    element.style.colorScheme = theme.scheme;
    const root = document.documentElement;
    const tokens = element === document.body && root.dataset.material !== 'baseline' ? root : element;
    if (element === document.body) root.dataset.theme = theme.scheme;
    for (const [key, value] of Object.entries(theme.ui))
        tokens.style.setProperty('--' + key, key === 'surface' ? rgb(value).join(',') : value);
    tokens.style.setProperty('--line', `rgba(${rgb(theme.ui.muted).join(',')},${theme.lineAlpha})`);
}
// Sample equipment ramp: authored item colors, deliberately independent of appearance.
export const DEMO_EQUIPMENT_PALETTE = ['#858581', '#a73933', '#428d7a', '#72549d', '#d7af65'];
