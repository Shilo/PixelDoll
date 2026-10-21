// SHA-256 via WebCrypto (browser + node). Hex output; manifest hashes add the "sha256:" prefix themselves.

export async function sha256(data: Uint8Array | ArrayBuffer | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  const buf = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// JSON with sorted object keys, so equal params always hash equal.
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

export async function selfTest() {
  console.assert((await sha256('abc')) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'sha256 abc');
  console.assert(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] }) === '{"a":[1,{"c":3,"d":2}],"b":1}', 'stableStringify');
  console.assert(stableStringify({ a: undefined, b: null }) === '{"b":null}', 'stableStringify undefined');
}
