// Project folder publishing for the open character: link a game folder once, then PixelDoll writes the export's files
// into it and keeps them current after each change. Strictly additive: where the browser cannot write folders this does
// nothing, and every failure becomes a status (and, in the background, at most one notice), never a thrown error.
import { buildExport } from '../lib/export/build.ts';
import { ACTION_LAYER_ENGINES } from '../lib/export/export.ts';
import { walkMoves } from '../lib/export/rpgmaker.ts';
import { message, type Message } from '../lib/message.ts';
import {
	allLinks,
	deleteLink,
	deleteRecord,
	getLink,
	readRecord,
	recordKey,
	recordWritten,
	replaceLink,
	setKept,
	updateLink,
	type FolderLink
} from '../lib/project-folder/links.ts';
import type { PlanAction } from '../lib/project-folder/plan.ts';
import {
	hashFiles,
	inSync,
	matchesRecord,
	publishFiles,
	type FailureReason,
	type FolderFile
} from '../lib/project-folder/publish.ts';
import { folderSupport, type FolderSupport } from '../lib/project-folder/support.ts';
import { directoryTarget } from '../lib/project-folder/target.ts';
import { readExportSettings } from '../lib/store/export-settings.ts';
import type { Engine } from '../lib/store/manifest.ts';
import { workspaceCopy } from '../lib/store/workspace-mode.ts';
import { characterZipId, editableData, exportSource } from './download.svelte.ts';
import { exportActionLayering } from './exportLayering.ts';
import { openSettings } from './settingsNavigation.svelte.ts';
import { dismissToast, doc, prepareWorkspaceExport, store, toast, ui } from './state.svelte.ts';
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
	| { kind: 'failed'; reason: FailureReason };

class FolderState {
	support = $state<FolderSupport | 'checking'>('checking');
	/** The open character's link, once read. */
	link = $state.raw<FolderLink | null>(null);
	status = $state.raw<FolderStatus>({ kind: 'idle' });
}
export const projectFolder = new FolderState();

/** "Updated 2 minutes ago", or "Updated just now" within the first minute. */
export function updatedLabel(iso: string, now: number) {
	const time = timeAgo(iso, now);
	return time ? t('projectFolder.updated', { time }) : t('projectFolder.justUpdated');
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
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let running: Promise<void> | null = null;
/** Requests waiting behind the running one, one per link, in arrival order. */
const queued = new Map<string, Request>();
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
const setStatus = (characterId: string, status: FolderStatus) => {
	if (loadedFor === characterId) projectFolder.status = status;
};
/** Counts this tab's own changes to the link (Update automatically), so a read that started before one never shows the
 *  older value over it. */
let linkChanges = 0;
/** @param readAt linkChanges when the shown value was read; a change made since wins. */
const showLink = (characterId: string, link: FolderLink | null, readAt = linkChanges) => {
	if (loadedFor === characterId && readAt === linkChanges) projectFolder.link = link;
};

/** Reads the open character's link when the character changes. */
export async function loadFolderLink(characterId: string) {
	if (loadedFor === characterId) return;
	loadedFor = characterId;
	projectFolder.link = null;
	projectFolder.status = { kind: 'idle' };
	if ((await checkFolderSupport()) !== 'supported' || !characterId) return;
	const readAt = linkChanges;
	try {
		showLink(characterId, await getLink(characterId), readAt);
	} catch (error) {
		// Shown in Settings, so a storage failure never looks like "no folder".
		console.warn('Could not read the linked project folder', error);
		setStatus(characterId, { kind: 'failed', reason: 'unknown' });
	}
}

/** Everything an export reads from the character, taken in one step: the open character once its edits are saved (a
 *  failed save throws), any other as last saved. Null when the character is gone from the library. */
async function snapshot(id: string) {
	if (doc.id === id) await prepareWorkspaceExport();
	else if (!store.projects.some((p) => p.id === id)) return null;
	const { project, look, record } = await exportSource(id);
	const manifest = structuredClone(project.manifest);
	return {
		project: { ...project, manifest },
		look,
		projectData: editableData(record),
		actionLayering: exportActionLayering(id, manifest.rig.animations, true)
	};
}
type Snapshot = NonNullable<Awaited<ReturnType<typeof snapshot>>>;

/** The export's files, as the Export sheet would build them, or null when no export can be built. */
async function buildFiles(
	link: FolderLink,
	input: Snapshot,
	settings: Awaited<ReturnType<typeof readExportSettings>>,
	exportedAt: string
): Promise<FolderFile[] | null> {
	const rpg = link.engine === 'rpgmaker' || link.engine === 'rpgmakerxp';
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
		filesOnly: true
	});
	return result.kind === 'requested'
		? result.entries.map(({ name, data }) => ({ name, data }))
		: null;
}

