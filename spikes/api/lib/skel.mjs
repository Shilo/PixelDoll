// S3: 18-joint PixelLab skeleton helpers. Pure, browser-portable. Pose = { LABEL: {x, y, z} } in PIXELS (0..w).
// API keypoints (estimate-skeleton out, skeleton-v3 in) are [{label, x, y, z_index}] normalised 0..1; labels are the
// CHARACTER's left/right (south view: RIGHT * is on the viewer's left). "ARM" = wrist/hand end, "LEG" = ankle end.
export const LABELS = ['NOSE', 'NECK', 'RIGHT SHOULDER', 'RIGHT ELBOW', 'RIGHT ARM', 'LEFT SHOULDER', 'LEFT ELBOW', 'LEFT ARM',
  'RIGHT HIP', 'RIGHT KNEE', 'RIGHT LEG', 'LEFT HIP', 'LEFT KNEE', 'LEFT LEG', 'RIGHT EYE', 'LEFT EYE', 'RIGHT EAR', 'LEFT EAR'];
export const HEAD = ['NOSE', 'RIGHT EYE', 'LEFT EYE', 'RIGHT EAR', 'LEFT EAR'];

export const fromApi = (kps, w, h) => Object.fromEntries(kps.map(k => [k.label, { x: k.x * w, y: k.y * h, z: k.z_index ?? 0 }]));
const clamp01 = v => Math.min(1, Math.max(0, v));
// keepZ=false omits z_index so skeleton-v3 falls back to template depth/draw order (S3 default).
export const toApi = (pose, w, h, keepZ = true) => LABELS.map(l => ({ label: l, x: +clamp01(pose[l].x / w).toFixed(4), y: +clamp01(pose[l].y / h).toFixed(4), ...(keepZ ? { z_index: Math.round(pose[l].z) } : {}) }));
export const clonePose = p => Object.fromEntries(Object.entries(p).map(([l, k]) => [l, { ...k }]));
export const mid = (p, ls) => ({ x: ls.reduce((s, l) => s + p[l].x, 0) / ls.length, y: ls.reduce((s, l) => s + p[l].y, 0) / ls.length });

// Rotate a chain of joints around a pivot joint by deg (screen coords, +deg = clockwise on screen).
export function rotate(p, pivotLabel, labels, deg) {
  const o = clonePose(p), c = typeof pivotLabel === 'string' ? p[pivotLabel] : pivotLabel, a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
  for (const l of labels) { const dx = p[l].x - c.x, dy = p[l].y - c.y; o[l].x = c.x + dx * cs - dy * sn; o[l].y = c.y + dx * sn + dy * cs; }
  return o;
}
// Place an arm (shoulder fixed) so the upper arm points at angle a1 and the forearm at a2 (deg, 0 = +x/right, 90 = down).
export function setArm(p, side, a1, a2, scale = 1) {
  const o = clonePose(p), S = p[`${side} SHOULDER`], E = p[`${side} ELBOW`], W = p[`${side} ARM`];
  const l1 = Math.hypot(E.x - S.x, E.y - S.y) * scale, l2 = Math.hypot(W.x - E.x, W.y - E.y) * scale, r = d => d * Math.PI / 180;
  o[`${side} ELBOW`] = { ...E, x: S.x + l1 * Math.cos(r(a1)), y: S.y + l1 * Math.sin(r(a1)) };
  o[`${side} ARM`] = { ...W, x: o[`${side} ELBOW`].x + l2 * Math.cos(r(a2)), y: o[`${side} ELBOW`].y + l2 * Math.sin(r(a2)) };
  return o;
}
export const shift = (p, labels, dx, dy) => { const o = clonePose(p); for (const l of labels) { o[l].x += dx; o[l].y += dy; } return o; };
export const UPPER = ['NOSE', 'NECK', 'RIGHT SHOULDER', 'RIGHT ELBOW', 'RIGHT ARM', 'LEFT SHOULDER', 'LEFT ELBOW', 'LEFT ARM', 'RIGHT EYE', 'LEFT EYE', 'RIGHT EAR', 'LEFT EAR'];
export const ALL = LABELS;

