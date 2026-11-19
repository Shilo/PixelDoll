import {
	addDictionary,
	formatDate,
	getLocale,
	getLocales,
	init,
	registerLoader,
	t
} from 'svelte-whisper';
import en from '../locales/en.json';
import { errorMessage, type Message } from './message.ts';
import { workspaceCopy } from './store/workspace-mode.ts';

export { errorMessage } from './message.ts';

let ready: Promise<void> | undefined;
const localeKey = 'pixeldoll.locale';

function copyLocale(): string | undefined {
	if (!workspaceCopy) return;
	try {
		const saved = localStorage.getItem(localeKey);
		if (saved && getLocales().includes(saved)) return saved;
	} catch {
		return undefined;
	}
}

export function setupI18n(): Promise<void> {
	if (!ready) {
		addDictionary('en', en);
		registerLoader(import.meta.glob(['../locales/*.json', '!../locales/en.json']));
		const initial = copyLocale();
		ready = init({
			fallback: 'en',
			persistKey: workspaceCopy ? undefined : localeKey,
			initial,
			detect: !initial
		});
	}
	return ready;
}

export function displayMessage(value: Message | string): string {
	return typeof value === 'string' ? value : t(value.key, value.vars);
}

const isMessage = (value: unknown): value is Message =>
	!!value && typeof value === 'object' && typeof (value as Message).key === 'string';

const part = (value: unknown): unknown =>
	isMessage(value)
		? displayNestedMessage(value)
		: Array.isArray(value) &&
			  value.length &&
			  value.every((entry) => isMessage(entry) || typeof entry === 'string')
			? new Intl.ListFormat(getLocale() || 'en', { type: 'conjunction' }).format(
					value.map((entry) => displayNestedMessage(entry as Message | string))
				)
			: value;

/** A message in the active language whose variables may be messages too (a reason, or a list joined with "and"), so
 *  modules without the i18n runtime can describe a problem that still follows a language switch. */
export function displayNestedMessage(value: Message | string): string {
	if (typeof value === 'string' || !value.vars || Array.isArray(value.vars))
		return displayMessage(value);
	const vars = Object.fromEntries(
		Object.entries(value.vars).map(([name, entry]) => [name, part(entry)])
	);
	return displayMessage({ key: value.key, vars });
}

export function displayDate(value: number | Date, options: Intl.DateTimeFormatOptions): string {
	const locale = getLocale() || 'en';
	const chosen = new Intl.Locale(locale);
	if (chosen.region || typeof navigator === 'undefined') return formatDate(value, options, locale);
	const active = chosen.maximize();
	const regional = navigator.languages?.find((tag) => {
		const browser = new Intl.Locale(tag).maximize();
		return browser.language === active.language && browser.script === active.script;
	});
	return formatDate(value, options, regional ?? locale);
}

export function displayError(error: unknown): string {
	return displayNestedMessage(errorMessage(error));
}
