// Turns any app value into plain JSON for a debugging backup: everything kept for diagnosis, minus what must never leave the
// device (PixelLab keys, signed URL queries) and what would only bloat the file (inline image data, binary buffers).
// Typed IDs, hashes and prompts stay: the backup goes privately to whoever helps the user, never to a public issue.

const MAX_DEPTH = 40;
const MAX_STRING = 20_000;
export const SECRET_FIELD =
	/^(authorization|api[-_]?key|apikey|token|secret|password|pixellabApiKey)$/i;
const BASE64 = /^[A-Za-z0-9+/=\s]+$/;
const SIGNED_URL = /(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/g;

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Every spelling of a key a string could carry: as typed, JSON-escaped and URL-encoded. */
export function keyForms(keys: readonly (string | null | undefined)[]): string[] {
	const forms = new Set<string>();
	for (const key of keys) {
		const value = key?.trim();
		if (!value || value.length < 8) continue;
		forms.add(value);
		forms.add(JSON.stringify(value).slice(1, -1));
		forms.add(encodeURIComponent(value));
	}
	return [...forms];
}

export function scrubText(text: string, forms: readonly string[]): string {
	let out = text;
	for (const form of forms) out = out.split(form).join('[PixelLab key]');
	if (out.startsWith('data:')) return `[data URL, ${out.length} characters]`;
	if (out.length > 2000 && BASE64.test(out.slice(0, 4000)))
		return `[base64, ${out.length} characters]`;
	out = out.replace(SIGNED_URL, '$1?[query removed]');
	return out.length > MAX_STRING
		? `${out.slice(0, MAX_STRING)}… [${out.length - MAX_STRING} more characters]`
		: out;
}

/** `value` as JSON with keys, inline images, binary data and URL queries removed. Never throws. */
export function sanitize(value: unknown, forms: readonly string[]): Json {
	const seen = new WeakSet<object>();
	const walk = (input: unknown, depth: number): Json | undefined => {
		if (input === null || input === undefined) return null;
		switch (typeof input) {
			case 'string':
				return scrubText(input, forms);
			case 'number':
				return Number.isFinite(input) ? input : String(input);
			case 'boolean':
				return input;
			case 'bigint':
				return input.toString();
			case 'function':
			case 'symbol':
				return undefined;
		}
		const object = input as object;
		if (depth > MAX_DEPTH) return '[too deep]';
		if (seen.has(object)) return '[circular]';
		seen.add(object);
		try {
			if (object instanceof Date) return object.toISOString();
			if (object instanceof Error)
				return {
					name: object.name,
					message: scrubText(object.message, forms),
					...(object.stack && { stack: scrubText(object.stack, forms) }),
					...(object.cause !== undefined && { cause: walk(object.cause, depth + 1) ?? null })
				};
			if (typeof Blob !== 'undefined' && object instanceof Blob)
				return `[blob ${object.type || 'unknown type'}, ${object.size} bytes]`;
			if (object instanceof ArrayBuffer) return `[${object.byteLength} bytes]`;
			if (ArrayBuffer.isView(object)) return `[${object.byteLength} bytes]`;
			if (typeof ImageData !== 'undefined' && object instanceof ImageData)
				return `[image ${object.width}x${object.height}]`;
			if (typeof ImageBitmap !== 'undefined' && object instanceof ImageBitmap)
				return `[image ${object.width}x${object.height}]`;
			if (typeof Element !== 'undefined' && object instanceof Element)
				return `[element ${object.tagName.toLowerCase()}]`;
			if (object instanceof Map)
				return [...object].map(([key, entry]) => [
					walk(key, depth + 1) ?? null,
					walk(entry, depth + 1) ?? null
				]);
			if (object instanceof Set || Array.isArray(object))
				return [...(object as Iterable<unknown>)].map((entry) => walk(entry, depth + 1) ?? null);
			const out: { [key: string]: Json } = {};
			for (const [key, entry] of Object.entries(object)) {
				if (SECRET_FIELD.test(key) && typeof entry === 'string' && entry) {
					out[key] = '[redacted]';
					continue;
				}
				const clean = walk(entry, depth + 1);
				if (clean !== undefined) out[key] = clean;
			}
			return out;
		} catch (error) {
			return `[unreadable: ${error instanceof Error ? error.message : String(error)}]`;
		} finally {
			// Only ancestors count as circular; a value shared by two branches is written in both.
			seen.delete(object);
		}
	};
	return walk(value, 0) ?? null;
}
