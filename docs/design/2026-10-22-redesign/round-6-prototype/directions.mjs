// One compass vocabulary for authoring, Preview and gameplay. Accept production
// hyphenated IDs and the legacy fixture's compact IDs without rewriting rig identity.
const compass = [
    ['north', 'N', 0], ['north-east', 'NE', 45], ['east', 'E', 90],
    ['south-east', 'SE', 135], ['south', 'S', 180], ['south-west', 'SW', 225],
    ['west', 'W', 270], ['north-west', 'NW', 315],
];
export const DIRECTIONS = compass.map(([id, short, angle]) => ({
    id, short, angle, label: id[0].toUpperCase() + id.slice(1),
    vector: [Math.sin(angle * Math.PI / 180), Math.cos(angle * Math.PI / 180)],
}));
const normalize = id => String(id).replaceAll('-', '').toLowerCase();
export const direction = id => DIRECTIONS.find(d => normalize(d.id) === normalize(id));
export const labelDir = Object.fromEntries(DIRECTIONS.flatMap(d => [[d.id, d.label], [normalize(d.id), d.label]]));
export const compassLayout = ['northwest', 'north', 'northeast', 'west', null, 'east', 'southwest', 'south', 'southeast'];
const all = compassLayout.filter(Boolean);
export const DIRECTION_PRESETS = [
    { label: 'Top-down 8', dirs: all },
    { label: 'Top-down 4', dirs: ['north', 'east', 'south', 'west'] },
    { label: 'Diagonal 4', dirs: ['northeast', 'southeast', 'southwest', 'northwest'] },
    { label: 'Side-scroller 2', dirs: ['east', 'west'] },
    { label: 'Unique 8', dirs: all, unique: true },
];
export function unit(x, y) { const n = Math.hypot(x, y); return Number.isFinite(n) && n > 0 ? [x / n, y / n] : [0, 0]; }
export function nearest(dirs, u, previous, defaultDir = 'south') {
    // Fixed tie priority, independent of manifest order; preserve the supplied ID.
    const rank = ['south', 'east', 'north', 'west', 'southeast', 'northeast', 'southwest', 'northwest'];
    const valid = [...new Set(dirs)].filter(id => direction(id)).sort((a, b) => rank.indexOf(normalize(a)) - rank.indexOf(normalize(b)));
    if (!valid.length)
        return null;
    const scores = valid.map(id => direction(id).vector.reduce((s, v, i) => s + v * u[i], 0));
    const best = Math.max(...scores), ties = valid.filter((_, i) => best - scores[i] < 1e-8);
    return ties.find(id => normalize(id) === normalize(previous)) ?? ties.find(id => normalize(id) === normalize(defaultDir)) ?? ties[0];
}
export function facingFromVector(dirs, vector, previous = 'south') {
    const u = unit(...vector);
    if (!u[0] && !u[1])
        return dirs.find(id => normalize(id) === normalize(previous)) ?? nearest(dirs, [0, -1], previous);
    return nearest(dirs, u, previous, dirs.some(id => normalize(id) === 'south') ? 'south' : 'east');
}
