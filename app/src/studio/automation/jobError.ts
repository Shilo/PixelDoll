import { errorText } from '../../lib/message.ts';

/** Provider and persisted error text can contain URLs and credentials. Publish only known reasons and guidance. */
export function jobError(error: unknown): string | null {
	if (!error) return null;
	const text = errorText(error);
	if (
		/\b(?:insufficient (?:credits|generations|balance)|out of (?:credits|generations)|payment required|credits exhausted|402)\b/i.test(
			text
		)
	)
		return 'credits: PixelLab needs more credits. Ask the user to check their balance.';
	if (/\b(?:unauthorized|invalid (?:api key|token)|authentication|401)\b/i.test(text))
		return 'connection: Ask the user to reconnect PixelLab in the Studio.';
	if (/\b(?:content policy|policy violation|moderation|safety filter)\b/i.test(text))
		return 'policy: PixelLab rejected the content. Review the prompt and inputs.';
	if (/\b(?:no usable frames|quality checks?|misregistered)\b/i.test(text))
		return 'quality: Review the draft and its frame checks in the Studio.';
	if (/\b(?:timed? ?out|timeout|network|offline|failed to fetch|unknown outcome)\b/i.test(text))
		return 'connection: Check PixelDoll Activity for the outcome before starting work again.';
	if (/\b(?:rate limit|capacity|too many requests|429)\b/i.test(text))
		return 'capacity: Check the PixelLab queue in Activity.';
	if (/\b(?:validation|invalid input|unprocessable|422)\b/i.test(text))
		return 'input: Review the generation settings in the Studio.';
	return 'generation: See PixelDoll Activity for details before starting work again.';
}
