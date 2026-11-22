// Connection adapters over the one tool registry (tools.ts). Both are browser-native and need no server:
// - WebMCP: tools registered on document.modelContext, discovered by WebMCP-capable agents (Playwright MCP, Chrome DevTools
//   MCP, the ChatGPT app's browser).
// - window.pixeldoll: the same tools for agents that drive the page by script (Claude in Chrome, DevTools or Playwright
//   evaluate, IDE browsers).
// Neither channel reliably hands images to the model: WebMCP results are JSON strings (Playwright MCP passes them on as text,
// measured 2026-11-22) and script results are text. So frame sheets are shown in the page, where every browser agent's
// screenshot sees them, and come back as base64 only when the agent asks (imageData).
import { AgentError, callTool, TOOLS, type Json, type Tool, type ToolResult } from './tools.ts';
import { hideEvidence, showEvidence } from './panel.svelte.ts';

/** What a failed call returns; like any call without sheets, it closes the previous ones. */
const errorData = (e: unknown) => {
	hideEvidence();
	return e instanceof AgentError
		? { error: e.message, code: e.code }
		: { error: e instanceof Error ? e.message : String(e), code: 'failed' };
};
// ---------- WebMCP ----------
interface ModelContextTool {
	name: string;
	title: string;
	description: string;
	inputSchema: object;
	annotations: { readOnlyHint: boolean; consequentialHint: boolean };
	execute(input: unknown, options?: { signal?: AbortSignal }): Promise<unknown>;
}
interface ModelContext {
	registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): Promise<void> | void;
}

/** The current draft exposes `document.modelContext`; early Chromium builds used `navigator.modelContext`. */
export function modelContext(): ModelContext | null {
	const d = document as Document & { modelContext?: ModelContext };
	const n = navigator as Navigator & { modelContext?: ModelContext };
	return d.modelContext ?? n.modelContext ?? null;
}

/** The result an agent receives: the tool's data plus a note on the sheets shown in the page, and the sheets as base64 PNG
 *  only when asked. A call without sheets closes the previous ones. */
export function present(result: ToolResult, imageData: boolean) {
	const images = result.images ?? [];
	if (images.length) showEvidence(images.map((image) => image.label).join(' | '), images);
	else hideEvidence();
	return {
		data: result.data,
		images: images.map(({ label, width, height, scale, data }) => ({
			label,
			width,
			height,
			scale,
			...(imageData ? { data } : {})
		})),
		...(images.length && !imageData ? { seeImages: SEE_IMAGES } : {})
	};
}
const SEE_IMAGES =
	'The sheets are shown over the PixelDoll page now: take a screenshot of the page to see them (rows = directions, columns = frames, whole-pixel scale). Pass imageData true to get them as base64 PNG instead.';

/** MCP-shaped result: one JSON text block, then image blocks when the agent asked for image data. Failures are returned, not
 *  thrown: WebMCP turns a rejected promise into a bare OperationError and drops the reason the agent needs. */
export async function webmcpResult(run: () => Promise<ToolResult>, imageData: boolean) {
	try {
		const shown = present(await run(), imageData);
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						...shown,
						images: shown.images.map(({ data: _data, ...meta }) => meta)
					})
				},
				...shown.images.flatMap((image) =>
					image.data ? [{ type: 'image', data: image.data, mimeType: 'image/png' }] : []
				)
			]
		};
	} catch (e) {
		return { content: [{ type: 'text', text: JSON.stringify(errorData(e)) }], isError: true };
	}
}

export function webmcpTool(tool: Tool): ModelContextTool {
	return {
		name: tool.name,
		title: tool.title,
		description: tool.description,
		inputSchema: tool.inputSchema,
		annotations: { readOnlyHint: !!tool.readOnly, consequentialHint: !!tool.consequential },
		execute: (input, options) =>
			webmcpResult(
				() => callTool(tool.name, input, options?.signal ?? new AbortController().signal),
				wantsImageData(input)
			)
	};
}

async function registerWebMcp(signal: AbortSignal): Promise<number> {
	const context = modelContext();
	if (!context) return 0;
	let registered = 0;
	for (const tool of TOOLS)
		try {
			await context.registerTool(webmcpTool(tool), { signal });
			registered++;
		} catch (e) {
			// One rejected definition (a browser on an older draft) must not hide the others.
			console.warn('PixelDoll: WebMCP did not register', tool.name, e);
		}
	return registered;
}

// ---------- window.pixeldoll ----------
const wantsImageData = (input: unknown) =>
	!!input && typeof input === 'object' && (input as { imageData?: unknown }).imageData === true;

export async function bridgeCall(name: string, args?: unknown) {
	try {
		return { ok: true, ...present(await callTool(name, args), wantsImageData(args)) };
	} catch (e) {
		return { ok: false, data: errorData(e) as Json, images: [] };
	}
}

const HELP = `PixelDoll agent API. await pixeldoll.call(name, args) returns {ok, data, images}. Frame sheets are drawn over the
page: take a screenshot to see them; pixeldoll.hide() closes them. Start with await pixeldoll.call('pixeldoll_overview').
pixeldoll.tools() lists every tool with its input schema. Paid tools need an approved budget (request_budget).`;

export function installAutomation(): () => void {
	const controller = new AbortController();
	const api = Object.freeze({
		version: 1,
		help: () => HELP,
		tools: () =>
			TOOLS.map((t) => ({
				name: t.name,
				description: t.description,
				inputSchema: t.inputSchema,
				readOnly: !!t.readOnly,
				consequential: !!t.consequential
			})),
		call: bridgeCall,
		hide: hideEvidence
	});
	Object.defineProperty(window, 'pixeldoll', { value: api, configurable: true });
	void registerWebMcp(controller.signal).then((n) => {
		if (n) document.documentElement.dataset.webmcp = String(n);
	});
	return () => {
		controller.abort();
		delete (window as { pixeldoll?: unknown }).pixeldoll;
	};
}
