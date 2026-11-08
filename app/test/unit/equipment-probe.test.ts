import { expect, test, vi } from 'vitest';
import { makeImg, bytesToBase64 } from '../../src/lib/image/png.ts';
import { encodePngBytes, decodePngBytes } from '../../src/lib/image/pngraw.ts';
import { hardMaskBits } from '../../src/lib/image/hard-mask.ts';

const blobs = new Map<string, Uint8Array>(),
	jobs = new Map<string, unknown>(),
	rows = new Map<string, unknown>();
let captured: { request: { body: { mask_image: { image: { base64: string } } } } } | undefined;
const submittedRequest = () => captured;
vi.mock('../../src/lib/store/db.ts', () => ({
	get: async (_s: string, id: string) => jobs.get(id),
	getBlob: async (sha: string) =>
		blobs.has(sha) ? new Blob([blobs.get(sha)! as Uint8Array<ArrayBuffer>]) : undefined
}));
vi.mock('../../src/ui/motion-lab/run.ts', () => ({
	candidateRecord: (id: string) => rows.get(id),
	enqueueLab: async (_doc: unknown, _seed: number, request: never) => {
		captured = { request };
		return 'paid-job';
	}
}));
const { repairEquipmentProbe } = await import('../../src/ui/motion-lab/equipment.ts');
const { validateAttachment, attachmentPalmIsOpaque } =
	await import('../../src/ui/motion-lab/attachment.ts');

test.each(['off-body', 'missing', 'second-frame-off-body', 'opaque'] as const)(
	'held repair probe validates actual body contact before dispatch: %s',
	async (mode) => {
		captured = undefined;
		const store = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => void store.set(k, v)
		});
		const body = makeImg(64, 64);
		for (let y = 20; y < 60; y++)
			for (let x = 24; x < 40; x++) body.data.set([120, 90, 70, 255], (y * 64 + x) * 4); // body column only
		const bodyPng = await encodePngBytes(body),
			ref = await encodePngBytes(makeImg(112, 112));
		blobs.set('b', bodyPng);
		blobs.set('e', ref);
		blobs.set('s', ref);
		const results = Array.from({ length: 8 }, () => ({ sha: 'b' }));
		jobs.set('body', {
			state: 'done',
			endpoint: '/animate-with-skeleton-v3',
			params: { first_frame: { $blob: 'b' }, first_frame_keypoints: [], keypoints: [] },
			jobs: [{ results }]
		});
		jobs.set('dress', { state: 'done', jobs: [{ results: [{ sha: 'e' }, { sha: 's' }] }] });
		rows.set('body', {
			document: {
				fixture: { id: 'c27man', pivot: { x: 32, y: 60 } },
				direction: 'east',
				clip: { id: 'attack' },
				padding: 0
			}
		});
		rows.set('dress', {
			context: {
				kind: 'equipment-dress',
				slot: 'main_hand',
				pad: 24,
				key: 'green',
				prompt: 'a sword',
				references: { east: { sha: 'b', index: 0 }, south: { sha: 's', index: 1 } }
			}
		});
		const occluder = bytesToBase64(await encodePngBytes(makeImg(144, 144))),
			asset = makeImg(8, 8);
		asset.data.fill(255);
		const offBody = { x: 40 + 5.5, y: 40 + 5.5 }; // padded coordinates of body pixel (5,5): transparent
		const doc = {
			version: 1,
			kind: 'pixeldoll-authored-attachment',
			body: {
				jobId: 'body',
				hashes: results.map((r) => r.sha),
				cell: { w: 64, h: 64 },
				pivot: { x: 32, y: 60 },
				direction: 'east',
				padding: 40
			},
			asset: {
				png: bytesToBase64(await encodePngBytes(asset)),
				grip: { x: 4.5, y: 4.5 },
				axis: { x: 4.5, y: 0.5 }
			},
			frames: results.map(() => ({ grip: offBody, angle: -90, occluder })),
			notes: ''
		};
		if (mode === 'opaque' || mode === 'second-frame-off-body')
			for (const frame of doc.frames) frame.grip = { x: 70.5, y: 70.5 };
		if (mode === 'second-frame-off-body') doc.frames[7].grip = offBody;
		if (mode === 'missing') Reflect.deleteProperty(doc.frames[6], 'grip');
		const padded = makeImg(144, 144);
		for (let y = 0; y < 64; y++)
			for (let x = 0; x < 64; x++)
				padded.data.set(
					body.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4),
					((y + 40) * 144 + x + 40) * 4
				);
		console.log(
			'validateAttachment accepts off-body grip:',
			!!validateAttachment(structuredClone(doc), doc.body as never),
			'| opaque guard would say:',
			attachmentPalmIsOpaque(doc.frames[6] as never, padded)
		);
		store.set('pixeldoll.motionAttachment.body', JSON.stringify(doc));
		let thrown: unknown;
		try {
			await repairEquipmentProbe('body', 'dress', 11);
		} catch (e) {
			thrown = e;
		}
		console.log(
			'probe threw:',
			thrown ? (thrown as Error).message : 'no',
			'| enqueueLab (paid) called:',
			!!captured
		);
		const actual = submittedRequest();
		if (actual) {
			const mask = hardMaskBits(
				await decodePngBytes(
					Uint8Array.from(atob(actual.request.body.mask_image.image.base64), (c) => c.charCodeAt(0))
				)
			);
			console.log(
				'editable mask pixels in first cell:',
				[...mask].filter((v, p) => v && p % 448 < 112).length
			);
		}
		if (mode === 'opaque') {
			expect(thrown).toBeUndefined();
			expect(captured).toBeDefined();
		} else {
			expect(captured).toBeUndefined();
			expect(thrown).toBeInstanceOf(Error);
		}
	}
);
