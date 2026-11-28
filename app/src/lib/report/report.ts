// A problem report for the public GitHub issue form. It is built only from the allow-listed facts below, never from app
// state, and every string then passes the sanitizer anyway: GitHub Issues are public, so a report must never carry a key,
// an image, a prompt, a name, an ID or project data. Kept free of Svelte and the locale catalog so it can be tested alone.
import type { Message } from '../message.ts';
import { repository } from '../repository.ts';
import { DIRECTIONS } from '../rig/rig.ts';
import { CREATION_MODEL_LABELS } from '../store/generation.ts';
import { EXPORT_ENGINES } from '../store/manifest.ts';
import { areaName } from './areas.ts';
import { TRAIL_SIZE, type TrailEntry, type TrailEvent } from './trail.ts';

export type ProblemTone = 'error' | 'warning';

/** The open character and failing move, for triage only. Every field is a fixed shape checked again below. */
export interface CharacterFacts {
	/** The rig's square frame cell, in px. */
	frame?: { w?: unknown; h?: unknown };
	/** How many directions the rig has. */
	directions?: unknown;
	/** One of CREATION_MODEL_LABELS, from the stored creation call. */
	model?: unknown;
	/** True when the failing move generation belongs to this character, so its move kind is safe from any area. */
	moveFailure?: unknown;
	/** built-in for a PixelLab template move, custom for a described or authored one. */
	moveKind?: unknown;
}

/** Facts a failure surface may add. Each is checked again here: a value that does not fit its shape is dropped. */
export interface ProblemFacts {
	/** The Studio download action, independent of the name of the file or character. */
	download?: DownloadAction;
	/** Whether a service worker controlled the page when a download error was caught. */
	serviceWorkerControlled?: boolean;
	/** The step a download was on when it failed. */
	step?: DownloadStep;
	/** The Export sheet's chosen format, one of EXPORT_ENGINES. */
	exportFormat?: string;
	/** The browser said it was offline when the problem happened. */
	offline?: boolean;
	/** A new PixelDoll version was waiting to load when the problem happened. */
	updateWaiting?: boolean;
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
	/** The open character and failing move, reduced to fixed facts. */
	character?: CharacterFacts;
}

const DOWNLOAD_LABELS = {
	character: 'Character ZIP',
	item: 'Item ZIP',
	outfit: 'Outfit ZIP',
	move: 'Move or State ZIP',
	frames: 'Frame sheets',
	originals: 'Original generations',
	paid: 'Paid results'
} as const;
export type DownloadAction = keyof typeof DOWNLOAD_LABELS;
/** What a download was doing: reading the character, loading the export code, reading export settings, building the ZIP,
 *  or handing it to the browser. */
export const DOWNLOAD_STEPS = ['source', 'builder', 'settings', 'build', 'save'] as const;
export type DownloadStep = (typeof DOWNLOAD_STEPS)[number];

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
	/** Recent app actions, newest first (trail.ts); left out when the failure is not from this page's session. */
	trail?: readonly TrailEntry[];
	/** performance.now() when the problem happened, when known; trail times are counted back from it. */
	failedAt?: number;
	/** Wall-clock seconds the app had been open when the problem happened, including time the device slept. */
	uptime?: number;
	/** A stored failure (an Activity row): it may come from an earlier visit, another tab or another character. */
	record?: boolean;
	/** Already frozen at the failure (studio/report.svelte.ts captureProblem). */
	captured?: boolean;
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
	/** The URL the page's own files load from (origin and folder, no trailing slash): only stack frames of PixelDoll's own
	 *  built files there are reported. */
	base?: string;
	/** performance.now() when Report was pressed: the trail is counted back from it when the failure time is unknown. */
	now?: number;
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
const LIMITS = { title: 120, problem: 700, environment: 300, details: 3000 } as const;

// ---------- sanitizer ----------

const WORD_SEGMENT = /^(?:[a-z]{1,24}|[a-z]+(?:[A-Z][a-z]+){1,8}|v\d{1,2}|\d{1,3})$/;
/** A capitalized word, accepted only as one part of a joined run (a chunk such as experience-WorldStage): alone, a long one
 *  could be a name written without spaces. */
