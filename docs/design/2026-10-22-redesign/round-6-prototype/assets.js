import { loadFixture } from '../../../../app/src/lib/compose/fixture.ts';
import { composeCell, bakedFrame, cellImg } from '../../../../app/src/lib/compose/compose.ts';
export async function loadDemo() {
    const project = await loadFixture(async (path) => { const r = await fetch('/' + path); if (!r.ok)
        throw Error(`Demo file unavailable: ${path}`); return new Uint8Array(await r.arrayBuffer()); });
    const m = project.manifest, frame = bakedFrame(m), base = m.items.find(i => i.id === m.rig.baseItem), dirs = m.rig.directions.map(d => d.id), available = {}, still = {};
    function cells(layer, clip, dir, seen = new Set()) {
        if (seen.has(dir))
            return null;
        seen.add(dir);
        const own = layer.cells?.[clip]?.[dir];
        if (own)
            return own;
        const source = m.rig.directions.find(d => d.id === dir)?.mirrorOf;
        return source ? cells(layer, clip, source, seen) : null;
    }
    function covered(item, clip, dir) {
        const anim = m.rig.animations.find(a => a.id === clip);
        if (!anim)
            return false;
        let visible = false;
        for (const layer of item.layers) {
            const list = cells(layer, clip, dir);
            if (!list)
                return false;
            for (const { cell } of anim.frames) {
                const h = list[cell];
                if (h === undefined || h !== null && !project.images.has(h))
                    return false;
                if (h)
                    visible = true;
            }
        }
        // This legacy fixture uses wholly empty sheets for absent directions. Authored transparency
        // inside valid sequences remains valid. This is not an import-format validator.
        return visible;
    }
    for (const anim of m.rig.animations) {
        available[anim.id] = dirs.filter(d => covered(base, anim.id, d));
        for (const dir of dirs) {
            if (still[dir])
                continue;
            for (let cell = 0; cell < anim.cells; cell++) {
                const im = cellImg(project, base.layers[0], anim.id, dir, cell);
                if (im?.data.some((v, i) => i % 4 === 3 && v)) {
                    still[dir] = { clip: anim.id, cell };
                    break;
                }
            }
        }
    }
    const cache = new Map();
    function sprite(items, clip, dir, cell) {
        const hidden = m.items.filter(i => items[i.slot] === i.id && i.id !== m.rig.baseItem && !covered(i, clip, dir));
        const filtered = { ...items };
        for (const i of hidden)
            filtered[i.slot] = null;
        const key = JSON.stringify([filtered, clip, dir, cell]);
        let canvas = cache.get(key);
        if (!canvas) {
            const im = composeCell(project, filtered, clip, dir, cell, frame);
            canvas = document.createElement('canvas');
            canvas.width = im.w;
            canvas.height = im.h;
            canvas.getContext('2d').putImageData(new ImageData(im.data, im.w, im.h), 0, 0);
            cache.set(key, canvas);
        }
        return { canvas, hidden };
    }
    function thumbnail(item) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const g = canvas.getContext('2d');
        const im = sprite({ [item.slot]: item.id }, 'walk', 'south', 0).canvas;
        // Actual standalone layer thumbnails, not a new generated item.
        const out = new Uint8ClampedArray(64 * 64 * 4);
        for (const layer of item.layers) {
            const l = cellImg(project, layer, 'walk', 'south', 0);
            if (l)
                for (let p = 0; p < l.data.length; p += 4)
                    if (l.data[p + 3])
                        out.set(l.data.subarray(p, p + 4), p);
        }
        g.putImageData(new ImageData(out, 64, 64), 0, 0);
        // Thumbnail framing only: preserve the animated actor's fixed frame/pivot elsewhere.
        let left = 64, top = 64, right = -1, bottom = -1;
        for (let y = 0; y < 64; y++)
            for (let x = 0; x < 64; x++)
                if (out[(y * 64 + x) * 4 + 3]) {
                    left = Math.min(left, x);
                    top = Math.min(top, y);
                    right = Math.max(right, x);
                    bottom = Math.max(bottom, y);
                }
        if (right < 0)
            return canvas.toDataURL();
        const size = Math.max(32, right - left + 1, bottom - top + 1), thumb = document.createElement('canvas');
        thumb.width = thumb.height = size;
        thumb.getContext('2d').drawImage(canvas, left, top, right - left + 1, bottom - top + 1, Math.floor((size - (right - left + 1)) / 2), Math.floor((size - (bottom - top + 1)) / 2), right - left + 1, bottom - top + 1);
        return thumb.toDataURL();
    }
    return { project, m, frame, dirs, available, still, covered, sprite, thumbnail, cache };
}
