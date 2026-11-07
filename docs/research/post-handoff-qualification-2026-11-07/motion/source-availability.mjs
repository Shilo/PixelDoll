import { writeFileSync } from 'node:fs';
const commit = '75cda26531b47f41c75d4aa4a82c4f135daa6eea';
const url = `https://api.github.com/repos/toyxyz/toyxyz_RGBMocap/git/trees/${commit}?recursive=1`;
const response = await fetch(url);
if (!response.ok) throw new Error(`Public repository tree request failed (${response.status}).`);
const tree = await response.json();
if (tree.truncated) throw new Error('Public tree is truncated; cannot claim complete extension coverage.');
const structured = tree.tree.filter(node => node.type === 'blob' && /\.(fbx|bvh|glb|gltf|npz|npy)$/i.test(node.path)).map(node => node.path);
const previews = tree.tree.filter(node => node.type === 'blob' && /\.(mp4|webm)$/i.test(node.path)).map(node => node.path);
const result = { version: 1, paidCalls: 0, source: url, commit, truncated: false, structuredMotionFiles: structured, previewVideos: previews,
  disposition: 'Pinned public tree inspection only. Preview videos are not structured exports. No RGBMoCap model or native application was run; external releases or separately supplied exports were not exhaustively searched.' };
writeFileSync(new URL('source-availability.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
