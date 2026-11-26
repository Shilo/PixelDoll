// "2 minutes ago", "3 days ago": a past moment in the active language, for "Updated …" labels. Under a minute returns
// null, so callers show their own "just now" wording (a bare "now" reads as an instruction in several languages).
import { getLocale } from 'svelte-whisper';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 365 * 24 * 3600],
	['month', 30 * 24 * 3600],
	['week', 7 * 24 * 3600],
	['day', 24 * 3600],
	['hour', 3600],
	['minute', 60]
];

export function timeAgo(iso: string, now = Date.now()): string | null {
	const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
	const format = new Intl.RelativeTimeFormat(getLocale() || 'en', { numeric: 'always' });
	for (const [unit, size] of UNITS)
		if (seconds >= size) return format.format(-Math.floor(seconds / size), unit);
	return null;
}
