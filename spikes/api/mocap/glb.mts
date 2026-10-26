// Minimal GLB/glTF 2.0 reader: JSON + BIN chunks, accessors, node TRS hierarchy, skins, animation sampling.
// Input is untrusted data: it is only parsed as JSON and typed arrays, never evaluated.
import { readFileSync } from 'node:fs';

export type V3 = [number, number, number];
export type Q = [number, number, number, number]; // x y z w
export interface TRS { t: V3; r: Q; s: V3 }
export type M4 = Float64Array; // column-major 4x4

export interface Glb { json: any; bin: Uint8Array }

export function parseGlb(path: string): Glb {
  const b = readFileSync(path);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB (bad magic)');
  if (dv.getUint32(4, true) !== 2) throw new Error('unsupported GLB version');
  const total = dv.getUint32(8, true);
  if (total > b.byteLength) throw new Error('GLB length exceeds file');
  let off = 12, json: any, bin: Uint8Array | undefined;
  while (off + 8 <= total) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (start + len > total) throw new Error('GLB chunk overruns file');
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(b.subarray(start, start + len)));
    else if (type === 0x004e4942) bin = new Uint8Array(b.buffer, b.byteOffset + start, len);
    off = start + len + ((4 - (len % 4)) % 4);
  }
  if (!json || !bin) throw new Error('GLB missing JSON or BIN chunk');
  return { json, bin };
}

const COMP: Record<number, [number, (dv: DataView, o: number) => number, number]> = {
  5120: [1, (d, o) => d.getInt8(o), 127], 5121: [1, (d, o) => d.getUint8(o), 255],
  5122: [2, (d, o) => d.getInt16(o, true), 32767], 5123: [2, (d, o) => d.getUint16(o, true), 65535],
  5125: [4, (d, o) => d.getUint32(o, true), 0], 5126: [4, (d, o) => d.getFloat32(o, true), 0],
};
const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** Returns accessor values as rows of numbers (normalized ints mapped to floats per spec). */
export function readAccessor(g: Glb, idx: number): number[][] {
  const a = g.json.accessors[idx];
  if (!a) throw new Error(`accessor ${idx} missing`);
  if (a.sparse) throw new Error('sparse accessors unsupported');
  const n = NCOMP[a.type], c = COMP[a.componentType];
  if (!n || !c) throw new Error(`accessor ${idx}: unsupported type ${a.type}/${a.componentType}`);
  const bv = g.json.bufferViews[a.bufferView];
  if (!bv || (bv.buffer ?? 0) !== 0) throw new Error(`accessor ${idx}: external buffers unsupported`);
  const stride = bv.byteStride || n * c[0];
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  if (base + stride * (a.count - 1) + n * c[0] > (bv.byteOffset ?? 0) + bv.byteLength || (bv.byteOffset ?? 0) + bv.byteLength > g.bin.byteLength)
    throw new Error(`accessor ${idx} overruns buffer`);
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset, g.bin.byteLength);
  const out: number[][] = [];
  for (let i = 0; i < a.count; i++) {
    const row: number[] = [];
    for (let k = 0; k < n; k++) {
      let v = c[1](dv, base + i * stride + k * c[0]);
      if (a.normalized && c[2]) v = Math.max(v / c[2], -1);
      row.push(v);
    }
    out.push(row);
  }
  return out;
}

// --- math ---
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(...a);
export const norm = (a: V3): V3 => mul(a, 1 / len(a));

function qnorm(q: Q): Q { const l = Math.hypot(...q) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; }
function slerp(a: Q, b: Q, t: number): Q {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
  if (d > 0.9995) return qnorm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]);
  const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb];
}

export function trsToMat({ t, r: [x, y, z, w], s }: TRS): M4 {
  const m = new Float64Array(16);
  m[0] = (1 - 2 * (y * y + z * z)) * s[0]; m[1] = 2 * (x * y + z * w) * s[0]; m[2] = 2 * (x * z - y * w) * s[0];
  m[4] = 2 * (x * y - z * w) * s[1]; m[5] = (1 - 2 * (x * x + z * z)) * s[1]; m[6] = 2 * (y * z + x * w) * s[1];
  m[8] = 2 * (x * z + y * w) * s[2]; m[9] = 2 * (y * z - x * w) * s[2]; m[10] = (1 - 2 * (x * x + y * y)) * s[2];
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
  return m;
}
export function matMul(a: M4, b: M4): M4 {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let v = 0;
    for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = v;
  }
  return o;
}
export const xformPoint = (m: M4, p: V3): V3 => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
export const xformDir = (m: M4, p: V3): V3 => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];

// --- scene ---
export function restTRS(node: any): TRS {
  if (node.matrix) throw new Error(`node ${node.name}: matrix nodes unsupported`);
  return { t: node.translation ?? [0, 0, 0], r: node.rotation ?? [0, 0, 0, 1], s: node.scale ?? [1, 1, 1] };
}

export function animByName(g: Glb, name: string) {
  const a = g.json.animations.find((x: any) => x.name === name);
  if (!a) throw new Error(`animation ${name} not found`);
  return a;
}

interface Track { node: number; path: 'translation' | 'rotation' | 'scale'; interp: string; times: number[]; values: number[][] }
const trackCache = new WeakMap<object, Track[]>();
function tracks(g: Glb, anim: any): Track[] {
  let t = trackCache.get(anim);
  if (t) return t;
  t = anim.channels.filter((c: any) => c.target.node !== undefined && c.target.path !== 'weights').map((c: any) => {
    const s = anim.samplers[c.sampler];
    if (s.interpolation === 'CUBICSPLINE') throw new Error('CUBICSPLINE unsupported');
    return { node: c.target.node, path: c.target.path, interp: s.interpolation ?? 'LINEAR', times: readAccessor(g, s.input).map((r) => r[0]), values: readAccessor(g, s.output) };
  });
  trackCache.set(anim, t!);
  return t!;
}
export const animDuration = (g: Glb, anim: any) => Math.max(...tracks(g, anim).map((t) => t.times[t.times.length - 1]));

function sampleTrack(tr: Track, time: number): number[] {
  const { times, values } = tr;
  if (time <= times[0]) return values[0];
  if (time >= times[times.length - 1]) return values[times.length - 1];
  let i = 0;
  while (times[i + 1] < time) i++;
  if (tr.interp === 'STEP') return values[i];
  const u = (time - times[i]) / (times[i + 1] - times[i]);
  if (tr.path === 'rotation') return slerp(values[i] as Q, values[i + 1] as Q, u);
  return values[i].map((v, k) => v + (values[i + 1][k] - v) * u);
}

/** World matrices of every node at `time` (rest pose when anim is null). */
export function worldMatrices(g: Glb, anim: any | null, time: number): M4[] {
  const nodes = g.json.nodes;
  const local: TRS[] = nodes.map(restTRS);
  if (anim) for (const tr of tracks(g, anim)) {
    const v = sampleTrack(tr, time);
    if (tr.path === 'translation') local[tr.node].t = v as V3;
    else if (tr.path === 'rotation') local[tr.node].r = v as Q;
    else local[tr.node].s = v as V3;
  }
  const world: M4[] = new Array(nodes.length);
  const visit = (i: number, parent: M4 | null, depth: number) => {
    if (depth > 256) throw new Error('node hierarchy too deep (cycle?)');
    world[i] = parent ? matMul(parent, trsToMat(local[i])) : trsToMat(local[i]);
    for (const c of nodes[i].children ?? []) visit(c, world[i], depth + 1);
  };
  for (const r of g.json.scenes[g.json.scene ?? 0].nodes) visit(r, null, 0);
  return world;
}
