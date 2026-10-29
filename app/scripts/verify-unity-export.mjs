// Native Unity Editor and optional Windows Mono player validation. No accounts, installs, or PixelLab calls.
// From app/: node --experimental-transform-types scripts/verify-unity-export.mjs --editor <Unity.exe> [--zip export.zip] [--build-player]
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { makeImg } from '../src/lib/image/png.ts';
import { cellHash, baseHashOf } from '../src/lib/rig/rig.ts';
import { applyExportSettings } from '../src/lib/store/export-settings.ts';
import { exportZip } from '../src/lib/export/export.ts';
import { unzip } from '../src/lib/store/zip.ts';
const app = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({ options: { editor: { type: 'string' }, zip: { type: 'string', multiple: true }, output: { type: 'string' }, 'build-player': { type: 'boolean' }, 'prepare-only': { type: 'boolean' } } });
assert(values.editor, 'Pass the installed, activated Editor executable with --editor.');
const editor = resolve(values.editor);
assert((await stat(editor)).isFile(), 'Editor executable does not exist.');
const cache = join(app, 'node_modules/.cache/unity-export-review');
await mkdir(cache, { recursive: true });
const project = values.output ? resolve(values.output) : await mkdtemp(join(cache, 'run-'));
if (values.output) {
    await mkdir(project);
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const exports = [], sources = [], identities = new Set();
async function fixtureArchive() {
    const images = new Map(), cells = {};
    for (const [id, size, color] of [['base', 64, [100, 100, 100, 255]], ['hair', 64, [0, 255, 255, 255]], ['hat', 96, [255, 255, 0, 255]]]) {
        cells[id] = [];
        for (let index = 0; index < 2; index++) {
            const image = makeImg(size, size);
            for (let y = 12; y < size - 4; y++)
                for (let x = 20; x < size - 20; x++)
                    image.data.set(color, (y * size + x) * 4);
            image.data.set(index ? [0, 255, 0, 255] : [255, 0, 0, 255], ((size / 2) * size + size / 2) * 4);
            const hash = await cellHash(image);
            images.set(hash, image);
            cells[id].push(hash);
        }
    }
    cells.hat_small = cells.hair;
    const timelines = [['walk', [80, 180, 100]], ['jump', [80, 180, 100]], ['single', [100]], ['uniform', [100, 100, 100]], ['ticktail', [80, 180, 20]], ['prime', [83, 177, 101]]];
    const animations = timelines.map(([id, durations]) => ({ id, cells: 2, loop: id === 'jump', frames: durations.map((ms, index) => ({ cell: index % 2, ms })) }));
    const rig = { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, baseItem: 'base', baseHash: '', directions: [{ id: 'south' }], animations };
    rig.baseHash = await baseHashOf(rig, Object.fromEntries(animations.flatMap(move => cells.base.map((hash, index) => [`${move.id}/south/${index}`, hash]))));
    const manifest = { format: 'pixeldoll/2', name: 'Unity layered playback', app: 'review', rig, slots: [{ id: 'body', z: 10, class: 'base', required: true }, { id: 'hair', z: 20, class: 'rigid' }, { id: 'head', z: 30, class: 'rigid' }], materials: [{ id: 'skin', owner: 'base', label: 'Skin', ramp: ['#646464'], defaultVariant: 'blue', variants: { blue: ['#0000ff'], red: ['#ff0000'] } }], items: [['base', 'body', 10], ['hair', 'hair', 20], ['hat_small', 'head', 30], ['hat', 'head', 30]].map(([id, slot, z]) => ({ id, name: id, slot, status: 'accepted', baseHash: rig.baseHash, mirror: 'flip', materials: id === 'base' ? ['skin'] : [], ...(id === 'hat' ? { hides: ['hair'] } : {}), prompt: '', provenance: [], layers: [{ id: 'main', role: 'fg', z, ...(id === 'hat' ? { cell: { w: 96, h: 96 }, pivot: { x: 48, y: 76 } } : {}), cells: Object.fromEntries(animations.map(move => [move.id, { south: cells[id] }])) }] })), presets: [{ id: 'current', name: 'Current', items: { body: 'base', hair: 'hair', head: 'hat' }, variants: {} }] };
    const copy = structuredClone(manifest);
    applyExportSettings(copy, { engine: 'unity', dressedCharacterSheets: false, playOnce: ['jump', 'single', 'ticktail', 'prime'] });
    const result = await exportZip({ manifest: copy, images }, { engines: ['unity'], baked: false, exportedAt: '2026-10-28T00:00:00.000Z' });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(manifest.rig.animations.map(a => a.loop), [false, true, false, false, false, false]);
    return result.zip;
}
async function save(label, bytes) {
    const files = await unzip(bytes), root = join(project, 'Assets', label);
    const json = JSON.parse(new TextDecoder().decode(files.get('unity/pixeldoll_unity.json')));
    assert(!identities.has(json.exportId), 'Duplicate character export identity; pass different characters, not duplicate copies of one export.');
    identities.add(json.exportId);
    for (const [name, data] of files) {
        if (!name.startsWith('unity/') && !name.endsWith('.png'))
            continue;
        const out = resolve(root, name);
        assert(out.startsWith(root + sep), 'Unsafe archive path.');
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, data);
    }
    exports.push({ label, root: 'Assets/' + label, json: 'Assets/' + label + '/unity/pixeldoll_unity.json' });
    sources.push({ label, sha256: sha(bytes) });
}
await save('LayeredTiming', await fixtureArchive());
for (const [index, file] of (values.zip ?? []).entries())
    await save('ActualUi' + index, new Uint8Array(await readFile(resolve(file))));
