import { unit, nearest, direction, facingFromVector } from './directions.mjs';
export { unit, nearest } from './directions.mjs';
export const clipLabel = id => id === 'walk' ? 'Walk' : id === 'cross-punch' ? 'Cross-punch' : id;
export function resolveMotion({ velocity, dirs, available, previous = 'south', still = {} }) {
    const u = unit(...velocity), moving = !!(u[0] || u[1]), request = moving ? 'walk' : 'idle';
    const intended = facingFromVector(dirs, u, previous);
    const facing = direction(intended)?.vector ?? [0, -1], desired = moving ? u : facing;
    const eligible = d => { const v = direction(d)?.vector; return v && v[0] * facing[0] + v[1] * facing[1] >= -1e-8; };
    for (const clip of moving ? ['walk', 'idle'] : ['idle']) {
        const usable = (available[clip] ?? []).filter(d => dirs.includes(d) && eligible(d));
        const dir = usable.includes(intended) ? intended : nearest(usable, desired, previous);
        if (dir)
            return { moving, request, intended, clip, dir, still: false, issue: clip !== request || dir !== intended ? `${request}:${(available[request] ?? []).length ? intended : 'all'}` : null };
    }
    const keys = Object.keys(still), declared = keys.filter(d => dirs.includes(d));
    const dir = nearest(declared.length ? declared : keys, desired, previous);
    return { moving, request, intended, clip: dir ? still[dir].clip : null, dir, cell: dir ? still[dir].cell : 0, still: true, issue: `${request}:${(available[request] ?? []).length ? intended : 'all'}` };
}
// Preview keeps the user's requested clip and facing separate from presentation.
// Missing clip coverage never removes a declared facing or turns it into another one.
export function resolvePreview({ clip, dir, available, still }) {
    if ((available[clip] ?? []).includes(dir))
        return { clip, dir, still: false, missing: false };
    const rest = still[dir];
    return { clip: rest?.clip ?? null, dir, cell: rest?.cell ?? 0, still: true, missing: true, requestedClip: clip };
}
export function frameAt(frames, elapsed) { const total = frames.reduce((s, f) => s + f.ms, 0); if (!(total > 0))
    return 0; let t = ((elapsed % total) + total) % total; for (const f of frames) {
    if (t < f.ms)
        return f.cell;
    t -= f.ms;
} return frames[0]?.cell ?? 0; }
export function advance(position, camera, velocity, dt, speed, response) { const step = Math.max(0, Math.min(dt, .05)); position.x += velocity[0] * speed * step; position.y += velocity[1] * speed * step; const a = 1 - Math.exp(-response * step); camera.x += (position.x - camera.x) * a; camera.y += (position.y - camera.y) * a; }
