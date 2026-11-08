// Rasterize the existing vector brand, with a separate opaque, safe-area maskable icon. No external images or fonts.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const output = new URL('../public/icons/pwa/', import.meta.url);
mkdirSync(output, { recursive: true });
const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	for (const [name, size, fraction, opaque] of [
		['icon-192.png', 192, 0.78, false],
		['icon-512.png', 512, 0.78, false],
		['maskable-512.png', 512, 0.56, true],
		['apple-touch-icon.png', 180, 0.7, true],
		['favicon-32.png', 32, 0.9, false]
	]) {
		const data = await page.evaluate(
			async ({ svg, size, fraction, opaque }) => {
				const canvas = document.createElement('canvas');
				canvas.width = canvas.height = size;
				const context = canvas.getContext('2d');
				if (!context) throw new Error('A canvas context is required to generate icons');
				if (opaque) {
					context.fillStyle = '#121214';
					context.fillRect(0, 0, size, size);
				}
				const image = new Image();
				image.src = 'data:image/svg+xml;base64,' + btoa(svg);
				await image.decode();
				const width = size * fraction,
					height = (width * 46) / 48;
				context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
				return canvas.toDataURL('image/png').split(',')[1];
			},
			{ svg, size, fraction, opaque }
		);
		writeFileSync(new URL(name, output), Buffer.from(data, 'base64'));
	}
	// Modern ICO readers support an embedded PNG. Keep the existing SVG as the scalable primary favicon.
	const png = readFileSync(new URL('favicon-32.png', output));
	const header = Buffer.alloc(22);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(1, 4);
	header[6] = header[7] = 32;
	header.writeUInt16LE(1, 10);
	header.writeUInt16LE(32, 12);
	header.writeUInt32LE(png.length, 14);
	header.writeUInt32LE(22, 18);
	writeFileSync(new URL('favicon.ico', output), Buffer.concat([header, png]));
} finally {
	await browser.close();
}
