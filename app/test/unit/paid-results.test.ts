import { expect, test } from 'vitest';
import { paidResultsZip } from '../../src/lib/pixellab/paid-results.ts';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';
import { blockingIssues, PreflightWarning } from '../../src/lib/message.ts';
import { sizeErrors } from '../../src/studio/characterConfig.ts';

test('a paid-results download holds the returned images and sanitized requests, never a credential', async () => {
	const record = {
		id: 'motion-east',
		label: 'walk east (motion)',
		method: 'POST',
		endpoint: '/characters/animations',
		params: { seed: 4, headers: { Authorization: 'Bearer secret-token' }, token: 'secret-token' },
		inputs: [],
		requestHash: 'h',
		state: 'done',
		attempts: 1,
		nextAt: 0,
		createdAt: 0,
		gens: 3,
		usd: 0,
		jobs: [
			{
				id: 'remote',
				status: 'completed',
				done: true,
				results: [
					{ label: 'east/1', sha: 'b' },
					{ label: 'east/0', sha: 'a' }
				]
			}
		]
	} as JobRec;
	const blobs = new Map([
		['a', new Blob([new Uint8Array([1])])],
		['b', new Blob([new Uint8Array([2])])]
	]);
	const entries = await paidResultsZip([record], async (sha) => blobs.get(sha));
	expect(entries.map((entry) => entry.name)).toEqual([
		'01-characters-animations/east-0.png',
		'01-characters-animations/east-1.png',
		'requests.json'
	]);
	const json = new TextDecoder().decode(entries[2].data);
	expect(json).not.toContain('secret-token');
	expect(JSON.parse(json).requests[0]).toMatchObject({ id: 'motion-east', gens: 3 });
});

test('less room than the automatic frame warns before a creation but never blocks it once accepted', () => {
	const [issue] = sizeErrors(64, 72);
	expect(issue).toBeInstanceOf(PreflightWarning);
	expect((issue as PreflightWarning).id).toBe('frame-room');
	expect(blockingIssues([issue])).toHaveLength(1);
	expect(blockingIssues([issue], ['frame-room'])).toEqual([]);
	// A frame PixelDoll cannot hold stays a hard stop.
	expect(sizeErrors(64, 300)[0]).not.toBeInstanceOf(PreflightWarning);
});
