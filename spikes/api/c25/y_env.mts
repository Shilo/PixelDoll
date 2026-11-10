// Arm Y launcher (chroma default A/B, 2026-11-09): resolve the agent key like the dev server does (app/agent-key.ts) and, when
// it references PIXELLAB_SECRET_DEV, send this process's PixelLab calls to the owner's local API server. Import this module
// BEFORE ./lib.mts: lib builds its client from process.env at load time with the public base, and this keeps lib unchanged for
// other arms. The key only lives in this process's memory; it is never printed or written.
import fs from 'node:fs';
import path from 'node:path';
const { resolveAgentKey, agentApiBase } = await import(new URL('../../../app/agent-key.ts', import.meta.url).href);
const src = fs.readFileSync(path.resolve(import.meta.dirname, '../../../.env'), 'utf8');
process.env.PIXELLAB_API_KEY_AGENT_DEV = resolveAgentKey(src, process.env);
const PUBLIC = 'https://api.pixellab.ai/v2', base: string | undefined = agentApiBase(src);
export const API_BASE = base ?? PUBLIC;
if (base) {
  const f = globalThis.fetch;
  globalThis.fetch = ((u: any, init?: any) => f(typeof u === 'string' && u.startsWith(PUBLIC) ? base + u.slice(PUBLIC.length) : u, init)) as typeof fetch;
}
