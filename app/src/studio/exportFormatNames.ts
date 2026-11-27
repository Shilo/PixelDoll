import type { Engine } from '../lib/store/manifest.ts';

export const exportFormatNames = {
	godot: 'Godot',
	unity: 'Unity',
	phaser: 'Phaser',
	'phaser-ae': 'Phaser',
	gdevelop: 'GDevelop',
	'rpg-maker': 'RPG Maker',
	'rpg-maker-xp': 'RPG Maker',
	aseprite: 'Aseprite',
	generic: 'PNG + JSON'
} satisfies Record<Engine, string>;
