import { validAnimationId } from '../rig/rig.ts';
import { EXPORT_ENGINES, type Engine, type Manifest } from './manifest.ts';
import * as db from './db.ts';

export interface ExportSettings {
  engine: Engine;
  dressedCharacterSheets: boolean;
  playOnce: string[];
}
export type ExportSettingChange = { engine: Engine } | { dressedCharacterSheets: boolean } | { animation: string; playOnce: boolean };
export const EXPORT_SETTINGS_KEY = 'studio-export-settings';
export const defaultExportSettings = (): ExportSettings => ({ engine: 'godot', dressedCharacterSheets: true, playOnce: [] });
const CHANNEL = 'pixeldoll-export-settings';

/** Notifications carry no preferences. Opening or refocusing Export remains the fallback when channels are unavailable. */
export function subscribeExportSettings(listener: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => listener();
    return () => channel.close();
  } catch (error) {
    console.warn('Could not listen for export settings changes in other tabs.', error);
    return () => {};
  }
}

function notifySettingsChanged(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(null);
  } catch (error) {
    // A committed write remains successful if this optional invalidation cannot be delivered.
    console.warn('Could not notify other tabs about export settings changes.', error);
  } finally { channel?.close(); }
}

function animationName(value: string): string {
  const name = value.trim().toLowerCase();
  if (!validAnimationId(name)) throw new Error('Animation names must contain lowercase letters, numbers, hyphens or underscores.');
  return name;
}

/** Persist canonical names only. An unreadable preference is a visible error, never a silent replacement with defaults. */
function checkedSettings(value: unknown): ExportSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Saved export settings are invalid.');
  const stored = value as Partial<ExportSettings>;
  if (!EXPORT_ENGINES.some(engine => engine === stored.engine) || typeof stored.dressedCharacterSheets !== 'boolean' || !Array.isArray(stored.playOnce)
    || stored.playOnce.some(name => typeof name !== 'string' || !validAnimationId(name)) || new Set(stored.playOnce).size !== stored.playOnce.length) throw new Error('Saved export settings must contain a supported format, a dressed sheets choice and unique lowercase animation names.');
  return { engine: stored.engine!, dressedCharacterSheets: stored.dressedCharacterSheets, playOnce: [...stored.playOnce].sort() };
}

export async function readExportSettings(): Promise<ExportSettings> {
  const saved = await db.get<unknown>('projects', EXPORT_SETTINGS_KEY);
  return saved === undefined ? defaultExportSettings() : checkedSettings(saved);
}

/** Patch one field against the latest transaction record so independent tab changes are retained. */
export async function saveExportSetting(change: ExportSettingChange): Promise<ExportSettings> {
  const committed = await db.update<ExportSettings>('projects', EXPORT_SETTINGS_KEY, current => {
    const settings = current === undefined ? defaultExportSettings() : checkedSettings(current);
    if ('animation' in change) {
      if (typeof change.animation !== 'string' || typeof change.playOnce !== 'boolean') throw new Error('Choose an animation and whether it plays once.');
      const name = animationName(change.animation), names = new Set(settings.playOnce);
      if (change.playOnce) names.add(name); else names.delete(name);
      settings.playOnce = [...names].sort();
    } else if ('engine' in change) {
      if (!EXPORT_ENGINES.includes(change.engine)) throw new Error('Choose a supported export format.');
      settings.engine = change.engine;
    } else {
      if (typeof change.dressedCharacterSheets !== 'boolean') throw new Error('Include dressed character sheets must be true or false.');
      settings.dressedCharacterSheets = change.dressedCharacterSheets;
    }
    return settings;
  });
  notifySettingsChanged();
  return structuredClone(committed);
}

/** Apply only to an export copy. Imported metadata never changes the user's global preferences. */
export function applyExportSettings(manifest: Manifest, settings: ExportSettings): void {
  const names = new Set(checkedSettings(settings).playOnce);
  for (const animation of manifest.rig.animations) animation.loop = !names.has(animationName(animation.id));
}

/** Remembered names remain available after deleting or renaming the last character that used them. */
export function animationNames(manifests: readonly Manifest[], settings: ExportSettings): string[] {
  const names = new Set(checkedSettings(settings).playOnce);
  for (const manifest of manifests) {
    if (!manifest?.rig || !Array.isArray(manifest.rig.animations) || manifest.rig.animations.some(animation => !animation || typeof animation.id !== 'string' || !validAnimationId(animation.id.trim().toLowerCase()))) throw new Error(`Character "${manifest?.name ?? 'Unknown'}" has invalid animation names in storage.`);
    for (const animation of manifest.rig.animations) names.add(animationName(animation.id));
  }
  return [...names].sort();
}