const PASCAL_SEGMENT = /^(?:[A-Z][a-z]+){1,8}$/;
/** Long runs of key-like characters: kept only when they read as words joined by - / _ (endpoint paths, chunk names) or as
 *  one camelCase name (message keys). */
const tokenRun = (run: string) => {
	const segments = run.split(/[-/_]+/).filter(Boolean);
	return segments.every(
		(segment) => WORD_SEGMENT.test(segment) || (segments.length > 1 && PASCAL_SEGMENT.test(segment))
	)
		? run
		: '[redacted]';
};

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
	// A column of a built file (Studio.js:1:1234567) is a code position, not an ID.
	[/(?<!\.js:\d{1,6}:)\d{7,}/g, '[number]']
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
/** JavaScript, DOMException and PixelDoll error names. Any other name (one a library or script made up) is reported as
 *  Error: a name is the one part of an error a report prints, so it must be app or platform vocabulary. */
const ERROR_NAMES = new Set([
	'Error',
	'TypeError',
	'RangeError',
	'ReferenceError',
	'SyntaxError',
	'EvalError',
	'URIError',
	'AggregateError',
	'InternalError',
	// DOMException names (WebIDL).
	'IndexSizeError',
	'HierarchyRequestError',
	'InvalidCharacterError',
	'NoModificationAllowedError',
	'NotFoundError',
	'NotSupportedError',
	'InvalidStateError',
	'InvalidModificationError',
	'InvalidAccessError',
	'TypeMismatchError',
	'SecurityError',
	'NetworkError',
	'AbortError',
	'QuotaExceededError',
	'TimeoutError',
	'DataCloneError',
	'EncodingError',
	'NotReadableError',
	'UnknownError',
	'ConstraintError',
	'DataError',
	'TransactionInactiveError',
	'ReadOnlyError',
	'VersionError',
	'OperationError',
	'NotAllowedError',
	// PixelDoll's own named errors.
	'ApiError',
	'LoadError',
	'NotAFileError',
	'ChangedError',
	'UnsafePathError'
]);
const errorName = (value: unknown) =>
	typeof value === 'string' && ERROR_NAMES.has(value) ? value : 'Error';
/** A thrown value's name for the trail: only a listed name, never a made-up one. Never throws. */
export function knownErrorName(error: unknown): string {
	try {
		return errorName((error as { name?: unknown } | null | undefined)?.name);
	} catch {
		return 'Error';
	}
}
const ERROR_KINDS = new Set(['auth', 'credits', 'invalid', 'policy', 'retry', 'notfound', 'other']);
const RECORD_STATES = new Set([
	'queued',
	'submitting',
	'running',
	'done',
	'failed',
	'canceled',
	'lost'
]);
const PHASES = new Set(['running', 'review', 'failed']);
const ENGINE_IDS: ReadonlySet<string> = new Set(EXPORT_ENGINES);
const QUEUE_ROLES = new Set(['leader', 'follower']);
const oneOf = (set: ReadonlySet<string>, value: unknown) =>
	typeof value === 'string' && set.has(value) ? value : undefined;

/** The rig's supported square cell sides, as validateRig enforces (32–256 whole pixels). */
const FRAME_MIN = 32;
const FRAME_MAX = 256;
const MODEL_LABELS = new Set(Object.values(CREATION_MODEL_LABELS));
const MOVE_KINDS = new Set(['built-in', 'custom']);
/** Surfaces where a move or frame failure makes the current move context meaningful. */
const MOVE_AREAS = new Set(['Add a move', 'Move review', 'Frames', 'Adjust frame']);
const within = (value: unknown, min: number, max: number) =>
	typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
		? value
		: undefined;

