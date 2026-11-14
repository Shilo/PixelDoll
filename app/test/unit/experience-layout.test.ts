import { describe, expect, test } from 'vitest';
import { actorScale } from '../../src/studio/experience/bounds.ts';
import {
	EYE,
	heroRoom,
	heroScale,
	layout,
	placeWorld,
	ringRise
} from '../../src/studio/experience/geometry.ts';
import { worldArt } from '../../src/studio/experience/config.ts';
import { projection } from '../../src/studio/experience/ground.ts';

describe('conservative floor ring rise', () => {
	test('uses visible standing height and rounds down only in device pixels', () => {
		expect(ringRise(64, 1, 20)).toBe(2);
		expect(ringRise(48, 1, 20)).toBe(1);
		expect(ringRise(48, 1, 20, 2)).toBe(1.5);
		expect(ringRise(16, 0.5, 20, 2)).toBe(0);
		expect(ringRise(63, 2, 20)).toBe(3);
		expect(ringRise(64, 2, 20)).toBe(4);
	});

	test('caps the rise at half the ellipse depth without forcing a minimum', () => {
		expect(ringRise(256, 4, 7, 2)).toBe(3.5);
		expect(ringRise(64, 2, 0.5)).toBe(0);
		expect(ringRise(0, 2, 20)).toBe(0);
	});

	for (const density of [1, 1.5, 2])
		for (const scale of [0.35, 1, 1.75, 4.2])
			test(`preserves conservative bounds and upscale equivalence at ${density} DPR, ${scale} scale`, () => {
				const rise = ringRise(63, scale, 9, density);
				expect(rise).toBeGreaterThanOrEqual(0);
				expect(rise).toBeLessThanOrEqual((63 * scale) / 32);
				expect(rise).toBeLessThanOrEqual(4.5);
				expect(rise * density).toBeCloseTo(Math.round(rise * density));
				expect(ringRise(126, scale / 2, 9, density)).toBe(rise);
			});
});

describe('immersive stage frame fitting', () => {
	for (const frame of [
		{ w: 96, h: 96, x: 48, y: 80 },
		{ w: 256, h: 256, x: 128, y: 252 },
		{ w: 384, h: 192, x: 300, y: 100 }
	]) {
		test(`complete ${frame.w}×${frame.h} frame stays inside a short phone stage`, () => {
			const room = { above: 57, side: 148, below: 17 },
				scale = actorScale(frame, room);
			expect(scale).toBeGreaterThan(0);
			expect(frame.x * scale).toBeLessThanOrEqual(room.side + 0.001);
			expect((frame.w - frame.x) * scale).toBeLessThanOrEqual(room.side + 0.001);
			expect(frame.y * scale).toBeLessThanOrEqual(room.above + 0.001);
			expect((frame.h - frame.y) * scale).toBeLessThanOrEqual(room.below + 0.001);
		});
	}
	test('uses integer physical pixel scale when sufficient space exists', () => {
		const density = 1.5,
			scale = actorScale(
				{ w: 96, h: 96, x: 48, y: 80 },
				{ above: 400, side: 450, below: 120 },
				density
			);
		expect(Number.isInteger(scale * density)).toBe(true);
	});
});

const SIZES = [
	[1920, 1080],
	[2560, 1080],
	[1440, 900],
	[1280, 720],
	[1024, 768],
	[768, 1024],
	[390, 844],
	[844, 390],
	[320, 568],
	[320, 400],
	[568, 320],
	[3840, 1080],
	[1000, 250],
	[200, 600],
	[240, 240]
] as const;

