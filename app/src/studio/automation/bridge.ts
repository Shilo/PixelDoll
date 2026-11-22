// Connection adapters over the one tool registry (tools.ts). Both are browser-native and need no server:
// - WebMCP: tools registered on document.modelContext, discovered by WebMCP-capable agents (Playwright MCP, Chrome DevTools
//   MCP, the ChatGPT app's browser) with images as MCP image content.
// - window.pixeldoll: the same tools for agents that drive the page by script (Claude in Chrome, DevTools or Playwright
//   evaluate, IDE browsers). Script results are text to them, so images are also shown in the page for a screenshot.
import { AgentError, callTool, TOOLS, type Json, type Tool, type ToolResult } from './tools.ts';
import { hideEvidence, showEvidence } from './panel.svelte.ts';

const errorData = (e: unknown) =>
	e instanceof AgentError
		? { error: e.message, code: e.code }
		: { error: e instanceof Error ? e.message : String(e), code: 'failed' };

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

/** MCP-shaped result: a JSON text block, then each sheet as an image block. Failures are returned, not thrown: WebMCP turns
 *  a rejected promise into a bare OperationError and drops the reason the agent needs. */
export async function webmcpResult(run: () => Promise<ToolResult>) {
	try {
		const result = await run();
		return {
			content: [
				{ type: 'text', text: JSON.stringify(result.data) },
				...(result.images ?? []).flatMap((image) => [
					{
						type: 'text',
						text: `${image.label} (${image.width}x${image.height}, ${image.scale}x per pixel)`
					},
					{ type: 'image', data: image.data, mimeType: 'image/png' }
				])
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
			webmcpResult(() =>
				callTool(tool.name, input, options?.signal ?? new AbortController().signal)
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
export interface CallOptions {
	/** Show the result's images in the page for a screenshot (default true when there are images). */
	show?: boolean;
	/** Also return the PNGs as base64 (large: only for agents that can decode them). */
	includeImageData?: boolean;
}
export interface BridgeResult {
	ok: boolean;
	data: Json;
	images: { label: string; width: number; height: number; scale: number; data?: string }[];
	shownInPage: boolean;
}

export async function bridgeCall(
	name: string,
	args?: unknown,
	options: CallOptions = {}
): Promise<BridgeResult> {
	try {
		const result = await callTool(name, args);
		const images = result.images ?? [];
		const show = options.show ?? images.length > 0;
		if (show && images.length) showEvidence(name, images);
		return {
			ok: true,
			data: result.data,
			images: images.map(({ label, width, height, scale, data }) => ({
				label,
				width,
				height,
				scale,
				...(options.includeImageData ? { data } : {})
			})),
			shownInPage: show && images.length > 0
		};
	} catch (e) {
		return { ok: false, data: errorData(e), images: [], shownInPage: false };
	}
}

const HELP = `PixelDoll agent API. await pixeldoll.call(name, args) returns {ok, data, images}. Images are drawn over the page:
take a screenshot to see them, then pixeldoll.hide(). Start with await pixeldoll.call('pixeldoll_overview').
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
