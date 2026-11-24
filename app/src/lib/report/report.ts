// A problem report for the public GitHub issue form. It is built only from the allow-listed facts below, never from app
// state, and every string then passes the sanitizer anyway: GitHub Issues are public, so a report must never carry a key,
// an image, a prompt, a name, an ID or project data. Kept free of Svelte and the locale catalog so it can be tested alone.
import type { Message } from '../message.ts';
import { repository } from '../repository.ts';

export type ProblemTone = 'error' | 'warning';

/** Facts a failure surface may add. Each is checked again here: a value that does not fit its shape is dropped. */
export interface ProblemFacts {
	/** HTTP status of the failed PixelLab request. */
	status?: number;
	method?: string;
	/** A PixelLab endpoint; only its normalized path is kept (no origin, query or IDs). */
	endpoint?: string;
	/** Queue record state, such as failed or lost. */
	state?: string;
	/** Remote job status word; only the known PixelLab statuses (and the queue's own "lost") are reported. */
	jobStatus?: string;
	/** Studio phase, such as failed or review. */
	phase?: string;
	queueRole?: string;
	errorCode?: number;
	attempts?: number;
	/** How long the work ran, in seconds. */
	seconds?: number;
}

export interface Problem {
	/** The failing area in English, such as "Add a move"; the Studio fills in the current one. */
	area?: string;
	/** The message the user saw. Only its key and English template are reported, never its variables' text. */
	message?: Message;
	/** The underlying error: only its name, a localized key and PixelLab status and endpoint are read from it. */
	error?: unknown;
	tone?: ProblemTone;
	facts?: ProblemFacts;
	/** Caught by the global handlers: the report is titled by the error, not by the generic notice. */
	uncaught?: boolean;
}

export interface ReportEnvironment {
	version: string;
	commit: string;
	/** development, pre-release or stable. */
	channel: string;
	userAgent: string;
	/** navigator.userAgentData brands, when the browser has them. */
	brands?: readonly { brand: string; version: string }[];
	locale: string;
	coarsePointer: boolean;
	screenWidth: number;
	screenHeight: number;
	viewportWidth: number;
	viewportHeight: number;
}

export interface ReportContext {
	env: ReportEnvironment;
	/** The English template of a message, from the English catalog. */
	english?: (message: Message) => string | undefined;
	/** Wall-clock seconds since the app loaded, including time the device slept. */
	uptime?: number;
}

/** The issue form fields PixelDoll fills, in the order of .github/ISSUE_TEMPLATE/problem-report.yml. Steps to reproduce
 *  stays empty for the person: PixelDoll cannot know them, and filler would read as if they wrote it. */
export interface ProblemReport {
	title: string;
	problem: string;
	environment: string;
	details: string;
}

export const ISSUE_TEMPLATE = 'problem-report.yml';
/** GitHub and browsers accept far longer URLs; staying well under 8 KB keeps every proxy and browser safe. */
export const MAX_URL_LENGTH = 7000;
const LIMITS = { title: 120, problem: 700, environment: 300, details: 1500 } as const;

// ---------- sanitizer ----------

const WORD_SEGMENT = /^(?:[a-z]{1,24}|[a-z]+(?:[A-Z][a-z]+){1,8}|v\d{1,2}|\d{1,3})$/;
/** Long runs of key-like characters: kept only when they read as words joined by - / _ (endpoint paths) or as one
 *  camelCase name (message keys). */
const tokenRun = (run: string) =>
	run
		.split(/[-/_]+/)
		.filter(Boolean)
		.every((segment) => WORD_SEGMENT.test(segment))
		? run
		: '[redacted]';

