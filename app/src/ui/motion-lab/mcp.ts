// Development-only, direct browser MCP inspection. Credentials and session headers stay in memory.
import { runCustomTest, customRequest } from './custom-test.ts';
interface RpcReply {
	jsonrpc: string;
	id?: number;
	result?: unknown;
	error?: { message?: string };
}
export interface McpTool {
	name: string;
	description?: string;
	inputSchema: {
		properties?: Record<string, { description?: string; [key: string]: unknown }>;
		[key: string]: unknown;
	};
}
export interface CustomMotionRequest {
	character_id: string;
	mode: 'skeleton-v3';
	animation_name: string;
	action_description: string;
	directions: ('south' | 'east')[];
	frame_count: 8;
	move: Record<string, unknown>;
	poses: Record<string, unknown>[];
}
export function mcpReply(text: string, id: number): unknown {
	const replies: RpcReply[] = text.trim().startsWith('{')
		? [JSON.parse(text)]
		: text.split(/\r?\n\r?\n/).flatMap((event) => {
				const data = event
					.split(/\r?\n/)
					.filter((line) => line.startsWith('data:'))
					.map((line) => line.slice(5).trimStart())
					.join('\n');
				return data ? [JSON.parse(data)] : [];
			});
	const reply = replies.find((r) => r.id === id);
	if (!reply) throw new Error('MCP response has no matching request ID.');
	if (reply.error) throw new Error(reply.error.message ?? 'MCP request failed.');
	if (!Object.hasOwn(reply, 'result')) throw new Error('MCP response has no result.');
	return reply.result;
}
export function browserMcp(key: string, send: typeof fetch = fetch) {
	if (!key) throw new Error('Connect the localhost agent session first.');
	let id = 0,
		session: string | null = null,
		protocol = '2025-03-26',
		animationFields: string[] = [];
	const clean = (value: unknown): unknown =>
		typeof value === 'string'
			? value.replaceAll(key, '[redacted]')
			: Array.isArray(value)
				? value.map(clean)
				: value && typeof value === 'object'
					? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]))
					: value;
	async function request(method: string, params?: unknown, notification = false) {
		const current = ++id,
			response = await send('https://api.pixellab.ai/mcp', {
				method: 'POST',
				credentials: 'omit',
				redirect: 'error',
				headers: {
					Authorization: 'Bearer ' + key,
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream',
					...(session ? { 'Mcp-Session-Id': session } : {}),
					...(method === 'initialize' ? {} : { 'MCP-Protocol-Version': protocol })
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					...(notification ? {} : { id: current }),
					method,
					...(params ? { params } : {})
				}),
				signal: AbortSignal.timeout(45000)
			});
		if (!response.ok)
			throw new Error(`PixelLab MCP returned HTTP ${response.status}. No request was resent.`);
		session = response.headers.get('mcp-session-id') ?? session;
		if (notification) {
			await response.body?.cancel();
			return null;
		}
		try {
			return clean(mcpReply(await response.text(), current));
		} catch (e) {
			throw new Error(String((e as Error).message).replaceAll(key, '[redacted]'));
		}
	}
	function validateMotion(args: CustomMotionRequest) {
		if (!animationFields.length || Object.keys(args).some((k) => !animationFields.includes(k)))
			throw new Error('Custom fields must match the inspected live MCP schema.');
		if (
			args.mode !== 'skeleton-v3' ||
			args.frame_count !== 8 ||
			args.directions.length !== 2 ||
			new Set(args.directions).size !== 2 ||
			args.directions.some((d) => d !== 'south' && d !== 'east') ||
			args.poses.length !== 8 ||
			!args.move
		)
			throw new Error('This controlled custom test requires eight poses and south/east only.');
	}
	return {
		validateMotion,
		async animateMotion(args: CustomMotionRequest) {
			validateMotion(args);
			return request('tools/call', { name: 'animate_character', arguments: args });
		},
		async inspect() {
			const initialized = (await request('initialize', {
				protocolVersion: protocol,
				capabilities: {},
				clientInfo: { name: 'pixeldoll-motion-lab', version: 'research' }
			})) as { protocolVersion?: string };
			protocol = initialized.protocolVersion ?? protocol;
			await request('notifications/initialized', undefined, true);
			const tools = (await request('tools/list')) as { tools: McpTool[] };
			if (!Array.isArray(tools.tools)) throw new Error('MCP did not return a tool catalog.');
			animationFields = Object.keys(
				tools.tools.find((t) => t.name === 'animate_character')?.inputSchema.properties ?? {}
			);
			return {
				initialized,
				tools: tools.tools.filter((t) =>
					[
						'animate_character',
						'list_characters',
						'get_character',
						'get_balance',
						'get_image'
					].includes(t.name)
				)
			};
		},
		async read(
			name: 'list_characters' | 'get_character' | 'get_balance',
			args: Record<string, unknown>
		) {
			if (!['list_characters', 'get_character', 'get_balance'].includes(name))
				throw new Error('Only read-only MCP tools are enabled here.');
			return request('tools/call', { name, arguments: args });
		},
		// The deployed schema documents this exact no-poses call as free authoring instructions.
		async instructions(characterId: string) {
			if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(characterId))
				throw new Error('Enter a managed character UUID.');
			return request('tools/call', {
				name: 'animate_character',
				arguments: {
					character_id: characterId,
					mode: 'skeleton-v3',
					action_description:
						'A stationary one-handed overhead sword strike with both feet planted, then return to guard.',
					directions: ['south'],
					frame_count: 8
				}
			});
		},
		async compare() {
			if (
				!animationFields.length ||
				Object.keys(customRequest()).some((k) => !animationFields.includes(k))
			)
				throw new Error('Comparison fields must match the inspected live MCP schema.');
			return runCustomTest((args) =>
				request('tools/call', { name: 'animate_character', arguments: args })
			);
		}
	};
}
