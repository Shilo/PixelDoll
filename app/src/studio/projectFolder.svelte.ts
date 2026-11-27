// Project folder publishing for the open character: link a game folder once, then PixelDoll writes the export's files
// into it and keeps them current after each change. Strictly additive: where the browser cannot write folders this does
// nothing, and every failure becomes a status (and, in the background, at most one notice), never a thrown error.
import { buildExport } from '../lib/export/build.ts';
import { ACTION_LAYER_ENGINES } from '../lib/export/export.ts';
import { walkMoves } from '../lib/export/rpg-maker.ts';
import { message, sameMessage, type Message } from '../lib/message.ts';
import {
	byScope,
	characterFolder,
	isSharedDir,
	combineRecords,
	hasRuntime,
	runtimeDir,
	runtimeKey,
	scopeOf,
	SHARED_DIR,
	under,
	type Scope
} from '../lib/project-folder/layout.ts';
import {
	addDestination,
	allDestinations,
	allLinks,
	deleteLink,
	deleteRecord,
	getLink,
	raiseFloor,
	readFloor,
	readRecord,
	recordKey,
	recordWritten,
	replaceLink,
	setKept,
	updateLink,
	type Destination,
	type FolderLink
} from '../lib/project-folder/links.ts';
import { NOT_A_FILE, type PlanAction } from '../lib/project-folder/plan.ts';
import {
	hashAt,
	hashFiles,
	inSync,
	matchesRecord,
	publishFiles,
	sha256,
	type FailureReason,
	type FolderFile
} from '../lib/project-folder/publish.ts';
import { folderSupport, type FolderSupport } from '../lib/project-folder/support.ts';
import { directoryTarget, type FolderTarget } from '../lib/project-folder/target.ts';
import { readExportSettings } from '../lib/store/export-settings.ts';
import type { Engine } from '../lib/store/manifest.ts';
import { workspaceCopy } from '../lib/store/workspace-mode.ts';
import { characterZipId, editableData, exportSource } from './download.svelte.ts';
import { exportActionLayering } from './exportLayering.ts';
import { openSettings } from './settingsNavigation.svelte.ts';
import {
	dismissToast,
	doc,
	openingProjectId,
	openProject,
	prepareWorkspaceExport,
	store,
	toast,
	ui
} from './state.svelte.ts';
import { timeAgo } from './timeAgo.ts';
import { t } from 'svelte-whisper';

export type FolderStatus =
	| { kind: 'idle' }
	| { kind: 'publishing' }
	/** `kept`: files the user chose to keep as they are. */
	/** `already`: answers an Update now click that found nothing to write ("Already up to date"). */
	| { kind: 'done'; kept: number; already: boolean }
	/** Another character already publishes into this folder. */
	| { kind: 'taken' }
	| { kind: 'reconnect' }
	| { kind: 'missing' }
	/** `linkedAt`: the link these conflicts were found in; an approval only ever applies to that link. */
	| { kind: 'blocked'; conflicts: PlanAction[]; linkedAt: string }
	| { kind: 'unavailable' }
	/** Another tab with a newer PixelDoll has updated this folder's shared runtime: this tab would write an older one. */
	| { kind: 'outdated' }
	/** The picked folder is inside one PixelDoll manages (`inside`), or a Unity link would install a second runtime in
	 *  one game (`unity`). */
	| { kind: 'overlap'; unity: boolean }
	| { kind: 'failed'; reason: FailureReason };

class FolderState {
	support = $state<FolderSupport | 'checking'>('checking');
	/** The open character's link, once read. */
	link = $state.raw<FolderLink | null>(null);
	status = $state.raw<FolderStatus>({ kind: 'idle' });
	/** After choosing a folder: files there that already hold exactly what PixelDoll writes, offered once to be kept
	 *  updated. Declining leaves them the user's, as any file PixelDoll did not write. */
	offer = $state.raw<{ linkedAt: string; files: PlanAction[] } | null>(null);
}
export const projectFolder = new FolderState();

/** "Updated 2 minutes ago", or "Updated just now" within the first minute. */
export function updatedLabel(iso: string, now: number) {
	const time = timeAgo(iso, now);
	return time ? t('projectFolder.updated', { time }) : t('projectFolder.justUpdated');
}

/** Where a link's files land, as shown everywhere: the picked folder's name and the character's subfolder (browsers
 *  give only the folder's name, never its full path). */
export const folderPath = (link: Pick<FolderLink, 'handle' | 'subfolder'>) =>
	`${link.handle.name}/${link.subfolder}/`;

/** Where the engine runtime every character in the folder shares lands, or null for an engine without one. */
export const runtimePath = (link: Pick<FolderLink, 'handle' | 'engine'>) =>
	hasRuntime(link.engine) ? `${link.handle.name}/${runtimeDir(link.engine)}/` : null;

/** The parts of the picked folder a link publishes into, each with its own trusted record: the character's subfolder,
 *  and the engine's shared runtime. */
const scopesOf = (link: FolderLink): Scope[] => [
	{ dir: link.subfolder, key: recordKey(link) },
	...(hasRuntime(link.engine)
		? [{ dir: runtimeDir(link.engine), key: runtimeKey(link.destinationId, link.engine) }]
		: [])
];

/** The link's trusted record, every path relative to the picked folder. */
const readRecords = async (scopes: readonly Scope[]) =>
	combineRecords(
		await Promise.all(scopes.map(async (scope) => ({ scope, record: await readRecord(scope.key) })))
	);

/** Records a picked-folder-relative path in its own scope's record. */
function recordAt(scopes: readonly Scope[], path: string, hash: string | null) {
	const found = scopeOf(scopes, path);
	if (!found) throw new Error(`No project folder record for ${path}`);
	return recordWritten(found.scope.key, found.path, hash);
}

/** Whether the open character's folder needs the user. */
export const folderNeedsAttention = (status: FolderStatus) =>
	!['idle', 'publishing', 'done'].includes(status.kind);

/** A publish request, bound to the link it was made for (`linkedAt`), so it never runs against a different one.
 *  `overwrite` approves replacing exact bytes; `keep` marks paths the user keeps; `release` clears every kept path.
 *  `link` is that link, so a request still runs after another character was opened: it publishes its own character as
 *  last saved, never the open one. */