async function permission(link: FolderLink): Promise<PermissionState> {
	try {
		return await link.handle.queryPermission(RW);
	} catch (error) {
		console.warn('Could not check project folder access', error);
		return 'prompt';
	}
}

/** Runs `work` alone across tabs where Web Locks exist. */
function locked<T>(name: string, work: () => Promise<T>): Promise<T> {
	return navigator.locks
		? navigator.locks.request(`pixeldoll:project-folder:${name}`, work)
		: work();
}

/** One publish, link change or unlink at a time per destination. */
const exclusive = <T>(link: FolderLink, work: () => Promise<T>) =>
	locked(`folder:${link.subfolder.toLowerCase()}`, work);

function notify(link: FolderLink, kind: string, manual: boolean, show: () => void) {
	const key = `${link.characterId}:${kind}`;
	// A problem from a click is already on screen in Settings; background ones are reported once per session.
	if (manual || noticed.has(key)) return;
	noticed.add(key);
	show();
}

const review = {
	action: () => openSettings('export', 'project-folder'),
	actionLabel: message('projectFolder.review')
};
/** Notices that need the user stay until dismissed, so a paused publish is never missed. */
const lasting = { tone: 'warning' as const, report: false, duration: 0 };

/** The project folder notice last shown and the character it is about, so a publish that resolves that character's
 *  problem can take it down again. */
let shownNotice: { id: string; text: unknown } | undefined;
const notice = (id: string, text: Message, options: Parameters<typeof toast>[1]) => {
	shownNotice = { id, text };
	return toast(text, options);
};
/** Takes down the notice about this character once its problem is resolved, unless another notice replaced it. */
function clearNotice(id: string) {
	if (shownNotice?.id !== id) return;
	if (ui.toast === shownNotice.text) dismissToast();
	shownNotice = undefined;
}

/** The stored link, if it is still the one this request was made for; another tab may have stopped or replaced it. */
async function stillLinked(link: FolderLink): Promise<FolderLink | null | 'unknown'> {
	try {
		const current = await getLink(link.characterId);
		return current && current.linkedAt === link.linkedAt ? current : null;
	} catch (error) {
		console.warn('Could not recheck the linked project folder', error);
		return 'unknown';
	}
}

