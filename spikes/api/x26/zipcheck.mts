// E0b (free): does PixelLab's character ZIP carry per-frame keypoints for managed skeleton-v3 / pixminimax animations?
import fs from 'node:fs';
import { OUT } from './lib.mts';
const id = JSON.parse(fs.readFileSync(`${OUT}/import_skin.json`, 'utf8')).res.character_id;
const key = process.env.PIXELLAB_API_KEY_AGENT_DEV!;
const r = await fetch(`https://api.pixellab.ai/v2/characters/${id}/zip`, { headers: { authorization: `Bearer ${key}` } });
console.log('zip status', r.status, r.headers.get('content-type'));
const buf = Buffer.from(await r.arrayBuffer());
fs.mkdirSync(`${OUT}/zip`, { recursive: true });
fs.writeFileSync(`${OUT}/zip/character.zip`, buf);
console.log('bytes', buf.length, buf.subarray(0, 2).toString());