type Request = {
	manual: boolean;
	linkedAt: string;
	link: FolderLink;
	overwrite?: ReadonlyMap<string, string>;
	keep?: readonly string[];
	release?: boolean;
};

const RW = { mode: 'readwrite' } as const;
const AUTO_DELAY_MS = 1500;
let supportCheck: Promise<FolderSupport> | null = null;
let loadedFor = '';
/** Pending automatic publishes, one per link, so a change to one character never cancels another's. */
const timers = new Map<string, { characterId: string; timer: ReturnType<typeof setTimeout> }>();
/** The publishing running for each link; links publish independently, so one folder waiting for another tab never
 *  holds up a different folder. */
const running = new Map<string, Promise<void>>();
/** The request waiting behind each link's running publish. */
const queued = new Map<string, Request>();
/** The problem each character's folder last reported, kept while that character is not open so its pause is neither
 *  cleared unseen by a quiet background check nor lost when the user comes back to review it. */
const problems = new Map<string, { linkedAt: string; status: FolderStatus }>();
/** A link's offer of already matching files, stored on the link until answered, so it waits for a character that was
 *  not open when its first publish finished and survives a reload. */
const offerFor = (link: FolderLink | null) =>
	link?.offered?.length && !answeredHere.has(link.linkedAt)
		? { linkedAt: link.linkedAt, files: link.offered }
		: null;
/** Offers this tab answered, so a refresh reading the link before the answer is stored never shows them again. */
const answeredHere = new Set<string>();
/** Background notices already shown this session, so a lasting problem is reported once rather than on every edit. */
const noticed = new Set<string>();

export function checkFolderSupport(): Promise<FolderSupport> {
	if (workspaceCopy) {
		projectFolder.support = 'unsupported';
		return Promise.resolve('unsupported');
	}
	supportCheck ??= folderSupport().then((support) => (projectFolder.support = support));
	return supportCheck;
}

const usable = () => projectFolder.support === 'supported';
/** @param linkedAt the link a publish reported this for: its problem is kept for that link only, so a later link of the
 *  same character never shows or clears it. */
const setStatus = (characterId: string, status: FolderStatus, linkedAt?: string) => {
	if (linkedAt !== undefined) {
		const known = problems.get(characterId)?.linkedAt === linkedAt;
		if (folderNeedsAttention(status)) problems.set(characterId, { linkedAt, status });
		// Only a publish that checked the folder clears a problem; one that stopped early leaves it showing.
		else if (status.kind === 'done' && known) problems.delete(characterId);
		else if (status.kind === 'idle' && known) status = problems.get(characterId)!.status;
	}
	if (loadedFor === characterId) projectFolder.status = status;
};
/** The status to show for a link newly shown for the open character: its own known problem, or nothing yet. */
const statusFor = (characterId: string, link: FolderLink | null): FolderStatus => {
	const known = problems.get(characterId);
	return known && link && known.linkedAt === link.linkedAt ? known.status : { kind: 'idle' };
};
/** Counts this tab's own changes to each character's link (Update automatically, relink, Unlink), so a read of that
 *  character's link that started before one never shows the older value over it. Kept per character: a change to
 *  one character never discards another character's read. */
const linkChanges = new Map<string, number>();
const changesOf = (characterId: string) => linkChanges.get(characterId) ?? 0;
const noteLinkChange = (characterId: string) => {
	const n = changesOf(characterId) + 1;
	linkChanges.set(characterId, n);
	return n;
};
/** @param readAt changesOf(characterId) when the shown value was read; a change made since wins. */
const showLink = (
	characterId: string,
	link: FolderLink | null,
	readAt = changesOf(characterId)
) => {
	if (loadedFor === characterId && readAt === changesOf(characterId)) projectFolder.link = link;
};

/** Reads the open character's link when the character changes, and again when asked for the same character (Export
 *  opening, the tab coming back into view), since another tab may have linked, replaced or stopped it meanwhile. */
export async function loadFolderLink(characterId: string) {
	const again = loadedFor === characterId;
	if (!again) {
		loadedFor = characterId;
		projectFolder.link = null;
		projectFolder.status = { kind: 'idle' };
		projectFolder.offer = null;
	}
	if ((await checkFolderSupport()) !== 'supported' || !characterId) return;
	const readAt = changesOf(characterId);
	try {
		const link = await getLink(characterId);
		if (loadedFor !== characterId || readAt !== changesOf(characterId)) return;
		const changed = !again || projectFolder.link?.linkedAt !== link?.linkedAt;
		showLink(characterId, link, readAt);
		// A problem this character's folder reported while another character was open, if it is still the same link.
		if (changed) projectFolder.status = statusFor(characterId, link);
		projectFolder.offer = offerFor(link);
	} catch (error) {
		// Shown in Settings, so a storage failure never looks like "no folder"; a read overtaken by this tab's own change
		// (such as Unlink) reports nothing.
		console.warn('Could not read the linked project folder', error);
		if (readAt === changesOf(characterId))
			setStatus(
				characterId,
				newerStorage(error) ? { kind: 'outdated' } : { kind: 'failed', reason: 'unknown' }
			);
	}
}

/** Everything an export reads from the character, taken in one step: the open character once its edits are saved (a
 *  failed save throws), any other as last saved. Null when the character is gone from the library. */
async function snapshot(id: string) {
	if (doc.id === id) await prepareWorkspaceExport();
	else if (!store.projects.some((p) => p.id === id)) return null;
	const { project, look, record, missingImages } = await exportSource(id);
	// A saved character whose artwork cannot all be read would publish a broken export over a working one.
	if (missingImages) return null;
	const manifest = structuredClone(project.manifest);
	return {
		project: { ...project, manifest },
		look,
		projectData: editableData(record),
		actionLayering: exportActionLayering(id, manifest.rig.animations, true)
	};
}
type Snapshot = NonNullable<Awaited<ReturnType<typeof snapshot>>>;

/** Everything a publish builds from, as one hash: equal fingerprints build equal files (the manifest names images by a
 *  hash of their pixels, so their sizes are added; the export's own text does not depend on the interface language). */
const fingerprint = (
	link: FolderLink,
	input: Snapshot,
	settings: Awaited<ReturnType<typeof readExportSettings>>
) =>
	sha256(
		new TextEncoder().encode(
			JSON.stringify([
				__APP_VERSION__,
				__APP_COMMIT__,
				link.engine,
				settings,
				input.project.manifest,
				[...input.project.images].map(([hash, image]) => [hash, image.w, image.h]),
				input.look,
				input.projectData,
				input.actionLayering
			])
		)
	);