describe('scene geometry', () => {
	for (const height of [54, 100, 146, 192])
		test(`reserves a measured ${height}px playback bar without moving its bottom edge`, () => {
			for (const [width, viewportHeight] of [
				[500, 700],
				[1000, 700],
				[844, 390]
			]) {
				const before = layout(width, viewportHeight, 'studio');
				const after = layout(width, viewportHeight, 'studio', height);
				expect(after.playbackHeight).toBe(height);
				expect(after.playbackTop + after.playbackHeight).toBe(
					before.playbackTop + before.playbackHeight
				);
				expect(after.feet.y).toBe(before.feet.y - (height - before.playbackHeight));
				expect(after.stage).toEqual(before.stage);
				expect(heroRoom(after).above).toBeLessThanOrEqual(heroRoom(before).above);
			}
		});

	test('unmeasured controls and hidden Preview controls use the single-row baseline', () => {
		expect(layout(500, 700, 'studio', 0)).toEqual(layout(500, 700, 'studio'));
		expect(layout(500, 700, 'characters', 146)).toEqual(layout(500, 700, 'characters'));
	});

	test('hides an unusable short-phone sheet rather than covering wrapped controls', () => {
		const before = layout(320, 400, 'studio');
		const wrapped = layout(320, 400, 'studio', 146);
		expect(before.sheetHeight).toBe(200);
		expect(wrapped.sheet).toBe(true);
		expect(wrapped.sheetHeight).toBe(0);
		expect(wrapped.stage.r).toBe(before.stage.r);
		expect(wrapped.playbackTop + wrapped.playbackHeight).toBeLessThanOrEqual(400);
		expect(wrapped.feet.y).toBeGreaterThan(wrapped.stage.t);
	});

	for (const [w, h] of SIZES)
		for (const screen of ['studio', 'characters'] as const)
			for (const theme of ['dark', 'light'] as const)
				test(`${w}×${h} ${screen} ${theme}: horizon on the eye line, vanishing line on the character, no gaps`, () => {
					const g = layout(w, h, screen),
						art = worldArt(theme);
					expect(g.stage.r - g.stage.l).toBeGreaterThan(0);
					expect(g.feet.y).toBeGreaterThan(g.stage.t);
					expect(g.feet.y).toBeLessThanOrEqual(g.stage.b);
					if (screen === 'studio') expect(g.feet.y).toBeLessThan(g.playbackTop);
					const hero = 50 * heroScale(g, 50, 48),
						p = placeWorld(g, art, g.feet, hero);
					// One scale for both axes: the image is never stretched.
					const width = p.scale * art.width,
						height = p.scale * art.height;
					expect(width / height).toBeCloseTo(art.width / art.height, 9);
					// The image horizon sits on the character's eye line.
					expect(p.eye).toBeCloseTo(g.feet.y - EYE * hero, 6);
					expect(p.y + p.scale * art.horizon * art.height).toBeCloseTo(p.eye, 6);
					// No gap: it covers the viewport width from the top down to the covered bottom.
					expect(p.x).toBeLessThanOrEqual(0);
					expect(p.y).toBeLessThanOrEqual(0.001);
					expect(p.x + width).toBeGreaterThanOrEqual(w - 0.001);
					expect(p.y + height).toBeGreaterThanOrEqual(p.coverBottom - 0.001);
					expect(p.coverBottom).toBe(g.sheet && screen === 'studio' ? g.sheetTop + 24 : h);
					// The vanishing line (image x 0.5) stays on the character unless that needs over 1.3x; then the
					// image is clamped to the viewport edge on the far side instead.
					if (p.centered) expect(p.x + 0.5 * width).toBeCloseTo(g.feet.x, 6);
					else expect(p.x === 0 || Math.abs(p.x + width - w) < 0.001).toBe(true);
				});

	for (const [w, h] of SIZES)
		test(`${w}×${h} at DPR 2: the hero scale is whole device pixels and stays inside its room`, () => {
			const g = layout(w, h, 'studio'),
				room = heroRoom(g),
				frame = { w: 64, h: 64, x: 32, y: 62 },
				scale = actorScale(frame, room, 2);
			expect(scale).toBeGreaterThan(0);
			if (scale * 2 >= 1) expect(Number.isInteger(scale * 2)).toBe(true);
			expect(frame.y * scale).toBeLessThanOrEqual(room.above + 0.001);
			expect(g.feet.y - frame.y * scale).toBeGreaterThanOrEqual(g.stage.t);
		});

	test('the world scale and position change continuously while the window is resized', () => {
		// Before: past the 1.3x limit the scale dropped back to the base, so the world jumped near 1250 px at short heights.
		for (const h of [400, 500, 540, 720, 900])
			for (const theme of ['dark', 'light'] as const) {
				const art = worldArt(theme);
				let last: { scale: number; x: number; w: number } | null = null;
				for (let w = 900; w <= 1700; w += 1) {
					const g = layout(w, h, 'studio'),
						prev = layout(w - 1, h, 'studio');
					// Layout breakpoints (sheet, margins, rail width) step on purpose; the world must not jump between them.
					if (prev.sheet !== g.sheet || prev.edge !== g.edge || Math.abs(prev.rail - g.rail) > 1)
						last = null;
					const hero = 50 * heroScale(g, 50, 48);
					// A whole-pixel hero step changes the eye line on purpose; compare only within one step.
					if (50 * heroScale(prev, 50, 48) !== hero) last = null;
					const p = placeWorld(g, art, g.feet, hero);
					if (last) {
						expect(Math.abs(p.scale - last.scale) / last.scale, `${w}×${h} scale`).toBeLessThan(
							0.01
						);
						expect(Math.abs(p.x - last.x), `${w}×${h} x`).toBeLessThan(4);
					}
					last = { scale: p.scale, x: p.x, w };
				}
			}
	});

	test('a window too short for a bottom sheet never gets an unusable panel, and the bar stays between the tabs and the feet', () => {
		for (const [w, h] of [
			[240, 240],
			[320, 240],
			[400, 240],
			[568, 320],
			[600, 300],
			[320, 400],
			[1000, 200],
			[1000, 250],
			[390, 200],
			[568, 200]
		] as const)
			for (const screen of ['studio', 'characters'] as const) {
				const g = layout(w, h, screen),
					at = `${w}×${h} ${screen}`;
				expect(g.sheetTop, at).toBeLessThanOrEqual(h);
				expect(g.stage.r - g.stage.l, at).toBeGreaterThan(0);
				expect(g.feet.y, at).toBeGreaterThan(g.stage.t);
				// A sheet is tall enough to use or hidden (0) until the window grows; never a 1-199 px sliver.
				if (g.sheet) expect(g.sheetHeight === 0 || g.sheetHeight >= 200, at).toBe(true);
				else expect(g.sheetHeight, at).toBe(0);
				if (screen !== 'studio') continue;
				// The playback bar starts below the header and the phone's floating view tabs (the stage top), ends inside
				// the window and above any sheet, and the feet stand above it.
				expect(g.playbackTop, at).toBeGreaterThanOrEqual(g.stage.t);
				expect(g.playbackTop + g.playbackHeight, at).toBeLessThanOrEqual(g.sheetTop);
				expect(g.feet.y, at).toBeLessThan(g.playbackTop);
			}
		// A phone held sideways gets the side rail rather than a 70 px sheet.
		expect(layout(568, 320, 'studio').sheet).toBe(false);
		expect(layout(320, 400, 'studio').sheetHeight).toBe(200);
		// 320×240 has no room for a usable sheet under the stage, so the panel hides.
		expect(layout(320, 240, 'studio').sheetHeight).toBe(0);
	});

	test('the playback bar is always one row; stages under 300 px cycle facing with one button', () => {
		for (const [w, h] of SIZES) {
			const g = layout(w, h, 'studio');
			expect(g.playbackHeight).toBe(54);
			expect(g.cycleFacing, `${w}×${h}`).toBe(g.stage.r - g.stage.l < 300);
		}
		expect(layout(568, 320, 'studio').cycleFacing).toBe(true);
		expect(layout(320, 568, 'studio').cycleFacing).toBe(false);
	});

	test('Characters fills the same share of the free height on ultrawide as on 1920×1080', () => {
		const share = (w: number, h: number) => {
			const g = layout(w, h, 'characters');
			return { scale: heroScale(g, 50, 48), free: g.feet.y - g.stage.t };
		};
		const wide = share(2560, 1080);
		expect(wide.scale).toBe(share(1920, 1080).scale);
		// The height term limits it (a whole-pixel floor of 60% of the room above the feet), never the width.
		expect((50 * wide.scale) / wide.free).toBeGreaterThan(0.54);
	});

	test('the vanishing line stays on the character except beside a short landscape rail', () => {
		const shifted = SIZES.filter(([w, h]) => {
			const g = layout(w, h, 'studio');
			return !placeWorld(g, worldArt('dark'), g.feet, 50 * heroScale(g, 50, 48)).centered;
		});
		// Short landscape rails (844×390, 568×320, 1000×250): the character stands far left of the window center beside the
		// rail; centering would need >1.3x.
		expect(shifted).toEqual([
			[844, 390],
			[568, 320],
			[1000, 250]
		]);
	});

	test('panel rules: sheets on phones and portrait tablets, a rail beside short landscape', () => {
		expect(layout(390, 844, 'studio').sheet).toBe(true);
		expect(layout(768, 1024, 'studio').sheet).toBe(true);
		expect(layout(844, 390, 'studio').sheet).toBe(false);
		expect(layout(1024, 768, 'studio').sheet).toBe(false);
		expect(layout(1920, 1080, 'studio').edge).toBe(32);
		expect(layout(1440, 900, 'studio').rail).toBeCloseTo(475.2);
		expect(layout(2560, 1080, 'studio').rail).toBe(480);
		expect(layout(1024, 768, 'studio').rail).toBe(320);
	});

	test('a short phone uses the sheet, so the stage never has a negative width', () => {
		for (const [w, h] of [
			[320, 400],
			[360, 480],
			[600, 500]
		] as const) {
			const g = layout(w, h, 'studio');
			expect(g.sheet).toBe(true);
			expect(g.stage.r - g.stage.l).toBe(w);
			expect(g.sheetTop).toBeGreaterThan(g.stage.t);
		}
	});

	for (const [w, h] of [
		[320, 568],
		[568, 320]
	] as const)
		test(`${w}×${h} keeps a 2x whole-pixel hero with grounded feet`, () => {
			const g = layout(w, h, 'studio'),
				// The demo's painted outfit stands about 62 px above its pivot in a 64 px frame.
				scale = actorScale({ w: 64, h: 64, x: 32, y: 62 }, heroRoom(g));
			expect(scale).toBeGreaterThanOrEqual(2);
			expect(g.feet.y).toBeLessThan(g.playbackTop);
			expect(g.feet.y).toBeLessThan(g.sheetTop);
			// The whole hero stays below the header and the floating view tabs.
			expect(g.feet.y - 62 * scale).toBeGreaterThanOrEqual(g.stage.t);
			const p = placeWorld(g, worldArt('dark'), g.feet, 62 * scale);
			expect(p.eye).toBeLessThan(g.feet.y);
			expect(p.coverBottom).toBeGreaterThan(g.feet.y);
		});

	test('side-scroller floor horizon sits on the eye line', () => {
		const g = layout(1440, 900, 'studio'),
			eye = placeWorld(g, worldArt('dark'), g.feet, 400).eye;
		const p = projection({
			width: 1440,
			height: 900,
			dpr: 1,
			theme: 'dark',
			mode: 'side',
			anchor: g.feet,
			camera: { x: 0, y: 0 },
			eye
		});
		expect(p.horizon).toBeCloseTo(eye, 6);
	});
});
