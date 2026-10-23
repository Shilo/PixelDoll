import { api } from '../lib/pixellab/client.ts';
import { routes, type EnhanceCharacterV3Prompt, type EnhancedCharacterV3Prompt } from '../lib/pixellab/routes.ts';

/** Foreground, single submission. Never retry an ambiguous paid result. */
export async function enhanceCharacter(key: string, input: EnhanceCharacterV3Prompt, signal: AbortSignal, activityScope: string): Promise<string> {
  if (!input.description.trim() || input.description.length > 2000) throw new Error('Enter a prompt of 1–2,000 characters.');
  if (input.image_size.width !== input.image_size.height || !Number.isInteger(input.image_size.width) || input.image_size.width < 32 || input.image_size.width > 256) throw new Error('Choose a valid body size first.');
  const req = routes.enhanceCharacterV3Prompt(input);
  const result = await api<EnhancedCharacterV3Prompt>(key, req.method, req.path, req.body, AbortSignal.any([signal, AbortSignal.timeout(120_000)]), { activityScope, label: 'Enhance character prompt' });
  if (typeof result?.enhanced_prompt !== 'string' || !result.enhanced_prompt.trim() || result.enhanced_prompt.length > 2000) throw new Error('PixelLab returned an invalid prompt. Your text was kept.');
  return result.enhanced_prompt;
}