/** The export's files in the folder layout, every path relative to the picked folder: the shared runtime first (so
 *  nothing naming it lands before it), then the character's files. Null when no export can be built. `at` gives the
 *  same files with another export time: only the text that carries it changes, so the images are never encoded again.
 *  `revision` is the shared runtime's, for an engine that has one. */
type BuiltFiles = {
	files: FolderFile[];
	revision?: number;
	at: (exportedAt: string) => Promise<FolderFile[] | null>;
};

async function buildFiles(
	link: FolderLink,
	input: Snapshot,
	settings: Awaited<ReturnType<typeof readExportSettings>>,
	exportedAt: string
): Promise<BuiltFiles | null> {
	const rpg = link.engine === 'rpg-maker' || link.engine === 'rpg-maker-xp';
	const result = await buildExport(input.project, {
		engine: link.engine,
		baked: settings.dressedCharacterSheets ?? true,
		look: input.look,
		settings,
		projectData: input.projectData,
		rpgWalk: rpg ? walkMoves(input.project.manifest)[0]?.id : undefined,
		actionLayering:
			settings.actionLayers && ACTION_LAYER_ENGINES.includes(link.engine)
				? input.actionLayering
				: undefined,
		exportedAt,
		filesOnly: true,
		layout: 'folder'
	});
	if (result.kind !== 'requested') return null;
	const bundle = result.bundle;
	// The runtime is shared by every character in the folder, so a build that disagrees with the folder layout (one
	// without the runtime its engine needs, or with one it does not) is never published.
	if (!!bundle !== hasRuntime(link.engine) || (bundle && bundle.engine !== link.engine)) {
		console.warn('Project folder export has an unexpected runtime', link.engine, bundle?.engine);
		return null;
	}
	const runtime = (bundle?.files ?? []).map(({ name, data }) => ({
		name: under(runtimeDir(link.engine), name),
		data
	}));
	const folder = (entries: readonly { name: string; data: Uint8Array }[]) => [
		...runtime,
		...entries.map(({ name, data }) => ({ name: under(link.subfolder, name), data }))
	];
	const files = folder(result.entries);
	const retime = result.retime;
	return {
		files,
		revision: bundle?.revision,
		at: async (time) => {
			if (time === exportedAt) return files;
			const again = retime?.(time);
			if (again) return folder(again);
			// Without another-time support (a test double, say), or when retiming could not account for every use of the
			// time, the export is simply built again: same files, more time.
			return (await buildFiles(link, input, settings, time))?.files ?? null;
		}
	};
}

async function permission(link: FolderLink): Promise<PermissionState> {
	try {
		return await link.handle.queryPermission(RW);
	} catch (error) {
		console.warn('Could not check project folder access', error);
		return 'prompt';
	}
}

/** Runs `work` alone across tabs (folder support requires Web Locks). */
const locked = <T>(name: string, work: () => Promise<T>): Promise<T> =>
	navigator.locks.request(`pixeldoll:project-folder:${name}`, work);

/** One publish, link change or unlink at a time per destination; for an engine with a shared runtime, also one at a time
 *  per picked folder and engine, since every character there writes that runtime. Always taken in this order (subfolder,
 *  then runtime), so two publishes can never wait on each other. */
const exclusive = <T>(link: FolderLink, work: () => Promise<T>) =>
	locked(`folder:${link.destinationId}:${link.subfolder.toLowerCase()}`, () =>
		hasRuntime(link.engine) ? locked(`runtime:${link.destinationId}:${link.engine}`, work) : work()
	);

function notify(link: FolderLink, kind: string, manual: boolean, show: () => unknown) {
	const key = `${link.characterId}:${kind}`;
	// A problem from a click is already on screen in Settings; background ones are reported once per session, counting
	// only a notice that was shown (a more urgent one on screen holds it back).
	if (manual || noticed.has(key)) return;
	if (show() !== false) noticed.add(key);
}

/** A notice's Review: opens that character (it may no longer be the open one) at its Project folder settings. */
const review = (id: string) => ({
	action: async () => {
		// Another character may be opening right now: this one is opened after it, so Settings shows the right one.
		if (doc.id !== id || (openingProjectId() && openingProjectId() !== id)) {
			try {
				await openProject(id);
			} catch (error) {
				console.warn('Could not open the character to review its project folder', error);
				return;
			}
			if (doc.id !== id) return;
		}
		openSettings('export', 'project-folder');
	},
	actionLabel: message('projectFolder.review')
});
/** Notices that need the user stay until dismissed, so a paused publish is never missed. */
const lasting = { tone: 'warning' as const, report: false, duration: 0 };

/** The project folder notice last shown and the character it is about, so a publish that resolves that character's
 *  problem can take it down again. */
let shownNotice: { id: string; linkedAt: string; text: Message } | undefined;
const notice = (link: FolderLink, text: Message, options: Parameters<typeof toast>[1]) => {
	const id = link.characterId;
	shownNotice = { id, linkedAt: link.linkedAt, text };
	return toast(text, options);
};
/** Takes down the notice about this character once its problem is resolved, unless another notice replaced it. */
function clearNotice(id: string, linkedAt?: string) {
	if (shownNotice?.id !== id || (linkedAt !== undefined && shownNotice.linkedAt !== linkedAt))
		return;
	if (sameMessage(ui.toast as Message | undefined, shownNotice.text)) dismissToast();
	shownNotice = undefined;
}

/** A request whose link was stopped or replaced elsewhere: shows what is stored now, and leaves the status alone when a
 *  newer link has one of its own. */
async function superseded(id: string, readAt: number, stale?: string) {
	let current: FolderLink | null;
	try {
		current = await getLink(id);
	} catch {
		return; // the next publish or reopening reads it again
	}
	showLink(id, current, readAt);
	if (loadedFor === id && readAt === changesOf(id)) projectFolder.status = statusFor(id, current);
	// The superseded link's notice and problem go with it.
	if (stale) {
		clearNotice(id, stale);
		if (problems.get(id)?.linkedAt === stale) problems.delete(id);
	}
}

