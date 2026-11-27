import type { Engine } from '../lib/store/manifest.ts';

export const exportFormatNames = {
	godot: 'Godot',
	unity: 'Unity',
	phaser: 'Phaser',
	phaserae: 'Phaser',
	gdevelop: 'GDevelop',
	rpgmaker: 'RPG Maker',
	rpgmakerxp: 'RPG Maker',
	aseprite: 'Aseprite',
	generic: 'PNG + JSON'
} satisfies Record<Engine, string>;
