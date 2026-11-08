import {
	MOTION_EDGES,
	motionCamera,
	dot3,
	sub3,
	length3,
	type Pose3
} from '../../lib/rig/motion.ts';
import type { Keypoint } from '../../lib/rig/rig.ts';
import type { Img } from '../../lib/image/png.ts';
const colors = () => {
	const s = getComputedStyle(document.documentElement);
	return {
		background: s.getPropertyValue('--bu-canvas'),
		right: s.getPropertyValue('--bu-danger'),
		left: s.getPropertyValue('--bu-info'),
		center: s.getPropertyValue('--bu-accent'),
		ghost: s.getPropertyValue('--bu-muted')
	};
};
const enriched = (k: Keypoint[]): Record<string, Keypoint> => {
	const by = Object.fromEntries(k.map((k) => [k.label, k]));
	return {
		...by,
		PELVIS: {
			label: 'PELVIS',
			x: (by['RIGHT HIP'].x + by['LEFT HIP'].x) / 2,
			y: (by['RIGHT HIP'].y + by['LEFT HIP'].y) / 2
		},
		HEAD: {
			label: 'HEAD',
			x: (by['RIGHT EAR'].x + by['LEFT EAR'].x) / 2,
			y: (by['RIGHT EAR'].y + by['LEFT EAR'].y) / 2
		}
	};
};
function lines(
	g: CanvasRenderingContext2D,
	points: Record<string, { x: number; y: number }>,
	selected = ''
) {
	const c = colors();
	g.lineWidth = 2;
	for (const [a, b] of MOTION_EDGES) {
		g.strokeStyle = (a + b).includes('RIGHT')
			? c.right
			: (a + b).includes('LEFT')
				? c.left
				: c.center;
		g.beginPath();
		g.moveTo(points[a].x, points[a].y);
		g.lineTo(points[b].x, points[b].y);
		g.stroke();
	}
	for (const [label, p] of Object.entries(points)) {
		g.fillStyle =
			label === selected
				? c.center
				: label.startsWith('RIGHT')
					? c.right
					: label.startsWith('LEFT')
						? c.left
						: c.center;
		g.beginPath();
		g.arc(p.x, p.y, label === selected ? 5 : 2.5, 0, Math.PI * 2);
		g.fill();
	}
}
export function drawOverlay(
	canvas: HTMLCanvasElement,
	image: Img,
	keypoints: Keypoint[],
	selected: string,
	ghost?: Keypoint[]
) {
	const g = canvas.getContext('2d')!,
		scale = 4;
	canvas.width = image.w * scale;
	canvas.height = image.h * scale;
	g.fillStyle = colors().background;
	g.fillRect(0, 0, canvas.width, canvas.height);
	g.imageSmoothingEnabled = false;
	const small = new OffscreenCanvas(image.w, image.h);
	small
		.getContext('2d')!
		.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.w, image.h), 0, 0);
	g.globalAlpha = 0.45;
	g.drawImage(small, 0, 0, canvas.width, canvas.height);
	g.globalAlpha = 1;
	const map = (k: Keypoint[]) =>
		Object.fromEntries(
			Object.entries(enriched(k)).map(([l, p]) => [
				l,
				{ x: p.x * canvas.width, y: p.y * canvas.height }
			])
		);
	if (ghost) {
		g.globalAlpha = 0.25;
		lines(g, map(ghost));
		g.globalAlpha = 1;
	}
	lines(g, map(keypoints), selected);
}
export function drawRig3(canvas: HTMLCanvasElement, points: Pose3, bind: Pose3, azimuth: number) {
	canvas.width = 320;
	canvas.height = 280;
	const g = canvas.getContext('2d')!,
		cam = motionCamera('south', 20, azimuth),
		c = colors();
	g.fillStyle = c.background;
	g.fillRect(0, 0, 320, 280);
	const radius = Math.max(...Object.values(bind).map((p) => length3(sub3(p, bind.PELVIS)))),
		scale = 110 / radius;
	const projected = Object.fromEntries(
		Object.entries(points).map(([l, p]) => {
			const d = sub3(p, points.PELVIS);
			return [l, { x: 160 + dot3(d, cam.right) * scale, y: 135 - dot3(d, cam.up) * scale }];
		})
	);
	lines(g, projected);
}
export function drawPuppet(
	canvas: HTMLCanvasElement,
	image: Img,
	reference: Keypoint[],
	pose: Keypoint[]
) {
	const before = enriched(reference),
		after = enriched(pose),
		edges = MOTION_EDGES,
		parts = edges.map(() => new Uint8ClampedArray(image.data.length));
	const segmentDistance = (x: number, y: number, a: Keypoint, b: Keypoint) => {
		const ax = a.x * image.w,
			ay = a.y * image.h,
			dx = (b.x - a.x) * image.w,
			dy = (b.y - a.y) * image.h,
			t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
		return Math.hypot(x - ax - t * dx, y - ay - t * dy);
	};
	for (let y = 0; y < image.h; y++)
		for (let x = 0; x < image.w; x++) {
			const p = (y * image.w + x) * 4;
			if (!image.data[p + 3]) continue;
			let best = edges.findIndex(([, b]) => b === 'HEAD'),
				distance = Infinity;
			if (y > before.NECK.y * image.h)
				for (let i = 0; i < edges.length; i++) {
					const [a, b] = edges[i],
						d = segmentDistance(x, y, before[a], before[b]);
					if (d < distance) {
						distance = d;
						best = i;
					}
				}
			parts[best].set(image.data.subarray(p, p + 4), p);
		}
	const scale = 4;
	canvas.width = image.w * scale;
	canvas.height = image.h * scale;
	const g = canvas.getContext('2d')!;
	g.fillStyle = colors().background;
	g.fillRect(0, 0, canvas.width, canvas.height);
	g.imageSmoothingEnabled = false;
	const order = edges
		.map((_, i) => i)
		.sort((a, b) => {
			const z = (i: number) => {
				const point = pose.find((p) => p.label === edges[i][1]) as
					(Keypoint & { depth?: number }) | undefined;
				return point?.depth ?? 128;
			};
			return z(a) - z(b);
		});
	for (const i of order) {
		const [a, b] = edges[i],
			p = before[a],
			q = before[b],
			u = after[a],
			v = after[b],
			angle =
				Math.atan2((v.y - u.y) * image.h, (v.x - u.x) * image.w) -
				Math.atan2((q.y - p.y) * image.h, (q.x - p.x) * image.w);
		const part = new OffscreenCanvas(image.w, image.h);
		part
			.getContext('2d')!
			.putImageData(new ImageData(new Uint8ClampedArray(parts[i]), image.w, image.h), 0, 0);
		g.save();
		g.scale(scale, scale);
		g.translate(u.x * image.w, u.y * image.h);
		g.rotate(angle);
		g.translate(-p.x * image.w, -p.y * image.h);
		g.drawImage(part, 0, 0);
		g.restore();
	}
}