/** Whether the shared runtime files among `files` (path to hash) are on disk exactly so. A quiet check otherwise
 *  trusts PixelDoll's record, but the runtime is every character's in the folder: one deleted or edited there breaks
 *  this character too, so it is always read (it is a few small files). Unreadable counts as not. */
async function runtimeOnDisk(target: FolderTarget, files: Readonly<Record<string, string>>) {
	try {
		for (const [path, hash] of Object.entries(files))
			if (path.startsWith(`${SHARED_DIR}/`) && (await hashAt(target, path)) !== hash) return false;
		return true;
	} catch {
		return false; // the full publish below reads the folder and reports what is wrong
	}
}

/** A kept shared runtime file is the user's to change, never to lose: every character in the folder needs it. Once one
 *  is gone (or a folder took its place), the runtime's keeps are released, so the publish pauses and lists it to restore
 *  instead of writing characters that name a missing script. A file that cannot be read leaves them as they are. */
async function releaseLostRuntime(target: FolderTarget, link: FolderLink) {
	const key = runtimeKey(link.destinationId, link.engine);
	for (const path of (await readRecord(key)).kept) {
		const found = await hashAt(target, under(runtimeDir(link.engine), path)).catch(() => '');
		if (found === null || found === NOT_A_FILE) return setKept(key, [], false);
	}
}

/** The character's export manifest, relative to the picked folder. */
const manifestOf = (link: FolderLink) => under(link.subfolder, 'manifest.json');

/** The time and bytes of an export manifest already in the folder, if it reads as one. */
async function sameEarlierExport(target: FolderTarget, path: string) {
	try {
		const data = await target.read(path);
		if (!data) return null;
		const exportedAt: unknown = JSON.parse(new TextDecoder().decode(data))?.export?.exportedAt;
		return typeof exportedAt === 'string' ? { exportedAt, hash: await sha256(data) } : null;
	} catch {
		return null; // not an export manifest (or unreadable): build as usual
	}
}

/** Whether a publish for this link is already waiting that will run: a click's always does, an automatic one only while
 *  automatic updates are on. */
function willPublish(link: FolderLink) {
	const waiting = queued.get(link.linkedAt);
	return !!waiting && (waiting.manual || link.auto) ? true : link.auto && timers.has(link.linkedAt);
}

/** The stored link, if it is still the one this request was made for; another tab may have stopped or replaced it. */
async function stillLinked(link: FolderLink): Promise<FolderLink | null | 'unknown'> {
	try {
		const current = await getLink(link.characterId);
		return current && current.linkedAt === link.linkedAt ? current : null;
	} catch (error) {
		if (newerStorage(error)) throw error; // reported as outdated: retrying in this tab cannot help
		console.warn('Could not recheck the linked project folder', error);
		return 'unknown';
	}
}

