import { t, type WhisperKey } from 'svelte-whisper';

export const displaySwatch = (name: string): string => t(`newItem.swatches.${name}` as WhisperKey);