async function publish(link: FolderLink, request: Request) {
	const id = link.characterId;
	await exclusive(link, async () => {
		// Taken once this publish holds the folder, so it is as fresh as it can be: one that waited behind another tab's
		// publish never writes the look from before that wait. Only a saved character is published.
		const seen = behind;
		let input: Snapshot | null;
		try {
			input = await snapshot(id);
		} catch (error) {
			console.warn('Project folder publish waits for a save', error);
			return setStatus(id, request.manual ? { kind: 'unavailable' } : { kind: 'idle' });
		}
		if (!input) return;
		const settings = await readExportSettings();
		let readAt = linkChanges;
		const checked = await stillLinked(link);
		// Without a fresh read this tab cannot know whether the folder was stopped elsewhere, so it waits.
		if (checked === 'unknown') return setStatus(id, { kind: 'failed', reason: 'unknown' });
		if (!checked) {
			showLink(id, await getLink(id).catch(() => null), readAt);
			return setStatus(id, { kind: 'idle' });
		}
		link = checked;
		showLink(id, link, readAt);
		// Update automatically may have been turned off in another tab.
		if (!request.manual && !link.auto) return;
		if ((await permission(link)) !== 'granted') return lostAccess(link, request.manual);
		// Read before "publishing" replaces it: a problem on screen must be rechecked on disk, never cleared unseen.
		const showingProblem = loadedFor === id && folderNeedsAttention(projectFolder.status);
		// Up to date, unless a change made while this ran (with automatic updates off) means it published an older look.
		const finished = (status: Extract<FolderStatus, { kind: 'done' }>) => {
			for (const k of [...noticed]) if (k.startsWith(`${id}:`)) noticed.delete(k);
			clearNotice(id);
			setStatus(id, behind !== seen ? { kind: 'idle' } : status);
		};
		setStatus(id, { kind: 'publishing' });
		const key = recordKey(link);
		if (request.release) await setKept(key, [], false);
		if (request.keep?.length) await setKept(key, request.keep, true);
		const record = await readRecord(key);
		const target = directoryTarget(link.handle, [link.subfolder]);
		// Reusing the last timestamp first means an unchanged character matches what is there and writes nothing.
		if (link.exportedAt && !request.overwrite) {
			const same = await buildFiles(link, input, settings, link.exportedAt);
			const next = same && (await hashFiles(same));
			if (
				next &&
				// A click, or a problem still on screen, checks the folder itself: only a quiet background check may trust
				// the record alone, so a shown problem is never cleared without looking.
				(request.manual || showingProblem
					? await inSync(target, record, next)
					: matchesRecord(record, next))
			)
				return finished({ kind: 'done', kept: record.kept.length, already: request.manual });
		}
		const now = new Date().toISOString();
		const files = await buildFiles(link, input, settings, now);
		if (!files) return setStatus(id, { kind: 'unavailable' });
		// Building takes a moment: recheck that the link was not stopped or replaced meanwhile.
		readAt = linkChanges;
		const recheck = await stillLinked(link);
		if (recheck === 'unknown') return setStatus(id, { kind: 'failed', reason: 'unknown' });
		if (!recheck) return setStatus(id, { kind: 'idle' });
		showLink(id, recheck, readAt);
		// Update automatically may also have been turned off meanwhile.
		if (!request.manual && !recheck.auto) return setStatus(id, { kind: 'idle' });
		const outcome = await publishFiles(target, files, {
			record,
			overwrite: request.overwrite,
			onRecord: (path, hash) => recordWritten(key, path, hash),
			// Planning reads every file, which takes a moment: the last chance to notice a stop before anything is written.
			proceed: async () => {
				const latest = await stillLinked(link);
				return typeof latest === 'object' && !!latest && (request.manual || latest.auto);
			}
		});
		switch (outcome.kind) {
			case 'stopped':
				return setStatus(id, { kind: 'idle' });
			case 'published':
			case 'unchanged':
				if (outcome.kind === 'published') {
					try {
						readAt = linkChanges;
						const stored = await updateLink(id, link.linkedAt, {
							exportedAt: now,
							publishedAt: now
						});
						if (stored) showLink(id, stored, readAt);
					} catch (error) {
						console.warn('Could not record the project folder publish', error);
					}
				}
				return finished({
					kind: 'done',
					kept: outcome.kept,
					already: request.manual && outcome.kind === 'unchanged'
				});
			case 'blocked':
				setStatus(id, { kind: 'blocked', conflicts: outcome.conflicts, linkedAt: link.linkedAt });
				return notify(link, 'blocked', request.manual, () =>
					notice(id, message('projectFolder.toast.paused'), { ...lasting, ...review })
				);
			case 'failed':
				console.warn('Project folder publish failed', outcome.error);
				if (outcome.reason === 'permission') return lostAccess(link, request.manual);
				if (outcome.reason === 'missing') {
					setStatus(id, { kind: 'missing' });
					return notify(link, 'missing', request.manual, () =>
						notice(id, message('projectFolder.toast.missing', { folder: link.handle.name }), {
							...lasting,
							...review
						})
					);
				}
				setStatus(id, { kind: 'failed', reason: outcome.reason });
				return notify(link, `failed:${outcome.reason}`, request.manual, () =>
					notice(id, message('projectFolder.toast.failed', { folder: link.handle.name }), {
						tone: 'warning',
						error: outcome.error,
						// A locked file, a full disk or a refused folder is the user's to fix, not a bug to report.
						report: outcome.reason === 'unknown' ? undefined : false,
						...review
					})
				);
		}
	});
}

function lostAccess(link: FolderLink, manual: boolean) {
	setStatus(link.characterId, { kind: 'reconnect' });
	notify(link, 'reconnect', manual, () =>
		notice(
			link.characterId,
			message('projectFolder.toast.reconnect', { folder: link.handle.name }),
			{
				...lasting,
				// A notice's button is a click, so the browser can ask for access straight away.
				action: () => void reconnectProjectFolder(link),
				actionLabel: message('projectFolder.reconnect')
			}
		)
	);
}

/** Publishes one request at a time; a request arriving meanwhile runs next, keeping a manual request, an approval and
 *  the latest change. Never rejects. */