async function publish(link: FolderLink, request: Request) {
	const id = link.characterId;
	const report = (status: FolderStatus) => setStatus(id, status, link.linkedAt);
	await exclusive(link, async () => {
		// Taken once this publish holds the folder, so it is as fresh as it can be: one that waited behind another tab's
		// publish never writes the look from before that wait. Only a saved character is published.
		const settings = await readExportSettings();
		let readAt = changesOf(id);
		let lastCheckFailed = false;
		/** The link could not be read, so this publish waits. A background attempt stays quiet once this tab knows
		 *  automatic updates are off; otherwise the status says it could not finish. */
		const unreadable = () =>
			!request.manual && loadedFor === id && projectFolder.link?.auto === false
				? undefined
				: report({ kind: 'failed', reason: 'unknown' });
		const checked = await stillLinked(link);
		// Without a fresh read this tab cannot know whether the folder was stopped elsewhere, so it waits.
		if (checked === 'unknown') return unreadable();
		if (!checked) return superseded(id, readAt, link.linkedAt);
		link = checked;
		showLink(id, link, readAt);
		// Update automatically may have been turned off in another tab. A finished publish may have shown this one as
		// coming; it is not, so the status stops saying so.
		if (!request.manual && !link.auto) {
			if (loadedFor === id && projectFolder.status.kind === 'publishing') report({ kind: 'idle' });
			return;
		}
		if ((await permission(link)) !== 'granted') return lostAccess(link, request.manual);
		const seen = behind.get(id) ?? 0;
		let input: Snapshot | null;
		try {
			input = await snapshot(id);
		} catch (error) {
			// A background attempt waits for the next save quietly, leaving any problem it knows about in place.
			console.warn('Project folder publish waits for a save', error);
			if (request.manual) return report({ kind: 'unavailable' });
			// A finished publish may have shown this one as coming; it is not, so the status stops saying so.
			if (loadedFor === id && projectFolder.status.kind === 'publishing') report({ kind: 'idle' });
			return;
		}
		if (!input) return;
		// A problem this character's folder reported must be rechecked on disk, never cleared unseen.
		const showingProblem = problems.get(id)?.linkedAt === link.linkedAt;
		// Up to date, unless a change made while this ran (with automatic updates off) means it published an older look.
		const finished = (status: Extract<FolderStatus, { kind: 'done' }>) => {
			for (const k of [...noticed]) if (k.startsWith(`${id}:`)) noticed.delete(k);
			clearNotice(id);
			report(status); // clears this link's problem: the folder was just checked
			if ((behind.get(id) ?? 0) !== seen) report({ kind: 'idle' });
			// A newer change already waiting to publish means this one is not the latest look.
			else if (willPublish(link)) report({ kind: 'publishing' });
		};
		report({ kind: 'publishing' });
		const scopes = scopesOf(link);
		if (request.release) for (const scope of scopes) await setKept(scope.key, [], false);
		if (request.keep?.length)
			for (const [scope, paths] of byScope(scopes, request.keep))
				await setKept(scope.key, paths, true);
		const target = directoryTarget(link.handle);
		if (hasRuntime(link.engine)) await releaseLostRuntime(target, link);
		const record = await readRecords(scopes);
		const MANIFEST = manifestOf(link);
		// Reusing the last timestamp first means an unchanged character matches what is there and writes nothing.
		const inputs = await fingerprint(link, input, settings);
		// Until a publish has completed and the matching-files offer was answered, this is still the folder's first check:
		// a first attempt that failed (a locked file, say) offers on the retry instead.
		// Read from the stored link, never from where the request came from, so an answer given in another tab stands.
		const first = !link.files && link.offered === undefined;
		/** Stores what this publish learned on its link, unless the link changed meanwhile. */
		const remember = async (patch: Parameters<typeof updateLink>[2]) => {
			try {
				readAt = changesOf(id);
				const stored = await updateLink(id, link.linkedAt, patch);
				if (stored) showLink(id, stored, readAt);
			} catch (error) {
				console.warn('Could not record the project folder publish', error);
			}
		};
		// A quiet background check of a character unchanged since its last complete publish needs no build: that
		// publish's files are checked against the record, exactly as a fresh build's would be. Anything the record does
		// not show as PixelDoll's current bytes (a partial publish, a released keep, files not adopted) goes the full way
		// below, which also reads the folder. A click, an approval or a problem on screen always does.
		if (
			!request.manual &&
			!request.overwrite &&
			!showingProblem &&
			link.exportedAt &&
			link.files &&
			link.inputs === inputs &&
			matchesRecord(record, new Map(Object.entries(link.files))) &&
			(await runtimeOnDisk(target, link.files))
		)
			return finished({ kind: 'done', kept: record.kept.length, already: false });
		// It first tries the last time, so an export whose files did not change matches what is there and writes nothing.
		let same: BuiltFiles | null = null;
		if (link.exportedAt && !request.overwrite && !first) {
			same = await buildFiles(link, input, settings, link.exportedAt);
			const next = same && (await hashFiles(same.files));
			if (
				next &&
				// A click, or a problem still on screen, checks the folder itself: only a quiet background check may trust
				// the record alone, so a shown problem is never cleared without looking. Where the record does not cover the
				// files (such as ones the user has not yet chosen to keep updated), the folder decides too: bytes already
				// there need no write.
				(request.manual || showingProblem || !matchesRecord(record, next)
					? await inSync(target, record, next)
					: await runtimeOnDisk(target, Object.fromEntries(next)))
			) {
				// A click read every file and found them current: that is an update as far as the user can tell.
				await remember({
					inputs,
					files: Object.fromEntries(next),
					...(request.manual ? { publishedAt: new Date().toISOString() } : {})
				});
				return finished({ kind: 'done', kept: record.kept.length, already: request.manual });
			}
		}
		const now = new Date().toISOString();
		// The manifest already in the folder decides the time: when a build with the last time, or the time that manifest
		// itself records (such as this character's own earlier export), reproduces it byte for byte, that build is used,
		// so only files that really differ are written and the manifest never pauses over its time alone. Otherwise the
		// export gets a new time.
		// A manifest the user keeps is never written, so it is not read either.
		const there = record.kept.includes(MANIFEST) ? null : await sameEarlierExport(target, MANIFEST);
		let exportedAt = now;
		let files: FolderFile[] | null = null;
		// One build serves the whole publish: another time only rewrites the text that carries it, never the images.
		// Built with a known time (the link's last, else now), so the export's own checks run on it; the folder manifest's
		// time is only tried afterwards, as another candidate.
		const built = same ?? (await buildFiles(link, input, settings, link.exportedAt ?? now));
		if (there && built)
			for (const earlier of new Set([link.exportedAt, there.exportedAt])) {
				if (!earlier) continue;
				const attempt = await built.at(earlier);
				const manifest = attempt?.find((f) => f.name === MANIFEST);
				if (manifest && (await sha256(manifest.data)) === there.hash) {
					files = attempt;
					exportedAt = earlier;
					break;
				}
			}
		files ??= (await built?.at(now)) ?? null;
		if (!files) return report({ kind: 'unavailable' });
		// Building takes a moment: recheck that the link was not stopped or replaced meanwhile.
		readAt = changesOf(id);
		const recheck = await stillLinked(link);
		if (recheck === 'unknown') return unreadable();
		if (!recheck) return superseded(id, readAt, link.linkedAt);
		showLink(id, recheck, readAt);
		// Update automatically may also have been turned off meanwhile.
		if (!request.manual && !recheck.auto) return report({ kind: 'idle' });
		// Checked under this folder's runtime lock: a tab with an older runtime than one another tab began installing
		// stops, since it would put older runtime files back. Otherwise the floor rises just before the first write (once
		// nothing pauses this publish), so an update stopped part way can never be taken back by an older tab either.
		const runtime = hasRuntime(link.engine)
			? { key: runtimeKey(link.destinationId, link.engine), revision: built?.revision ?? 0 }
			: null;
		if (runtime) {
			if ((await readFloor(runtime.key)) > runtime.revision)
				return reportOutdated(link, request.manual);
		}
		const outcome = await publishFiles(target, files, {
			record,
			overwrite: request.overwrite,
			manifest: MANIFEST,
			first: hasRuntime(link.engine) ? runtimeDir(link.engine) : undefined,
			onRecord: (path, hash) => recordAt(scopes, path, hash),
			// Planning reads every file, which takes a moment: the last chance to notice a stop before anything is written.
			proceed: async (writes) => {
				if (!store.projects.some((p) => p.id === id)) return false; // deleted meanwhile
				const latest = await stillLinked(link);
				lastCheckFailed = latest === 'unknown';
				const go = typeof latest === 'object' && !!latest && (request.manual || latest.auto);
				// Only a publish that writes runtime files installs this revision; a character-only one leaves the floor.
				const runtimePrefix = `${runtimeDir(link.engine)}/`;
				if (go && runtime && writes.some((w) => w.path.startsWith(runtimePrefix)))
					await raiseFloor(runtime.key, runtime.revision);
				return go;
			}
		});
		// Matching shared runtime files are left out of the offer: they are used as they are, and trusting them would
		// let a tab with an older runtime replace them without the revision floor that a runtime PixelDoll wrote has.
		const offered =
			outcome.kind === 'stopped' || outcome.kind === 'failed'
				? []
				: (outcome.matching ?? []).filter((m) => !m.path.startsWith(`${SHARED_DIR}/`));
		if (first && offered.length) {
			await remember({ offered });
			if (loadedFor === id) projectFolder.offer = { linkedAt: link.linkedAt, files: offered };
		}
		// The earlier export's time stays in use (also while paused), so a retry still matches its files.
		if (exportedAt !== now && outcome.kind !== 'published' && outcome.kind !== 'unchanged')
			await updateLink(id, link.linkedAt, { exportedAt }).catch((error: unknown) =>
				console.warn('Could not record the project folder export time', error)
			);
		switch (outcome.kind) {
			case 'stopped': {
				// The last link check could not be read: say so rather than stop silently.
				if (lastCheckFailed) return unreadable();
				readAt = changesOf(id);
				const latest = await stillLinked(link);
				return typeof latest === 'object' && latest
					? report({ kind: 'idle' })
					: superseded(id, readAt, link.linkedAt);
			}
			case 'published':
			case 'unchanged':
				{
					const produced = Object.fromEntries(await hashFiles(files));
					await remember(
						outcome.kind === 'published'
							? { exportedAt, publishedAt: now, inputs, files: produced }
							: request.manual
								? { exportedAt, publishedAt: now, inputs, files: produced }
								: { exportedAt, inputs, files: produced }
					);
				}
				return finished({
					kind: 'done',
					kept: outcome.kept,
					already: request.manual && outcome.kind === 'unchanged'
				});
			case 'blocked':
				report({ kind: 'blocked', conflicts: outcome.conflicts, linkedAt: link.linkedAt });
				return notify(link, 'blocked', request.manual, () =>
					notice(link, message('projectFolder.toast.paused'), { ...lasting, ...review(id) })
				);
			case 'failed':
				console.warn('Project folder publish failed', outcome.error);
				if (newerStorage(outcome.error)) return reportOutdated(link, request.manual);
				if (outcome.reason === 'permission') return lostAccess(link, request.manual);
				if (outcome.reason === 'missing') {
					report({ kind: 'missing' });
					return notify(link, 'missing', request.manual, () =>
						notice(link, message('projectFolder.toast.missing', { folder: link.handle.name }), {
							...lasting,
							...review(id)
						})
					);
				}
				report({ kind: 'failed', reason: outcome.reason });
				return notify(link, `failed:${outcome.reason}`, request.manual, () =>
					notice(link, message('projectFolder.toast.failed', { folder: link.handle.name }), {
						tone: 'warning',
						error: outcome.error,
						// A locked file, a full disk or a refused folder is the user's to fix, not a bug to report.
						report: outcome.reason === 'unknown' ? undefined : false,
						...review(id)
					})
				);
		}
	});
}

