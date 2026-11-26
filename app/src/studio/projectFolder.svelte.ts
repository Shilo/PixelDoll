// Project folder publishing for the open character: link a game folder once, then PixelDoll writes the export's files
// into it and keeps them current after each change. Strictly additive: where the browser cannot write folders this does
// nothing, and every failure becomes a status (and, in the background, at most one notice), never a thrown error.
import { buildExport } from '../lib/export/build.ts';
import { ACTION_LAYER_ENGINES } from '../lib/export/export.ts';
import { walkMoves } from '../lib/export/rpgmaker.ts';
import { message, sameMessage, type Message } from '../lib/message.ts';
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
	/** The first publish after choosing this folder, which may offer to keep already matching files updated. */
	fresh?: boolean;
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
/** Each new link's offer of already matching files, kept until answered so it also waits for a character that was not
 *  open when its first publish finished. */
const offers = new Map<string, PlanAction[]>();
const offerFor = (link: FolderLink | null) => {
	const files = link && offers.get(link.linkedAt);
	return files ? { linkedAt: link.linkedAt, files } : null;
};
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
/** Counts this tab's own changes to the link (Update automatically), so a read that started before one never shows the
 *  older value over it. */
let linkChanges = 0;
/** @param readAt linkChanges when the shown value was read; a change made since wins. */
const showLink = (characterId: string, link: FolderLink | null, readAt = linkChanges) => {
	if (loadedFor === characterId && readAt === linkChanges) projectFolder.link = link;
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
	const readAt = linkChanges;
	try {
		const link = await getLink(characterId);
		if (loadedFor !== characterId || readAt !== linkChanges) return;
		const changed = !again || projectFolder.link?.linkedAt !== link?.linkedAt;
		showLink(characterId, link, readAt);
		// A problem this character's folder reported while another character was open, if it is still the same link.
		if (changed) {
			projectFolder.status = statusFor(characterId, link);
			projectFolder.offer = offerFor(link);
		}
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
	if (loadedFor === id && readAt === linkChanges) projectFolder.status = statusFor(id, current);
	// The superseded link's notice and problem go with it.
	if (stale) {
		clearNotice(id, stale);
		if (problems.get(id)?.linkedAt === stale) problems.delete(id);
	}
}

const MANIFEST = 'manifest.json';

/** The time and bytes of an export manifest already in the folder, if it reads as one. */
async function sameEarlierExport(target: FolderTarget) {
	try {
		const data = await target.read(MANIFEST);
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
		let readAt = linkChanges;
		const checked = await stillLinked(link);
		// Without a fresh read this tab cannot know whether the folder was stopped elsewhere, so it waits.
		if (checked === 'unknown') return report({ kind: 'failed', reason: 'unknown' });
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
			return request.manual ? report({ kind: 'unavailable' }) : undefined;
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
				// the record alone, so a shown problem is never cleared without looking. Where the record does not cover the
				// files (such as ones the user has not yet chosen to keep updated), the folder decides too: bytes already
				// there need no write.
				(request.manual || showingProblem || !matchesRecord(record, next)
					? await inSync(target, record, next)
					: true)
			)
				return finished({ kind: 'done', kept: record.kept.length, already: request.manual });
		}
		const now = new Date().toISOString();
		// A folder chosen again over this character's own earlier export: built with that export's time, an unchanged
		// character matches it file for file, so every file can be offered rather than the manifest pausing.
		const earlier = request.fresh && !link.exportedAt ? await sameEarlierExport(target) : null;
		let exportedAt = now;
		let files: FolderFile[] | null = null;
		if (earlier) {
			const same = await buildFiles(link, input, settings, earlier.exportedAt);
			const manifest = same?.find((f) => f.name === MANIFEST);
			if (manifest && (await sha256(manifest.data)) === earlier.hash) {
				files = same;
				exportedAt = earlier.exportedAt;
			}
		}
		files ??= await buildFiles(link, input, settings, now);
		if (!files) return report({ kind: 'unavailable' });
		// Building takes a moment: recheck that the link was not stopped or replaced meanwhile.
		readAt = linkChanges;
		const recheck = await stillLinked(link);
		if (recheck === 'unknown') return report({ kind: 'failed', reason: 'unknown' });
		if (!recheck) return superseded(id, readAt, link.linkedAt);
		showLink(id, recheck, readAt);
		// Update automatically may also have been turned off meanwhile.
		if (!request.manual && !recheck.auto) return report({ kind: 'idle' });
		const outcome = await publishFiles(target, files, {
			record,
			overwrite: request.overwrite,
			onRecord: (path, hash) => recordWritten(key, path, hash),
			// Planning reads every file, which takes a moment: the last chance to notice a stop before anything is written.
			proceed: async () => {
				if (!store.projects.some((p) => p.id === id)) return false; // deleted meanwhile
				const latest = await stillLinked(link);
				return typeof latest === 'object' && !!latest && (request.manual || latest.auto);
			}
		});
		if (
			request.fresh &&
			outcome.kind !== 'stopped' &&
			outcome.kind !== 'failed' &&
			outcome.matching?.length
		) {
			offers.set(link.linkedAt, outcome.matching);
			if (loadedFor === id) projectFolder.offer = offerFor(link);
		}
		// The earlier export's time stays in use (also while paused), so a retry still matches its files.
		if (exportedAt !== now && outcome.kind !== 'published' && outcome.kind !== 'unchanged')
			await updateLink(id, link.linkedAt, { exportedAt }).catch((error: unknown) =>
				console.warn('Could not record the project folder export time', error)
			);
		switch (outcome.kind) {
			case 'stopped': {
				readAt = linkChanges;
				const latest = await stillLinked(link);
				return typeof latest === 'object' && latest
					? report({ kind: 'idle' })
					: superseded(id, readAt, link.linkedAt);
			}
			case 'published':
			case 'unchanged':
				if (outcome.kind === 'published' || exportedAt !== now) {
					try {
						readAt = linkChanges;
						const stored = await updateLink(
							id,
							link.linkedAt,
							outcome.kind === 'published' ? { exportedAt, publishedAt: now } : { exportedAt }
						);
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
				report({ kind: 'blocked', conflicts: outcome.conflicts, linkedAt: link.linkedAt });
				return notify(link, 'blocked', request.manual, () =>
					notice(link, message('projectFolder.toast.paused'), { ...lasting, ...review(id) })
				);
			case 'failed':
				console.warn('Project folder publish failed', outcome.error);
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
						fresh: request.fresh || waiting.fresh,
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
			const target = directoryTarget(link.handle, [link.subfolder]);
			const key = recordKey(link);
			for (const file of offer.files)
				if (file.found && (await hashAt(target, file.path)) === file.found)
					await recordWritten(key, file.path, file.found);
		});
		// Gone once they are recorded, so the offer's disappearing means it took effect.
		offers.delete(offer.linkedAt);
		if (projectFolder.offer === offer) projectFolder.offer = null;
	} catch (error) {
		console.warn('Could not keep the matching project folder files updated', error);
		setStatus(link.characterId, { kind: 'failed', reason: 'unknown' }, link.linkedAt);
	}
}

/** Leaves the offered matching files as the user's. */
export function leaveMatchingFiles() {
	if (projectFolder.offer) offers.delete(projectFolder.offer.linkedAt);
	projectFolder.offer = null;
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
		for (const [linkedAt, pending] of timers)
			if (linkedAt !== link.linkedAt && pending.characterId === characterId) {
				clearTimeout(pending.timer);
				timers.delete(linkedAt);
			}
	} catch (error) {
		// Without stored records PixelDoll could not tell its files from the user's, so it publishes nothing.
		console.warn('Could not save the linked project folder', error);
		return setStatus(characterId, { kind: 'failed', reason: 'unknown' });
	}
	showLink(characterId, link);
	if (loadedFor === characterId) projectFolder.offer = null;
	// This link's own first publish, even if another character was opened meanwhile.
	await run({ manual: true, linkedAt: link.linkedAt, link, fresh: true });
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
	clearTimeout(timers.get(link.linkedAt)?.timer);
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
	offers.delete(link.linkedAt);
	if (loadedFor === link.characterId) projectFolder.offer = null;
	problems.delete(link.characterId);
	clearNotice(link.characterId);
	setStatus(link.characterId, { kind: 'idle' });
}