/** One compact value of fixed character facts; every field that does not fit its shape is dropped, never printed raw. */
function characterFacts(facts: CharacterFacts | undefined, area: string): string | undefined {
	if (!facts || typeof facts !== 'object') return undefined;
	const parts: string[] = [];
	const w = within(facts.frame?.w, FRAME_MIN, FRAME_MAX);
	const h = within(facts.frame?.h, FRAME_MIN, FRAME_MAX);
	if (w !== undefined && w === h) parts.push(`${w}x${h} px frame`);
	const directions = within(facts.directions, 1, DIRECTIONS.length);
	if (directions !== undefined)
		parts.push(`${directions} ${directions === 1 ? 'direction' : 'directions'}`);
	if (typeof facts.model === 'string' && MODEL_LABELS.has(facts.model)) parts.push(facts.model);
	// A move kind is only triage for a move or frame failure, never for whatever Preview happens to show elsewhere.
	const moveKind = facts.moveFailure === true || MOVE_AREAS.has(area) ? facts.moveKind : undefined;
	if (typeof moveKind === 'string' && MOVE_KINDS.has(moveKind)) parts.push(`${moveKind} move`);
	return parts.length ? parts.join(', ') : undefined;
}

interface ErrorFacts {
	name?: string;
	message?: Message;
	status?: number;
	method?: string;
	endpoint?: string;
	kind?: string;
	/** Names of the errors behind it (error.cause), outermost first. */
	causes?: string[];
	/** Where it was thrown in PixelDoll's own built files, as chunk.js:line:col. */
	frames?: string[];
	/** The built file a failed code load asked for, as chunk.js. */
	module?: string;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** PixelDoll's own built files under the page's base URL. assets/Studio-AbCd_123.js:1:2 is written Studio.AbCd_123.js:1:2: chunk names
 *  repeat, so the hash stays, and dots keep each part short enough for the sanitizer. The commit in the report pins the
 *  build, so a frame maps back to source through that build's source map. */
const ownFiles = (base: string) =>
	new RegExp(
		`${escapeRegExp(base)}/assets/([A-Za-z][A-Za-z0-9_.-]{0,59})-([A-Za-z0-9_-]{8})\\.js(?::(\\d{1,7}):(\\d{1,7}))?`,
		'g'
	);
const MAX_FRAMES = 4;
/** Shorter text cannot imitate an own-file URL, so it stays in the stack: removing a common word would remove frames too. */
const FORGEABLE = 24;

/** Up to MAX_FRAMES own-code positions from a stack. The message is removed first: provider or user text inside it could
 *  imitate a frame. Frames of other origins (extensions, embeds) are never read. */
function ownFrames(stack: unknown, message: unknown, base: string | undefined): string[] {
	if (!base || typeof stack !== 'string') return [];
	const text =
		typeof message === 'string' && message.length >= FORGEABLE
			? stack.split(message).join(' ')
			: stack;
	const frames: string[] = [];
	for (const [, file, hash, line, column] of text.matchAll(ownFiles(base))) {
		if (!line) continue;
		const frame = `${file}.${hash}.js:${line}:${column}`;
		if (!frames.includes(frame)) frames.push(frame);
		if (frames.length === MAX_FRAMES) break;
	}
	return frames;
}

/** The browsers' own words for a failed dynamic import (Chromium, Firefox). Only such a message is read for a file: other
 *  text that happens to hold an own-file-shaped URL could carry a name the person wrote. */
const IMPORT_FAILED =
	/^(?:Failed to fetch dynamically imported module|error loading dynamically imported module): (\S+)$/;
/** The built file a failed code load (a LoadError's direct cause) asked for, when it is one of PixelDoll's own. */
function failedModule(message: unknown, base: string | undefined): string | undefined {
	if (!base || typeof message !== 'string') return undefined;
	const url = IMPORT_FAILED.exec(message.trim())?.[1];
	if (!url) return undefined;
	const [match] = url.matchAll(ownFiles(base));
	// The whole URL must be the file, nothing before or after it.
	return match && match.index === 0 && match[0] === url && !match[3]
		? `${match[1]}.${match[2]}.js`
		: undefined;
}

/** Every PixelLab route PixelDoll calls (lib/pixellab/routes.ts and the queue), normalized by endpointPath. Text can hold
 *  any path, so an endpoint read from text is reported only when it is one of these. */
export const PIXELLAB_ROUTES: ReadonlySet<string> = new Set([
	'/animate-pixminimax',
	'/animate-with-skeleton-v3',
	'/animate-with-text-v3',
	'/background-jobs/{id}',
	'/balance',
	'/characters',
	'/characters/animations',
	'/characters/{id}',
	'/create-character-pro',
	'/create-character-pro-flash',
	'/create-character-state',
	'/create-character-v3',
	'/create-character-with-8-directions',
	'/edit-animation-v2',
	'/edit-image-pixen',
	'/edit-image-pro-flash',
	'/edit-images-v2',
	'/enhance-animation-v3-prompt',
	'/enhance-character-v3-prompt',
	'/enhance-pixen-prompt',
	'/estimate-skeleton',
	'/inpaint-v3',
	'/pro-flash/capabilities',
	'/transfer-outfit-v2'
]);

/** The method, endpoint and status of a "METHOD /path -> 422" request prefix inside stored or thrown text. The method and
 *  path must lead the status, so a status-like phrase in provider text is not read as one, and the path must be a known
 *  route. */
function requestFacts(text: string): ErrorFacts {
	const request = /\b(GET|POST|PUT|PATCH|DELETE) (\/\S*) -> (\d{3})\b/.exec(text);
	const endpoint = request ? knownEndpoint(request[2]) : undefined;
	// Not one of PixelDoll's requests: its status would be as made up as its path.
	return request && endpoint
		? { method: request[1], endpoint, status: count(Number(request[3]), 999) || undefined }
		: {};
}

/** An endpoint as a normalized path, only when it is a route PixelDoll calls. Every endpoint a report prints passes here:
 *  anything can be thrown, so even an error shaped like the client's can carry a made-up path. */
const knownEndpoint = (raw: string): string | undefined => {
	const endpoint = endpointPath(raw);
	return endpoint && PIXELLAB_ROUTES.has(endpoint) ? endpoint : undefined;
};

/** What an error may contribute: its name, a localized message, and for a PixelLab error its status, kind and endpoint
 *  path, read from the "METHOD /path -> status" prefix the client writes; the names of its causes; and where in
 *  PixelDoll's own code it was thrown. Never its message text. */
function readErrorFacts(error: unknown, base?: string): ErrorFacts {
	if (error === undefined || error === null) return {};
	// Stored failures keep only text. Its words are never reported, only the request prefix the client writes.
	if (typeof error === 'string') return requestFacts(error);
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
	// The client's errors carry one of its own kinds; any other object with a status is not a PixelLab error.
	const api = typeof e.status === 'number' && oneOf(ERROR_KINDS, e.kind) !== undefined;
	out.name = api
		? 'ApiError'
		: error instanceof Error || typeof e.name === 'string'
			? errorName(e.name)
			: NON_ERROR;
	if (api) {
		out.kind = oneOf(ERROR_KINDS, e.kind);
		out.status = count(e.status, 999) || undefined; // 0 and -1 mean no response
		const request =
			typeof e.message === 'string'
				? /^(GET|POST|PUT|PATCH|DELETE) (\/\S*) -> \d{3}\b/.exec(e.message)
				: null;
		const endpoint = request && knownEndpoint(request[2]);
		if (endpoint) {
			out.method = request[1];
			out.endpoint = endpoint;
		}
	} else if (typeof e.message === 'string') {
		// A flow can wrap a failed request in its own error whose message keeps the client's request prefix.
		Object.assign(out, requestFacts(e.message));
	}
	const frames = ownFrames((error as { stack?: unknown }).stack, e.message, base);
	if (frames.length) out.frames = frames;
	// A cycle or a long chain stops after three causes.
	const causes: string[] = [];
	let cause = (error as { cause?: unknown }).cause;
	for (let depth = 0; depth < 3 && cause !== undefined && cause !== null; depth++) {
		const c = cause as { name?: unknown; message?: unknown; stack?: unknown; cause?: unknown };
		causes.push(typeof cause === 'object' ? errorName(c.name) : NON_ERROR);
		if (depth === 0 && out.name === 'LoadError') out.module = failedModule(c.message, base);
		if (!out.frames) {
			const own = ownFrames(c.stack, c.message, base);
			if (own.length) out.frames = own;
		}
		cause = typeof cause === 'object' ? c.cause : undefined;
	}
	if (causes.length) out.causes = causes;
	return out;
}

/** Any value can be thrown, including a null-prototype object or one whose getters throw: reading it must never throw
 *  in turn, or the report would describe this code instead of the failure. */
export function errorFacts(error: unknown, base?: string): ErrorFacts {
	try {
		return readErrorFacts(error, base);
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
	return text ? requestFacts(text).status : undefined;
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

/** A data-trail control name: a dotted camelCase path such as toolbar.download. */
const TRAIL_CONTROL = /^[a-z][A-Za-z0-9]{0,30}(?:\.[a-z][A-Za-z0-9]{0,30}){0,3}$/;
const PAGE_STATES = new Set(['hidden', 'visible', 'online', 'offline']);
const SCREENS = new Set(['Characters', 'Studio']);

/** One trail event in fixed words, or undefined when any part is not app vocabulary. */
function trailEvent(event: TrailEvent, context: ReportContext, times = 1): string | undefined {
	switch (event.kind) {
		case 'press': {
			const area = areaName(event.area);
			if (!area) return undefined;
			return typeof event.control === 'string' && TRAIL_CONTROL.test(event.control)
				? `press ${event.control} in ${area}`
				: `press ${times > 1 ? 'unnamed controls' : 'an unnamed control'} in ${area}`;
		}
		case 'open':
		case 'close': {
			const area = areaName(event.area);
			return area && `${event.kind} ${area}`;
		}
		case 'screen':
			return SCREENS.has(event.area) ? `show ${event.area}` : undefined;
		case 'notice':
			// Only one of the app's own messages, never text.
			return typeof event.key === 'string' &&
				context.english?.({ key: event.key } as Message) &&
				(event.tone === 'error' || event.tone === 'warning')
				? `${event.tone} ${event.key}`
				: undefined;
		case 'job': {
			const endpoint = knownEndpoint(event.endpoint ?? '');
			return endpoint && METHODS.has(event.method) && RECORD_STATES.has(event.state)
				? `request ${event.method} ${endpoint} ${event.state}`
				: undefined;
		}
		case 'page':
			return PAGE_STATES.has(event.state) ? `page ${event.state}` : undefined;
		case 'error':
			return `uncaught ${errorName(event.name)}`;
		default:
			return undefined;
	}
}

/** The trail, newest first, each line timed back from the problem. Unknown or malformed entries are left out. */
function trailText(
	problem: Problem,
	context: ReportContext,
	shownKey: string | undefined
): string | undefined {
	const trail = Array.isArray(problem.trail) ? problem.trail : [];
	const end =
		typeof problem.failedAt === 'number' && Number.isFinite(problem.failedAt)
			? problem.failedAt
			: context.now;
	if (end === undefined) return undefined;
	const lines: string[] = [];
	for (const entry of trail.slice(0, TRAIL_SIZE)) {
		if (!entry || typeof entry.at !== 'number' || entry.at > end) continue;
		// The notice of this very problem is already the report's message.
		if (entry.event?.kind === 'notice' && entry.event.key === shownKey && end - entry.at < 1000)
			continue;
		let line: string | undefined;
		try {
			line = trailEvent(entry.event, context, count(entry.times, 1e6));
		} catch {
			line = undefined;
		}
		if (!line) continue;
		const times = count(entry.times, 1e6);
		lines.push(
			`- ${duration(Math.max(0, (end - entry.at) / 1000))}: ${line}${times && times > 1 ? ` (${times} times)` : ''}`
		);
	}
	if (!lines.length) return undefined;
	const before =
		problem.failedAt === undefined ? 'before Report was pressed' : 'before the problem';
	return [`Recent actions (newest first, time ${before}):`, ...lines].join('\n');
}

export function buildReport(problem: Problem, context: ReportContext): ProblemReport {
	const facts = problem.facts ?? {},
		fromError = errorFacts(problem.error, context.base);
	const errorChain = [fromError.name, ...(fromError.causes ?? [])].filter(
		(name): name is string => !!name
	);
	const shown = problem.message ?? fromError.message;
	// A key is reported only when it is one of the app's own English messages.
	const english = (shown && context.english?.(shown)) || undefined;
	const area = areaName(problem.area) ?? 'PixelDoll';
	const kind = problem.tone === 'warning' ? 'warning' : 'error';
	const unexpected = `Unexpected ${fromError.name && fromError.name !== NON_ERROR ? fromError.name : 'problem'}`;
	const endpoint = knownEndpoint(facts.endpoint ?? '') ?? fromError.endpoint;
	// A stored PixelLab failure often keeps only provider text, which is never reported: say what kind of problem it was.
	const text =
		english || (endpoint && !problem.uncaught ? 'A PixelLab request failed' : unexpected);
	const method = METHODS.has(facts.method ?? '') ? facts.method : fromError.method;
	const seconds = count(facts.seconds);
	const uptime = count(typeof problem.uptime === 'number' ? Math.round(problem.uptime) : undefined);
	const lines: [string, string | number | undefined][] = [
		['Area', area],
		['Kind', kind],
		[
			'Download',
			typeof facts.download === 'string' && Object.hasOwn(DOWNLOAD_LABELS, facts.download)
				? DOWNLOAD_LABELS[facts.download]
				: undefined
		],
		[
			'Service worker',
			typeof facts.serviceWorkerControlled === 'boolean'
				? facts.serviceWorkerControlled
					? 'controlling page'
					: 'not controlling page'
				: undefined
		],
		['Character', characterFacts(facts.character, area)],
		// The message itself is already the problem text; a plain "Error" name says nothing more.
		['Message key', english && shown?.key],
		['Export format', oneOf(ENGINE_IDS, facts.exportFormat)],
		['Download step', oneOf(new Set<string>(DOWNLOAD_STEPS), facts.step)],
		// A lone plain "Error" says nothing more than the message; a cause behind it does.
		[
			'Error type',
			errorChain.length > 1 || (errorChain[0] && errorChain[0] !== 'Error')
				? errorChain.join(', caused by ')
				: undefined
		],
		['Failed file', fromError.module],
		['Thrown at', fromError.frames?.join(' < ')],
		['Error kind', fromError.kind],
		['HTTP status', count(facts.status, 999) || fromError.status],
		['Endpoint', endpoint && (method ? `${method} ${endpoint}` : endpoint)],
		['Queue state', oneOf(RECORD_STATES, facts.state)],
		['Job status', JOB_STATUSES.has(facts.jobStatus ?? '') ? facts.jobStatus : undefined],
		['Phase', oneOf(PHASES, facts.phase)],
		['Queue role', oneOf(QUEUE_ROLES, facts.queueRole)],
		['Error code', count(facts.errorCode, 99999)],
		['Attempts', count(facts.attempts, 999)],
		['Ran for', seconds === undefined ? undefined : duration(seconds)],
		['App open for', uptime === undefined ? undefined : duration(uptime)],
		[
			'Seen',
			problem.record && problem.failedAt === undefined
				? 'in an earlier visit or another tab'
				: undefined
		],
		['Connection', facts.offline === true ? 'offline' : undefined],
		['Update', facts.updateWaiting === true ? 'a newer version was waiting to load' : undefined]
	];
	const trail = trailText(problem, context, english && shown?.key);
	// The trail comes last: if the URL must shrink, its oldest entries go first.
	const details = [
		lines
			.filter(([, value]) => value !== undefined && value !== '')
			.map(([label, value]) => `${label}: ${value}`)
			.join('\n'),
		trail
	]
		.filter(Boolean)
		.join('\n\n');
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

/** Shrinks the report until the prefilled URL fits, so the preview always shows exactly what the URL carries: first whole
 *  trail entries, oldest first, then the longest field by halves. */
function fit(report: ProblemReport): ProblemReport {
	let current = report;
	while (reportUrl(current).length > MAX_URL_LENGTH) {
		const lines = current.details.split('\n');
		if (lines.length > 2 && lines.at(-1)!.startsWith('- ')) {
			lines.pop();
			// The heading and its blank line go with the last entry.
			if (!lines.at(-1)!.startsWith('- ')) lines.splice(-2);
			current = { ...current, details: lines.join('\n') };
			continue;
		}
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