/** A newer PixelDoll in another tab got ahead of this one (its runtime, or its project folder storage): this tab must
 *  reload before it may write this folder again. */
function reportOutdated(link: FolderLink, manual: boolean) {
	setStatus(link.characterId, { kind: 'outdated' }, link.linkedAt);
	notify(link, 'outdated', manual, () =>
		notice(link, message('projectFolder.toast.outdated', { folder: link.handle.name }), {
			...lasting,
			action: () => location.reload(),
			actionLabel: message('projectFolder.reload')
		})
	);
}

/** Project folder storage that a newer PixelDoll has upgraded can no longer be opened by this one. */
const newerStorage = (error: unknown) =>
	error instanceof DOMException && error.name === 'VersionError';

function lostAccess(link: FolderLink, manual: boolean) {
	setStatus(link.characterId, { kind: 'reconnect' }, link.linkedAt);
	notify(link, 'reconnect', manual, () =>
		notice(link, message('projectFolder.toast.reconnect', { folder: link.handle.name }), {
			...lasting,
			// A notice's button is a click, so the browser can ask for access straight away.
			action: () => reconnectProjectFolder(link),
			actionLabel: message('projectFolder.reconnect')
		})
	);
}

/** Publishes one request at a time; a request arriving meanwhile runs next, keeping a manual request, an approval and
 *  the latest change. Never rejects. */
function run(request: Request): Promise<void> {
	const key = request.linkedAt;
	const active = running.get(key);
	if (active) {
		// Requests for different links never merge, so an approval can only apply to the folder it was made for.
		const waiting = queued.get(key);
		queued.set(
			key,
			waiting
				? {
						manual: request.manual || waiting.manual,
						linkedAt: request.linkedAt,
						link: request.link,
						overwrite: request.overwrite ?? waiting.overwrite,
						keep: [...(waiting.keep ?? []), ...(request.keep ?? [])],
						release: request.release || waiting.release
					}
				: request
		);
		return active;
	}
	const chain = (async () => {
		let next: Request | undefined = request;
		while (next) {
			const current: Request = next;
			const link = current.link;
			if (usable()) {
				try {
					await publish(link, current);
				} catch (error) {
					console.warn('Project folder publish stopped', error);
					if (newerStorage(error)) reportOutdated(link, current.manual);
					else {
						setStatus(link.characterId, { kind: 'failed', reason: 'unknown' }, link.linkedAt);
						notify(link, 'failed:unknown', current.manual, () =>
							notice(link, message('projectFolder.toast.failed', { folder: link.handle.name }), {
								tone: 'warning',
								error,
								...review(link.characterId)
							})
						);
					}
				}
			}
			next = queued.get(key);
			queued.delete(key);
		}
	})().finally(() => running.delete(key));
	running.set(key, chain);
	return chain;
}

/** After a change while automatic updates are off: the folder no longer holds the latest look, so it stops reading as
 *  up to date until the next Update now. */
export function folderFallsBehind() {
	const link = projectFolder.link;
	if (!link || link.auto) return;
	behind.set(link.characterId, (behind.get(link.characterId) ?? 0) + 1);
	if (projectFolder.status.kind === 'done') setStatus(link.characterId, { kind: 'idle' });
}
/** Counts each character's changes made while automatic updates are off, so a publish that ran across one does not
 *  claim Up to date. */
const behind = new Map<string, number>();

/** After a change: republish soon if this character publishes automatically. */
export function scheduleFolderPublish() {
	const link = projectFolder.link;
	if (!usable() || !link?.auto || link.characterId !== doc.id) return;
	if (projectFolder.status.kind === 'done') setStatus(link.characterId, { kind: 'idle' });
	clearTimeout(timers.get(link.linkedAt)?.timer);
	timers.set(link.linkedAt, {
		characterId: link.characterId,
		timer: setTimeout(() => {
			timers.delete(link.linkedAt);
			void run({ manual: false, linkedAt: link.linkedAt, link });
		}, AUTO_DELAY_MS)
	});
}

/** The open link, if it is the one `linkedAt` names (when given): a decision made about one folder never reaches another. */
function current(linkedAt?: string) {
	const link = projectFolder.link;
	return link && (!linkedAt || link.linkedAt === linkedAt) ? link : null;
}