function run(request: Request): Promise<void> {
	if (running) {
		// Requests for different links never merge, so an approval can only apply to the folder it was made for.
		const waiting = queued.get(request.linkedAt);
		queued.set(
			request.linkedAt,
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
		return running;
	}
	running = (async () => {
		let next: Request | undefined = request;
		while (next) {
			const current: Request = next;
			const link = current.link;
			if (usable()) {
				try {
					await publish(link, current);
				} catch (error) {
					console.warn('Project folder publish stopped', error);
					setStatus(link.characterId, { kind: 'failed', reason: 'unknown' });
					notify(link, 'failed:unknown', current.manual, () =>
						notice(
							link.characterId,
							message('projectFolder.toast.failed', { folder: link.handle.name }),
							{
								tone: 'warning',
								error,
								...review
							}
						)
					);
				}
			}
			next = queued.values().next().value;
			if (next) queued.delete(next.linkedAt);
		}
	})().finally(() => (running = null));
	return running;
}

/** After a change while automatic updates are off: the folder no longer holds the latest look, so it stops reading as
 *  up to date until the next Update now. */
export function folderFallsBehind() {
	const link = projectFolder.link;
	if (!link || link.auto) return;
	behind++;
	if (projectFolder.status.kind === 'done') setStatus(link.characterId, { kind: 'idle' });
}
/** Counts changes made while automatic updates are off, so a publish that ran across one does not claim Up to date. */
let behind = 0;

/** After a change: republish soon if this character publishes automatically. */
export function scheduleFolderPublish() {
	const link = projectFolder.link;
	if (!usable() || !link?.auto || link.characterId !== doc.id) return;
	clearTimeout(timers.get(link.linkedAt));
	timers.set(
		link.linkedAt,
		setTimeout(() => {
			timers.delete(link.linkedAt);
			void run({ manual: false, linkedAt: link.linkedAt, link });
		}, AUTO_DELAY_MS)
	);
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
	if (doc.id !== characterId) return;
	let link: FolderLink;
	try {
		// Claiming a folder happens one tab at a time, and waits for any publish into the previous folder to finish.
		const saved = await locked('links', async () => {
			// Read fresh: another tab may have linked or stopped this character since this tab last looked.
			const previous = await getLink(characterId);
			const same = !!previous && (await sameFolder(previous.handle, handle));
			const fresh: FolderLink = {
				characterId,
				handle,
				subfolder: same ? previous.subfolder : characterZipId(project.manifest),
				engine,
				auto: previous?.auto ?? true,
				// Unique even when two tabs link in the same millisecond: it identifies this link and its approvals.
				linkedAt: `${new Date().toISOString()} ${crypto.randomUUID()}`
			};
			// One folder per character: another character's files there are never touched.
			for (const other of await allLinks())
				if (
					other.characterId !== characterId &&
					other.subfolder.toLowerCase() === fresh.subfolder.toLowerCase() &&
					(await sameFolder(other.handle, handle))
				)
					return null;
			// Picking the same folder again keeps what PixelDoll knows it wrote there. replaceLink also keeps the stored Update
			// automatically choice, which may change while this waits for a publish into the previous folder.
			const replace = () => replaceLink(fresh, previous, same);
			return previous ? exclusive(previous, replace) : replace();
		});
		if (!saved) return setStatus(characterId, { kind: 'taken' });
		link = saved;
	} catch (error) {
		// Without stored records PixelDoll could not tell its files from the user's, so it publishes nothing.
		console.warn('Could not save the linked project folder', error);
		return setStatus(characterId, { kind: 'failed', reason: 'unknown' });
	}
	showLink(characterId, link);
	// This link's own first publish, even if another character was opened meanwhile.
	await run({ manual: true, linkedAt: link.linkedAt, link });
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
	const link = projectFolder.link;
	if (!usable() || !link) return;
	if (
		expected &&
		(expected.characterId !== link.characterId || expected.linkedAt !== link.linkedAt)
	) {
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
	const change = ++linkChanges;
	try {
		// Null means another tab stopped or replaced this link.
		showLink(link.characterId, await updateLink(link.characterId, link.linkedAt, { auto }), change);
	} catch (error) {
		console.warn('Could not save Update automatically', error);
		setStatus(link.characterId, { kind: 'failed', reason: 'unknown' });
		return;
	}
	if (auto) scheduleFolderPublish();
}

/** Stops publishing; files already in the folder stay. */
export async function unlinkProjectFolder() {
	const link = projectFolder.link;
	if (!link) return;
	clearTimeout(timers.get(link.linkedAt));
	timers.delete(link.linkedAt);
	try {
		// Waits for a publish into this folder to finish; only this link goes, so a newer one from another tab stays.
		await exclusive(link, async () => {
			await deleteLink(link.characterId, link.linkedAt);
			await deleteRecord(recordKey(link));
		});
	} catch (error) {
		console.warn('Could not remove the linked project folder', error);
		setStatus(link.characterId, { kind: 'failed', reason: 'unknown' });
		return;
	}
	showLink(link.characterId, null);
	setStatus(link.characterId, { kind: 'idle' });
}