// Per-joint distance stats between two poses (px).
export function poseErr(a, b, labels = LABELS) {
  const d = labels.filter(l => a[l] && b[l]).map(l => Math.hypot(a[l].x - b[l].x, a[l].y - b[l].y));
  d.sort((x, y) => x - y);
  return { mean: +(d.reduce((s, v) => s + v, 0) / d.length).toFixed(2), median: +d[d.length >> 1].toFixed(2), max: +d[d.length - 1].toFixed(2) };
}
// Handedness check: is the measured RIGHT hand nearer the requested RIGHT hand than the requested LEFT hand?
export function handOk(req, got) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return d(got['RIGHT ARM'], req['RIGHT ARM']) <= d(got['RIGHT ARM'], req['LEFT ARM']);
}

// Draw a pose (lines + joint dots) onto an RGBA image for contact sheets. Right side = red, left = blue, centre = yellow.
const BONES = [['NECK', 'NOSE'], ['NECK', 'RIGHT SHOULDER'], ['RIGHT SHOULDER', 'RIGHT ELBOW'], ['RIGHT ELBOW', 'RIGHT ARM'], ['NECK', 'LEFT SHOULDER'],
  ['LEFT SHOULDER', 'LEFT ELBOW'], ['LEFT ELBOW', 'LEFT ARM'], ['NECK', 'RIGHT HIP'], ['RIGHT HIP', 'RIGHT KNEE'], ['RIGHT KNEE', 'RIGHT LEG'],
  ['NECK', 'LEFT HIP'], ['LEFT HIP', 'LEFT KNEE'], ['LEFT KNEE', 'LEFT LEG']];
const col = l => l.startsWith('RIGHT') ? [255, 40, 40, 255] : l.startsWith('LEFT') ? [40, 120, 255, 255] : [255, 220, 0, 255];
export function drawPose(im, p, s = 1, fixed = null, r = 2) { // im is already scaled by s; fixed = one RGBA for the whole pose
  const C = l => fixed || col(l);
  const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < im.w && y < im.h) im.d.set(c, (y * im.w + x) * 4); };
  for (const [a, b] of BONES) {
    if (!p[a] || !p[b]) continue;
    const n = 2 * s * Math.hypot(p[b].x - p[a].x, p[b].y - p[a].y) | 0;
    for (let i = 0; i <= n; i++) { const t = i / (n || 1), x = s * (p[a].x + (p[b].x - p[a].x) * t), y = s * (p[a].y + (p[b].y - p[a].y) * t); put(x, y, C(b)); put(x + 1, y, C(b)); put(x, y + 1, C(b)); }
  }
  for (const l of LABELS) if (p[l]) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) put(s * p[l].x + dx, s * p[l].y + dy, C(l));
  return im;
}

export function selfTest() {
  const p = { 'RIGHT SHOULDER': { x: 10, y: 10, z: 0 }, 'RIGHT ELBOW': { x: 10, y: 20, z: 0 }, 'RIGHT ARM': { x: 10, y: 30, z: 0 } };
  const q = rotate(p, 'RIGHT SHOULDER', ['RIGHT ELBOW', 'RIGHT ARM'], -90); // down -> right? screen: (0,10) rotated -90 => (10,0)
  console.assert(Math.abs(q['RIGHT ARM'].x - 30) < 1e-9 && Math.abs(q['RIGHT ARM'].y - 10) < 1e-9, 'rotate', q['RIGHT ARM']);
  const r = setArm(p, 'RIGHT', -90, -90); // straight up
  console.assert(Math.abs(r['RIGHT ARM'].y + 10) < 1e-9 && Math.abs(r['RIGHT ARM'].x - 10) < 1e-9, 'setArm', r['RIGHT ARM']);
  const req = { 'RIGHT ARM': { x: 0, y: 0 }, 'LEFT ARM': { x: 10, y: 0 } };
  console.assert(handOk(req, { 'RIGHT ARM': { x: 2, y: 0 } }) && !handOk(req, { 'RIGHT ARM': { x: 9, y: 0 } }), 'handOk');
  return true;
}

// Held-item handedness QA (S3/K4). dR/dL = min distance (px) from any item pixel to the RIGHT/LEFT wrist keypoint.
// 'R' | 'L' | 'amb' (hands overlap or distances within 1.5 px, e.g. side views) | 'none' (no item pixel within 6 px of either wrist; the fist extends ~2 px past the wrist point).
export function gripSide(dR, dL, handsDist, near = 6) {
  if (Math.min(dR, dL) > near) return 'none';
  if (handsDist < 3 || Math.abs(dR - dL) < 1.5) return 'amb';
  return dR < dL ? 'R' : 'L';
}