/** Publish now, or replace the listed conflicting files when `overwrite` maps each to the bytes the user saw in the link
 *  `linkedAt` names. */
export function publishProjectFolder(overwrite?: ReadonlyMap<string, string>, linkedAt?: string) {
	const link = current(linkedAt);
	return link ? run({ manual: true, linkedAt: link.linkedAt, link, overwrite }) : Promise.resolve();
}

/** Keep mine: PixelDoll stops writing these files of the link `linkedAt` names, and publishes the rest. */
export function keepProjectFolderFiles(paths: readonly string[], linkedAt: string) {
	const link = current(linkedAt);
	return link
		? run({ manual: true, linkedAt: link.linkedAt, link, keep: paths })
		: Promise.resolve();
}

/** Keeps the offered matching files updated: each becomes PixelDoll's only while it still holds exactly the bytes that
 *  were found, checked again now, so a file changed since the offer stays the user's. */
export async function adoptMatchingFiles() {
	const offer = projectFolder.offer;
	const link = offer && current(offer.linkedAt);
	if (!offer || !link) return;
	try {
		await exclusive(link, async () => {
			const latest = await stillLinked(link);
			// Unknown is retried by clicking again; a link stopped or replaced elsewhere has nothing left to adopt.
			if (latest === 'unknown') throw new Error('Could not recheck the linked project folder');
			if (!latest) return;
			const target = directoryTarget(link.handle);
			const scopes = scopesOf(latest);
			for (const file of offer.files)
				if (file.found && (await hashAt(target, file.path)) === file.found)
					await recordAt(scopes, file.path, file.found);
		});
		// Gone once they are recorded, so the offer's disappearing means it took effect.
		answeredHere.add(offer.linkedAt);
		await answered(link);
		if (projectFolder.offer?.linkedAt === offer.linkedAt) projectFolder.offer = null;
	} catch (error) {
		console.warn('Could not keep the matching project folder files updated', error);
		setStatus(
			link.characterId,
			newerStorage(error) ? { kind: 'outdated' } : { kind: 'failed', reason: 'unknown' },
			link.linkedAt
		);
	}
}

/** Leaves the offered matching files as the user's. */
export async function leaveMatchingFiles() {
	const offer = projectFolder.offer;
	const link = offer && current(offer.linkedAt);
	projectFolder.offer = null;
	if (!offer || !link) return;
	answeredHere.add(offer.linkedAt);
	await answered(link);
}

/** Forgets a link's answered offer, so it is not asked again after a reload. */
async function answered(link: FolderLink) {
	try {
		// An empty list records the answer, so a later retry of the first publish does not ask again.
		const stored = await updateLink(link.characterId, link.linkedAt, { offered: [] });
		if (stored) showLink(link.characterId, stored);
	} catch (error) {
		console.warn('Could not record the answer to the matching files offer', error);
	}
}

/** Stops keeping every kept file, so their differences are reported again. */
export function releaseKeptFiles() {
	const link = projectFolder.link;
	return link
		? run({ manual: true, linkedAt: link.linkedAt, link, release: true })
		: Promise.resolve();
}

/** Must run straight from a click: the folder picker needs the user's gesture. */
export async function linkProjectFolder(engine: Engine) {
	const project = store.project;
	if (!usable() || !project) return;
	const characterId = doc.id;
	let handle: FileSystemDirectoryHandle;
	try {
		handle = await showDirectoryPicker({ ...RW, id: 'pixeldoll-project' });
	} catch (error) {
		if (!(error instanceof DOMException && error.name === 'AbortError')) {
			console.warn('Could not open the folder picker', error);
			setStatus(characterId, { kind: 'failed', reason: 'permission' });
		}
		return;
	}
	let link: FolderLink;
	try {
		// Claiming a folder happens one tab at a time, and waits for any publish into the previous folder to finish.
		const saved = await locked('links', async () => {
			// Read fresh: another tab may have linked or stopped this character since this tab last looked.
			const previous = await getLink(characterId);
			const same = !!previous && (await sameFolder(previous.handle, handle));
			const others = (await allLinks()).filter((other) => other.characterId !== characterId);
			const destinations = await allDestinations();
			// Every link to a folder shares its destination, and with it the engine runtime's record, revision floor and
			// lock, also once every character there was unlinked. A folder that cannot be compared is a new destination:
			// PixelDoll then trusts nothing it finds there, so anything different asks first.
			let destinationId = same ? previous.destinationId : undefined;
			if (!destinationId)
				for (const known of destinations)
					if (await sameFolder(known.handle, handle)) {
						destinationId = known.id;
						break;
					}
			const known = !!destinationId;
			const fresh: FolderLink = {
				characterId,
				handle,
				destinationId: destinationId ?? crypto.randomUUID(),
				subfolder: same ? previous.subfolder : characterFolder(characterZipId(project.manifest)),
				engine: same ? previous.engine : engine,
				auto: previous?.auto ?? true,
				// Unique even when two tabs link in the same millisecond: it identifies this link and its approvals.
				linkedAt: `${new Date().toISOString()} ${crypto.randomUUID()}`
			};
			// One folder per character: another character's files there are never touched.
			for (const other of others)
				if (
					other.subfolder.toLowerCase() === fresh.subfolder.toLowerCase() &&
					(other.destinationId === fresh.destinationId || (await sameFolder(other.handle, handle)))
				)
					return { kind: 'taken' } as const;
			// Each link's folder counts, also one stored before PixelDoll kept folders on their own.
			const folders = new Map(destinations.map((d) => [d.id, d]));
			for (const other of others)
				if (!folders.has(other.destinationId))
					folders.set(other.destinationId, { id: other.destinationId, handle: other.handle });
			// The character's own earlier folder counts too: its runtime stays there after the move.
			const earlier = previous && !same ? [previous] : [];
			for (const other of earlier)
				if (!folders.has(other.destinationId))
					folders.set(other.destinationId, { id: other.destinationId, handle: other.handle });
			const overlap = await overlapping(fresh, [...others, ...earlier], [...folders.values()]);
			if (overlap) return overlap;
			// A folder that ever had a Unity character keeps saying so, since its runtime files stay there.
			if (!known || fresh.engine === 'unity')
				await addDestination({
					...folders.get(fresh.destinationId),
					id: fresh.destinationId,
					handle,
					...(fresh.engine === 'unity' ? { unity: true } : {})
				});
			// Picking the same folder again keeps what PixelDoll knows it wrote there. replaceLink also keeps the stored Update
			// automatically choice, which may change while this waits for a publish into the previous folder.
			const replace = () => replaceLink(fresh, previous, same);
			return previous ? exclusive(previous, replace) : replace();
		});
		if ('kind' in saved) return setStatus(characterId, saved);
		link = saved;
		noteLinkChange(characterId); // this tab's own link change: an older read never shows the previous link over it
		for (const [linkedAt, pending] of timers)
			if (linkedAt !== link.linkedAt && pending.characterId === characterId) {
				clearTimeout(pending.timer);
				timers.delete(linkedAt);
			}
	} catch (error) {
		// Without stored records PixelDoll could not tell its files from the user's, so it publishes nothing.
		console.warn('Could not save the linked project folder', error);
		return setStatus(
			characterId,
			newerStorage(error) ? { kind: 'outdated' } : { kind: 'failed', reason: 'unknown' }
		);
	}
	showLink(characterId, link);
	if (loadedFor === characterId) projectFolder.offer = null;
	// This link's own first publish, even if another character was opened meanwhile.
	await run({ manual: true, linkedAt: link.linkedAt, link });
}

