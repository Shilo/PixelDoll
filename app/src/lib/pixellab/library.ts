// Read-only character library. The ZIP endpoint is public; never send an account token to an artwork URL.
import { api, API_BASE } from './client.ts';
import { MAX_ZIP_BYTES } from '../store/zip.ts';

export interface LibraryCharacter { id: string; name: string; prompt?: string; directions: number; animation_count: number; preview_url?: string; size?: { width: number; height: number } }
export interface CharacterPage { characters: LibraryCharacter[]; total: number }
export const listCharacters = (key: string, offset = 0, signal?: AbortSignal) => api<CharacterPage>(key, 'GET', `/characters?limit=20&offset=${offset}`, undefined, signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : undefined);

/** Accept only an ID or an actual PixelLab creator link, never arbitrary fetch destinations. */
export function characterId(value: string): string {
  let id = value.trim();
  if (/^https?:\/\//i.test(id)) {
    const url = new URL(id);
    if (url.protocol !== 'https:' || !['pixellab.ai', 'www.pixellab.ai', 'api.pixellab.ai'].includes(url.hostname)) throw new Error('Use a character ID or a link from pixellab.ai.');
    const candidates = [url.searchParams.get('character_id'), url.searchParams.get('id'), ...url.pathname.split('/'), ...url.hash.split(/[/?=&]/)];
    id = candidates.find((s) => s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) ?? '';
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Enter the character’s UUID from PixelLab or its creator link.');
  return id;
}

export async function downloadCharacter(id: string, signal?: AbortSignal): Promise<Uint8Array> {
  const safe = characterId(id);
  const timeout = AbortSignal.timeout(120_000);
  const response = await fetch(`${API_BASE}/characters/${safe}/zip?states=${safe}`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, credentials: 'omit' });
  if (!response.ok) throw new Error(response.status === 423 ? 'PixelLab is still generating this character. Try importing again when it finishes.' : response.status === 404 ? 'PixelLab could not find this character.' : `PixelLab export failed (${response.status}). Try again later.`);
  if (Number(response.headers.get('content-length')) > MAX_ZIP_BYTES) throw new Error('This character ZIP exceeds the 64 MB import limit.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('PixelLab returned an empty export.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try { for (;;) { const r = await reader.read(); if (r.done) break; size += r.value.length; if (size > MAX_ZIP_BYTES) throw new Error('This character ZIP exceeds the 64 MB import limit.'); chunks.push(r.value); } }
  finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return bytes;
}
