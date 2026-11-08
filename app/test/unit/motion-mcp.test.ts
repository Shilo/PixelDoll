import { expect, test, vi } from 'vitest';
import { browserMcp, mcpReply } from '../../src/ui/motion-lab/mcp.ts';
import {
	CUSTOM_TEST_KEY,
	runCustomTest,
	canCorrectCustomTest,
	customRequest
} from '../../src/ui/motion-lab/custom-test.ts';
test('MCP decodes matching JSON/SSE responses and rejects missing IDs and remote errors', () => {
	expect(
		mcpReply('event: message\ndata: {"jsonrpc":"2.0","id":7,"result":{"ok":true}}\n\n', 7)
	).toEqual({ ok: true });
	expect(() => mcpReply('{"jsonrpc":"2.0","id":8,"result":{}}', 7)).toThrow('matching request');
	expect(() => mcpReply('{"jsonrpc":"2.0","id":7,"error":{"message":"refused"}}', 7)).toThrow(
		'refused'
	);
});
test('custom comparison reserves all eight remaining generations before submission and never resends unknown outcomes', async () => {
	const saved = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => saved.get(k) ?? null,
		setItem: (k: string, v: string) => saved.set(k, v)
	});
	vi.stubGlobal('navigator', {
		locks: { request: async (_key: string, run: () => Promise<unknown>) => run() }
	});
	try {
		const submit = vi.fn(async (args) => {
			expect(JSON.parse(saved.get(CUSTOM_TEST_KEY)!).reserved).toBe(8);
			expect(args.directions).toEqual(['south', 'east']);
			expect(args.poses).toHaveLength(8);
			expect(
				args.poses.every(
					(p: { right_foot: number[]; left_foot: number[] }) =>
						p.right_foot.every((n) => n === 0) && p.left_foot.every((n) => n === 0)
				)
			).toBe(true);
			throw new Error('uncertain transport');
		});
		await expect(runCustomTest(submit)).rejects.toThrow('uncertain transport');
		expect(JSON.parse(saved.get(CUSTOM_TEST_KEY)!).status).toBe('unknown');
		await expect(runCustomTest(submit)).rejects.toThrow('will not be resent');
		expect(submit).toHaveBeenCalledTimes(1);
	} finally {
		vi.unstubAllGlobals();
	}
});
test('only the exact pre-dispatch seed validation refusal permits an explicit corrected submission', () => {
	const row = {
		reserved: 8,
		status: 'receipt',
		at: 'test',
		request: { ...customRequest(), seed: 7 },
		result: {
			isError: true,
			content: [
				{
					type: 'text',
					text: '1 validation error for call[animate_character]\nseed\n  Unexpected keyword argument'
				}
			]
		}
	};
	expect(canCorrectCustomTest(row)).toBe(true);
	expect(canCorrectCustomTest({ ...row, status: 'unknown' })).toBe(false);
	expect(canCorrectCustomTest({ ...row, request: customRequest() })).toBe(false);
	expect(
		canCorrectCustomTest({
			...row,
			result: { isError: true, content: [{ type: 'text', text: 'server error' }] }
		})
	).toBe(false);
});
test('read-only MCP inspection keeps session headers private and redacts a reflected credential', async () => {
	const requests: RequestInit[] = [];
	const send = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
		requests.push(init!);
		const request = JSON.parse(init!.body as string);
		if (request.method === 'notifications/initialized') return new Response(null, { status: 202 });
		return new Response(
			JSON.stringify({
				jsonrpc: '2.0',
				id: request.id,
				result:
					request.method === 'initialize'
						? { protocolVersion: '2025-03-26', echo: 'synthetic-secret' }
						: {
								tools: [
									{ name: 'animate_character', inputSchema: {} },
									{ name: 'unrelated', inputSchema: {} }
								]
							}
			}),
			{ headers: { 'Content-Type': 'application/json', 'mcp-session-id': 'private-session' } }
		);
	});
	const client = browserMcp('synthetic-secret', send as typeof fetch),
		result = await client.inspect();
	expect(result.tools.map((t) => t.name)).toEqual(['animate_character']);
	expect(JSON.stringify(result)).not.toContain('synthetic-secret');
	expect(JSON.stringify(result)).not.toContain('private-session');
	expect(requests[1].headers).toMatchObject({ 'Mcp-Session-Id': 'private-session' });
	await expect(client.read('delete_character' as 'get_character', {})).rejects.toThrow('read-only');
	expect(send).toHaveBeenCalledTimes(3);
});
test('custom authoring instructions cannot carry poses, moves, templates or extra directions', async () => {
	const send = vi.fn(
		async (_url: RequestInfo | URL, _init?: RequestInit) =>
			new Response('{"jsonrpc":"2.0","id":1,"result":{}}')
	);
	const client = browserMcp('synthetic-secret', send as typeof fetch);
	await expect(client.instructions('invalid')).rejects.toThrow('UUID');
	expect(send).not.toHaveBeenCalled();
	await client.instructions('00000000-0000-4000-8000-000000000001');
	const body = JSON.parse(send.mock.calls[0][1]!.body as string);
	expect(body).toMatchObject({
		method: 'tools/call',
		params: {
			name: 'animate_character',
			arguments: { mode: 'skeleton-v3', directions: ['south'], frame_count: 8 }
		}
	});
	expect(Object.keys(body.params.arguments).sort()).toEqual([
		'action_description',
		'character_id',
		'directions',
		'frame_count',
		'mode'
	]);
});