/** Where `inner` is inside `outer`, as folder names, or null when it is not (or that cannot be told). */
async function within(outer: FileSystemDirectoryHandle, inner: FileSystemDirectoryHandle) {
	try {
		return await outer.resolve(inner);
	} catch {
		return null; // a vanished folder holds nothing
	}
}

/** Whether a new link's folder overlaps a folder PixelDoll knows: picked inside a folder it manages (a character's
 *  subfolder or the shared runtime folder), or holding one inside its own. Unity compiles every script in a game, so a
 *  Unity link whose folder nests with one that has a Unity runtime (even one no character is linked to any more: its
 *  files stay) would install it twice and stop the game compiling. Folders side by side in one game cannot be told apart
 *  from two games; the Unity guide asks for one folder per game. */
async function overlapping(
	fresh: FolderLink,
	others: readonly FolderLink[],
	destinations: readonly Destination[]
): Promise<Extract<FolderStatus, { kind: 'overlap' }> | null> {
	const managed = (path: string[] | null, subfolders: readonly string[]) =>
		!!path?.length && (isSharedDir(path[0]) || subfolders.includes(path[0].toLowerCase()));
	for (const destination of destinations) {
		if (destination.id === fresh.destinationId) continue;
		const here = others.filter((other) => other.destinationId === destination.id);
		const inside = await within(destination.handle, fresh.handle);
		const around = await within(fresh.handle, destination.handle);
		if (
			managed(
				inside,
				here.map((other) => other.subfolder.toLowerCase())
			) ||
			managed(around, [fresh.subfolder.toLowerCase()])
		)
			return { kind: 'overlap', unity: false };
		if (
			fresh.engine === 'unity' &&
			(inside || around) &&
			(destination.unity ||
				here.some((other) => other.engine === 'unity') ||
				(await readFloor(runtimeKey(destination.id, 'unity'))) > 0)
		)
			return { kind: 'overlap', unity: true };
	}
	return null;
}

async function sameFolder(a: FileSystemDirectoryHandle, b: FileSystemDirectoryHandle) {
	try {
		return await a.isSameEntry(b);
	} catch {
		// A vanished folder is simply not the same one.
		return false;
	}
}

/** Must run straight from a click, like linking. `expected` is the link a notice was about: if another character or
 *  folder is open now, Settings opens instead of asking for the wrong folder. */
export async function reconnectProjectFolder(expected?: FolderLink) {
	if (!usable()) return;
	// A notice about another character opens that character's settings, where its Reconnect is one click away.
	if (expected && (expected.characterId !== doc.id || openingProjectId()))
		return review(expected.characterId).action();
	const link = projectFolder.link;
	if (!link) return;
	if (expected && expected.linkedAt !== link.linkedAt) {
		openSettings('export', 'project-folder');
		return;
	}
	try {
		if ((await link.handle.requestPermission(RW)) !== 'granted') return;
	} catch (error) {
		console.warn('Could not reconnect the project folder', error);
		return;
	}
	// Bound to the link access was granted for, even if another character opened meanwhile.
	await run({ manual: true, linkedAt: link.linkedAt, link });
}

export async function setFolderAutoPublish(auto: boolean) {
	const link = projectFolder.link;
	if (!link) return;
	const change = noteLinkChange(link.characterId);
	try {
		// Null means another tab stopped or replaced this link.
		showLink(link.characterId, await updateLink(link.characterId, link.linkedAt, { auto }), change);
	} catch (error) {
		console.warn('Could not save Update automatically', error);
		setStatus(
			link.characterId,
			newerStorage(error) ? { kind: 'outdated' } : { kind: 'failed', reason: 'unknown' }
		);
		return;
	}
	if (auto) scheduleFolderPublish();
}

/** Stops publishing; files already in the folder stay. */
export async function unlinkProjectFolder() {
	const link = projectFolder.link;
	if (!link) return;
	clearTimeout(timers.get(link.linkedAt)?.timer);
	timers.delete(link.linkedAt);
	let removed: boolean;
	try {
		// Waits for a publish into this folder to finish; only this link goes, so a newer one from another tab stays.
		// The shared runtime's record stays too: its files stay in the folder, and other characters may use them.
		removed = await exclusive(link, async () => {
			const deleted = await deleteLink(link.characterId, link.linkedAt);
			await deleteRecord(recordKey(link));
			return deleted;
		});
	} catch (error) {
		console.warn('Could not remove the linked project folder', error);
		setStatus(
			link.characterId,
			newerStorage(error) ? { kind: 'outdated' } : { kind: 'failed', reason: 'unknown' }
		);
		return;
	}
	// Another tab had already replaced or stopped this link: show what is stored now rather than claim it was unlinked.
	if (!removed) return superseded(link.characterId, changesOf(link.characterId), link.linkedAt);
	noteLinkChange(link.characterId);
	showLink(link.characterId, null);
	if (loadedFor === link.characterId) projectFolder.offer = null;
	problems.delete(link.characterId);
	clearNotice(link.characterId);
	setStatus(link.characterId, { kind: 'idle' });
}