await mkdir(join(project, 'ProjectSettings'), { recursive: true });
// The supplied Editor opens the fresh project using its own version; no installation or upgrade of user data.
await mkdir(join(project, 'Packages'), { recursive: true });
await writeFile(join(project, 'Packages/manifest.json'), JSON.stringify({ dependencies: { 'com.unity.2d.sprite': '1.0.0', 'com.unity.modules.animation': '1.0.0', 'com.unity.modules.jsonserialize': '1.0.0', 'com.unity.modules.imageconversion': '1.0.0', 'com.unity.modules.imgui': '1.0.0' } }, null, 2));
await mkdir(join(project, 'Assets/Editor'), { recursive: true });
for (const file of ['NativePlayback.cs', 'NativePlayer.cs'])
    await copyFile(new URL('unity-review/' + file, import.meta.url), join(project, 'Assets', file));
await copyFile(new URL('unity-review/EditorReview.cs', import.meta.url), join(project, 'Assets/Editor/EditorReview.cs'));
await writeFile(join(project, 'review-inputs.json'), JSON.stringify({ exports }, null, 2));
await writeFile(join(project, 'sources.json'), JSON.stringify({ editor, sources }, null, 2));
console.log(JSON.stringify({ project, sources }));
if (!values['prepare-only']) {
    async function run(executable, args) {
        await new Promise((done, fail) => {
            const child = spawn(executable, args, { windowsHide: true, detached: process.platform !== 'win32', stdio: 'ignore' });
            let timedOut = false, termination = Promise.resolve();
            const timeout = setTimeout(() => {
                timedOut = true;
                // Terminate only the process tree owned by this invocation, including Unity asset workers.
                if (process.platform === 'win32') termination = new Promise(resolve => {
                    execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, error => {
                        if (error) child.kill();
                        resolve(error);
                    });
                });
                else {
                    try { process.kill(-child.pid, 'SIGKILL'); }
                    catch (error) { termination = Promise.resolve(error); child.kill(); }
                }
            }, 20 * 60 * 1000);
            child.once('error', error => { clearTimeout(timeout); fail(error); });
            child.once('close', async code => {
                clearTimeout(timeout);
                const terminationError = await termination;
                if (timedOut) fail(Error('Native verification exceeded 20 minutes; ' + (terminationError ? 'owned process-tree termination failed: ' + terminationError.message : 'owned process tree terminated') + '; inspect logs in ' + project));
                else code === 0 ? done() : fail(Error('Native process exited ' + code + '; inspect logs in ' + project));
            });
        });
    }
    async function editorStep(method, log) { await run(editor, ['-batchmode', '-nographics', '-projectPath', project, '-executeMethod', 'PixelDollNativeReview.Runner.' + method, '-job-worker-count', '2', '-logFile', join(project, log)]); }
    await editorStep('Run', 'editor-runtime.log');
    const native = JSON.parse(await readFile(join(project, 'native-results.json'), 'utf8'));
    assert(native.passed);
    await writeFile(join(project, 'editor-results.json'), JSON.stringify(native, null, 2));
    console.log(JSON.stringify({ mode: 'Editor Play Mode', checks: native.checks.length, passed: native.passed }));
    await editorStep('ProbeDurations', 'editor-duration-contract.log');
    const durations = JSON.parse(await readFile(join(project, 'duration-variants.json'), 'utf8')).results;
    assert.equal(durations.length, 15);
    for (const sample of durations) {
        if (sample.variant === 'terminal-at-last-tick')
            assert(Math.abs(sample.length - sample.expected) < .0001, sample.sample);
        else
            assert(sample.length > sample.expected + .0005, 'Old end-key construction must expose the extra native sample.');
    }
    if (values['build-player']) {
        await editorStep('BuildPlayer', 'editor-player-build.log');
        const output = join(project, 'player-results.json');
        await run(join(project, 'Player/NativeReview.exe'), ['-batchmode', '-nographics', '-reviewResults', output, '-logFile', join(project, 'player.log')]);
        const player = JSON.parse(await readFile(output, 'utf8'));
        assert(player.passed);
        console.log(JSON.stringify({ mode: 'Windows Mono standalone', checks: player.checks.length, passed: player.passed }));
    }
}