const RULES: [RegExp, string | ((match: string) => string)][] = [
	// Control and invisible formatting characters, which could hide text from the preview.
	[/(?![\t\n])[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ''],
	[/\bdata:[^\s"'<>]*/gi, '[data]'],
	[/\b[a-z][a-z0-9+.-]*:\/\/\S*/gi, '[url]'],
	[/\b(?:blob|file|mailto|javascript):\S+/gi, '[url]'],
	[/\bwww\.\S+/gi, '[url]'],
	[/\bbearer\s+\S+/gi, '[redacted]'],
	[
		/\b(api[\s_-]?key|access[\s_-]?token|refresh[\s_-]?token|secret|token|password|passwd|authorization|auth|cookie|session|signature|sig)(["']?\s*[:=]\s*)["']?[^\s"',;]+["']?/gi,
		'$1$2[redacted]'
	],
	[/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]'],
	[/\beyJ[\w-]+\.[\w-]+(?:\.[\w-]+)?/g, '[token]'],
	[/\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/gi, '[id]'],
	[/\b(?:sha(?:1|256|384|512)?[-:])?[0-9a-f]{16,}\b/gi, '[hash]'],
	[/\b[A-Za-z]:[\\/][^\s"'<>|]*/g, '[path]'],
	[/\\\\[^\s"'<>|]+/g, '[path]'],
	[
		/(?:~|\.{1,2})?\/(?:Users|home|var|tmp|private|mnt|opt|etc|root|Volumes|Library|Applications|data|storage|sdcard|run|srv)\/\S*/gi,
		'[path]'
	],
	[/(?:^|(?<=\s))~\/\S*/g, '[path]'],
	// Quoted text is how prompts and names usually travel inside messages.
	[/"[^"\n]*"|“[^”\n]*”|«[^»\n]*»|「[^」\n]*」/g, '"[text]"'],
	[/[A-Za-z0-9+/=_-]{20,}/g, tokenRun],
	[/\d{7,}/g, '[number]']
];

const truncate = (text: string, max: number) =>
	text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;

/** Defensive pass over every reported string: removes anything that looks like a secret, a link, an address, an ID, a
 *  hash, a file path or quoted user text, then trims it to `max` characters. */
export function sanitize(text: string, max = 2000): string {
	let out = String(text).normalize('NFKC');
	for (const [pattern, replacement] of RULES)
		out = out.replace(pattern, replacement as (substring: string) => string);
	out = out
		.split('\n')
		.map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return truncate(out, max);
}

// ---------- allow-listed facts ----------

const ROUTE_PART = /^(?:[a-z]+|v\d{1,2}|\d{1,2})$/;
/** Collections whose next segment is an ID, except for their own fixed sub-routes. An imported project can hold any
 *  string as a character ID, so its shape alone cannot tell an ID from a route word. */
const ID_AFTER = new Map<string, readonly string[]>([
	['characters', ['animations']],
	['background-jobs', []]
]);
/** A PixelLab endpoint as a bare path: no origin, query or fragment, and every ID-like segment becomes {id}. */
export function endpointPath(raw: string): string | undefined {
	const path = raw
		.trim()
		.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
		.replace(/[?#].*$/, '')
		.replace(/^\/v\d+(?=\/)/, '');
	if (!path.startsWith('/')) return;
	const segments = path
		.split('/')
		.slice(1)
		.filter(Boolean)
		.slice(0, 6)
		// Route words are lowercase words, versions and small numbers (create-character-with-8-directions, inpaint-v3);
		// anything else, such as letters mixed with digits, is an ID.
		.map((segment, i, all) =>
			(ID_AFTER.get(all[i - 1])?.includes(segment) ?? true) &&
			segment.length <= 40 &&
			segment.split('-').every((part) => ROUTE_PART.test(part))
				? segment
				: '{id}'
		);
	return segments.length ? `/${segments.join('/')}` : undefined;
}

const WORD = /^[A-Za-z][A-Za-z0-9_ -]{0,39}$/;
const word = (value: unknown) =>
	typeof value === 'string' && WORD.test(value) ? value : undefined;
const count = (value: unknown, max = 1e6) =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
		? value
		: undefined;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
// The status comes from PixelLab's response as-is, so any other word could be text the server echoed back.
const JOB_STATUSES = new Set(['queued', 'processing', 'completed', 'failed', 'cancelled', 'lost']);
/** A thrown value that is not an error object, or cannot be read. */
const NON_ERROR = 'Non-error value';
/** Error class and DOMException names; anything else (a name a script made up) is reported as Error. */
const ERROR_NAME = /^[A-Z][A-Za-z]{0,40}(?:Error|Exception)$/;
const errorName = (value: unknown) =>
	typeof value === 'string' && ERROR_NAME.test(value) ? value : 'Error';

interface ErrorFacts {
	name?: string;
	message?: Message;
	status?: number;
	method?: string;
	endpoint?: string;
	kind?: string;
}

/** What an error may contribute: its name, a localized message, and for a PixelLab error its status, kind and endpoint
 *  path, read from the "METHOD /path -> status" prefix the client writes. Never its message text. */
function readErrorFacts(error: unknown): ErrorFacts {
	// Text is never reported: it may be anything, including what the user typed.
	if (error === undefined || error === null || typeof error === 'string') return {};
	if (typeof error !== 'object') return { name: NON_ERROR };
	const e = error as {
		name?: unknown;
		message?: unknown;
		status?: unknown;
		kind?: unknown;
		translation?: Message;
	};
	// Surfaces often keep the message they show rather than the error behind it.
	if (!(error instanceof Error) && typeof (error as Message).key === 'string')
		return { message: error as Message };
	const out: ErrorFacts = {};
	if (e.translation && typeof e.translation.key === 'string') out.message = e.translation;
	const api = typeof e.status === 'number' && typeof e.kind === 'string';
	out.name = api
		? 'ApiError'
		: error instanceof Error || typeof e.name === 'string'
			? errorName(e.name)
			: NON_ERROR;
	if (api) {
		out.kind = word(e.kind);
		out.status = count(e.status, 999) || undefined; // 0 and -1 mean no response
		const request =
			typeof e.message === 'string'
				? /^(GET|POST|PUT|PATCH|DELETE) (\/\S*) -> \d{3}\b/.exec(e.message)
				: null;
		if (request) {
			out.method = request[1];
			out.endpoint = endpointPath(request[2]);
		}
	}
	return out;
}

/** Any value can be thrown, including a null-prototype object or one whose getters throw: reading it must never throw
 *  in turn, or the report would describe this code instead of the failure. */
export function errorFacts(error: unknown): ErrorFacts {
	try {
		return readErrorFacts(error);
	} catch {
		return { name: NON_ERROR };
	}
}

/** Shows each distinct uncaught error once. `show` returns whether it showed: an error that could not be shown yet
 *  (another notice holds the place) is not remembered, so its next occurrence can show. */
export function onceShown(show: (error: unknown) => boolean): (error: unknown) => void {
	const shown = new Set<string>();
	return (error) => {
		let signature: string;
		try {
			const e = error as { name?: unknown; message?: unknown } | null | undefined;
			if (e?.name === 'AbortError') return;
			signature = `${String(e?.name)}:${String(e?.message ?? error)}`;
		} catch {
			// Unreadable (see errorFacts): such values share one signature.
			signature = NON_ERROR;
		}
		if (!shown.has(signature) && show(error)) shown.add(signature);
	};
}

/** The status in a saved "METHOD /path -> 422: ..." error. The method and path must lead, so a status-like phrase in
 *  provider text is not read as one. */
export function statusIn(text: string | undefined): number | undefined {
	const status = text && /\b(?:GET|POST|PUT|PATCH|DELETE) \/\S* -> (\d{3})\b/.exec(text);
	return status ? Number(status[1]) : undefined;
}

// ---------- environment ----------

const BROWSERS: [string, RegExp][] = [
	['Edge', /\bEdg(?:A|iOS)?\/(\d+)/],
	['Opera', /\bOPR\/(\d+)/],
	['Samsung Internet', /\bSamsungBrowser\/(\d+)/],
	['Firefox', /\b(?:Firefox|FxiOS)\/(\d+)/],
	['Chrome', /\b(?:Chrome|CriOS)\/(\d+)/],
	['Safari', /\bVersion\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//]
];
/** Browser family and major version only. */
export function browserOf(
	userAgent: string,
	brands?: readonly { brand: string; version: string }[]
): string {
	const brand = brands?.find(
		(b) => !/Not.?A.?Brand|Chromium/i.test(b.brand) && /^\d+/.test(b.version)
	);
	if (brand) {
		const name = brand.brand.replace(/^(?:Microsoft|Google) /, '');
		if (WORD.test(name)) return `${name} ${parseInt(brand.version, 10)}`;
	}
	for (const [name, pattern] of BROWSERS) {
		const match = pattern.exec(userAgent);
		if (match) return `${name} ${match[1]}`;
	}
	return 'Other browser';
}

/** Operating system family only, never its version or device model. */
export function osOf(userAgent: string): string {
	if (/iPhone|iPad|iPod/.test(userAgent)) return 'iOS';
	if (/Android/.test(userAgent)) return 'Android';
	if (/CrOS/.test(userAgent)) return 'ChromeOS';
	if (/Windows/.test(userAgent)) return 'Windows';
	if (/Mac OS X|Macintosh/.test(userAgent)) return 'macOS';
	if (/Linux/.test(userAgent)) return 'Linux';
	return 'Other OS';
}

export function deviceOf(env: ReportEnvironment): string {
	if (!env.coarsePointer) return 'desktop';
	return Math.min(env.screenWidth, env.screenHeight) < 600 ? 'phone' : 'tablet';
}

export function screenClassOf(env: ReportEnvironment): string {
	const w = env.viewportWidth,
		h = env.viewportHeight;
	const size = w < 600 ? 'small' : w < 1024 ? 'medium' : 'large';
	return `${size} ${w >= h ? 'landscape' : 'portrait'}`;
}

/** This browser's allow-listed environment. `locale` is the app's active language. */
export function browserEnvironment(locale: string, preRelease: boolean): ReportEnvironment {
	const nav = navigator as Navigator & {
		userAgentData?: { brands?: { brand: string; version: string }[] };
	};
	return {
		version: __APP_VERSION__,
		commit: __APP_COMMIT__,
		channel: import.meta.env.DEV ? 'development' : preRelease ? 'pre-release' : 'stable',
		userAgent: nav.userAgent,
		brands: nav.userAgentData?.brands,
		locale,
		coarsePointer: matchMedia('(pointer: coarse)').matches,
		screenWidth: screen.width,
		screenHeight: screen.height,
		viewportWidth: innerWidth,
		viewportHeight: innerHeight
	};
}

const localeOf = (locale: string) =>
	/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/i.test(locale) ? locale : 'unknown';

export function environmentLine(env: ReportEnvironment): string {
	const version = /^[\w.-]{1,24}$/.test(env.version) ? env.version : 'unknown';
	const commit = /^[a-f0-9]{7,12}$/i.test(env.commit) ? `, ${env.commit}` : '';
	return [
		`PixelDoll ${version} (${word(env.channel) ?? 'unknown'}${commit})`,
		browserOf(env.userAgent, env.brands),
		osOf(env.userAgent),
		deviceOf(env),
		localeOf(env.locale),
		`${screenClassOf(env)} screen`
	].join(' · ');
}

// ---------- report ----------

const duration = (seconds: number) =>
	seconds < 90
		? `${Math.round(seconds)} s`
		: seconds < 5400
			? `${Math.round(seconds / 60)} min`
			: `${Math.round(seconds / 3600)} h`;

export function buildReport(problem: Problem, context: ReportContext): ProblemReport {
	const facts = problem.facts ?? {},
		fromError = errorFacts(problem.error);
	const shown = problem.message ?? fromError.message;
	// A key is reported only when it is one of the app's own English messages.
	const english = (shown && context.english?.(shown)) || undefined;
	const area = word(problem.area) ?? 'PixelDoll';
	const kind = problem.tone === 'warning' ? 'warning' : 'error';
	const unexpected = `Unexpected ${fromError.name && fromError.name !== NON_ERROR ? fromError.name : 'problem'}`;
	const text = english || unexpected;
	const endpoint = endpointPath(facts.endpoint ?? '') ?? fromError.endpoint;
	const method = METHODS.has(facts.method ?? '') ? facts.method : fromError.method;
	const seconds = count(facts.seconds);
	const uptime = count(context.uptime === undefined ? undefined : Math.round(context.uptime));
	const lines: [string, string | number | undefined][] = [
		['Area', area],
		['Kind', kind],
		// The message itself is already the problem text; a plain "Error" name says nothing more.
		['Message key', english && shown?.key],
		['Error type', fromError.name === 'Error' ? undefined : fromError.name],
		['Error kind', fromError.kind],
		['HTTP status', count(facts.status, 999) || fromError.status],
		['Endpoint', endpoint && (method ? `${method} ${endpoint}` : endpoint)],
		['Queue state', word(facts.state)],
		['Job status', JOB_STATUSES.has(facts.jobStatus ?? '') ? facts.jobStatus : undefined],
		['Phase', word(facts.phase)],
		['Queue role', word(facts.queueRole)],
		['Error code', count(facts.errorCode, 99999)],
		['Attempts', count(facts.attempts, 999)],
		['Ran for', seconds === undefined ? undefined : duration(seconds)],
		['App open for', uptime === undefined ? undefined : duration(uptime)]
	];
	const details = lines
		.filter(([, value]) => value !== undefined && value !== '')
		.map(([label, value]) => `${label}: ${value}`)
		.join('\n');
	return fit({
		title: sanitize(
			problem.uncaught ? `${unexpected} in ${area}` : `${area}: ${text}`,
			LIMITS.title
		),
		problem: sanitize(
			problem.uncaught
				? `PixelDoll hit an u${unexpected.slice(1)} in ${area} that nothing handled.`
				: `PixelDoll showed this ${kind} in ${area}:\n\n${text}`,
			LIMITS.problem
		),
		environment: sanitize(environmentLine(context.env), LIMITS.environment),
		details: sanitize(details, LIMITS.details)
	});
}

const FIELDS = ['problem', 'environment', 'details'] as const;

/** GitHub's issue form, prefilled through its query parameters. encodeURIComponent writes spaces as %20, so nothing
 *  depends on GitHub reading "+" as a space. */
export function reportUrl(report: ProblemReport): string {
	const query = [
		['template', ISSUE_TEMPLATE],
		['title', report.title],
		...FIELDS.map((field) => [field, report[field]])
	]
		.map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
		.join('&');
	return `${repository}/issues/new?${query}`;
}

/** Halves the longest field until the prefilled URL fits, so the preview always shows exactly what the URL carries. */
function fit(report: ProblemReport): ProblemReport {
	let current = report;
	while (reportUrl(current).length > MAX_URL_LENGTH) {
		const longest = FIELDS.reduce((a, b) => (current[a].length >= current[b].length ? a : b));
		current = {
			...current,
			[longest]: truncate(current[longest], Math.floor(current[longest].length / 2))
		};
	}
	return current;
}

/** The exact text the preview shows and Copy report copies, labeled as on the issue form. */
export function reportText(report: ProblemReport): string {
	return [
		report.title,
		'',
		'What happened?',
		report.problem,
		'',
		'PixelDoll version, browser, and device',
		report.environment,
		'',
		'Technical details',
		report.details
	].join('\n');
}
