import obsidian from '../round-5-mockups/assets/obsidian-stage.png?url';
import porcelain from '../round-5-mockups/assets/porcelain-stage.png?url';
import { APPEARANCES } from './theme.mjs';
// Scene identity is the URL, not the screen. Selection and Preview retain one decoded image.
// Live floors deliberately share their theme's Preview material, with different projections.
export const THEMES = {
    obsidian: { backgrounds: { selection: obsidian, creation: obsidian, preview: obsidian, topdown: obsidian, side: obsidian }, ...APPEARANCES.obsidian.world, horizon: .53, sample: [.58, .82, .055, .055] },
    porcelain: { backgrounds: { selection: porcelain, creation: porcelain, preview: porcelain, topdown: porcelain, side: porcelain }, ...APPEARANCES.porcelain.world, horizon: .475, sample: [.57, .82, .055, .055] }
};
// Code-only art controls; there is intentionally no reflection setting in the interface.
export const REFLECTION = { enabled: true, selection: true, preview: true, topdown: true, side: true, opacity: .12, compression: .35 };
export const MOTION = { speed: 95, cameraResponse: 9, joystickRadius: 46, deadZone: 8, tileSize: 100 };
