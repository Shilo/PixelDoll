import { expect, test } from 'vitest';
import { keyForms, sanitize } from '../../src/lib/debug/sanitize.ts';

const key = 'pl_test+key/with=signs';
const forms = keyForms([key, '', null]);

test('a debugging backup never carries a PixelLab key in any spelling', () => {
	const value = {
		message: `request failed for ${key}`,
		escaped: JSON.stringify({ k: `"${key}"` }),
		url: `https://example.test/?k=${encodeURIComponent(key)}`,
		nested: [{ deeper: new Error(`bad ${key}`) }],
		authorization: 'Bearer something',
		apiKey: 'anything'
	};
	const text = JSON.stringify(sanitize(value, forms));
	for (const form of forms) expect(text).not.toContain(form);
	expect(text).toContain('[PixelLab key]');
	expect(sanitize(value, forms)).toMatchObject({
		authorization: '[redacted]',
		apiKey: '[redacted]'
	});
});

test('image data, binary data and signed URL queries are replaced, IDs and prompts are kept', () => {
	const clean = sanitize(
		{
			image: `data:image/png;base64,${'A'.repeat(5000)}`,
			base64: 'QUJD'.repeat(1000),
			blob: new Blob([new Uint8Array(10)], { type: 'image/png' }),
			bytes: new Uint8Array(4),
			signed: 'https://cdn.example.test/a/b.png?X-Signature=abc&Expires=1',
			id: 'rig-abc',
			hash: `sha256:${'a'.repeat(64)}`,
			prompt: 'a knight with a red cape',
			when: new Date(0),
			map: new Map([['k', 1]]),
			skip: () => 1
		},
		forms
	);
	expect(clean).toEqual({
		image: '[data URL, 5022 characters]',
		base64: '[base64, 4000 characters]',
		blob: '[blob image/png, 10 bytes]',
		bytes: '[4 bytes]',
		signed: 'https://cdn.example.test/a/b.png?[query removed]',
		id: 'rig-abc',
		hash: `sha256:${'a'.repeat(64)}`,
		prompt: 'a knight with a red cape',
		when: '1970-01-01T00:00:00.000Z',
		map: [['k', 1]]
	});
});

test('a value shared by two branches is written twice; only a cycle is cut', () => {
	const shared = { n: 1 };
	const cyclic: Record<string, unknown> = { shared, again: shared };
	cyclic.self = cyclic;
	expect(sanitize(cyclic, [])).toEqual({ shared: { n: 1 }, again: { n: 1 }, self: '[circular]' });
});

test('the debug log removes a key this tab used even after it was replaced', async () => {
	const { readDebugLog, recordDebug, rememberDebugKey } =
		await import('../../src/lib/debug/log.ts');
	rememberDebugKey('old-key-1234567890');
	rememberDebugKey('new-key-0987654321');
	recordDebug('error', 'test', [
		'request with old-key-1234567890 failed',
		{ token: 'other-secret', status: 401 }
	]);
	const { entries } = await readDebugLog();
	const text = JSON.stringify(entries.filter((entry) => entry.source === 'test'));
	expect(text).toContain('[PixelLab key]');
	expect(text).toContain('401');
	expect(text).not.toMatch(/old-key-1234567890|other-secret/);
});
