// Project folder publishing for the open character: link a game folder once, then PixelDoll writes the export's files
// into it and keeps them current after each change. Strictly additive: where the browser cannot write folders this does
// nothing, and every failure becomes a status (and, in the background, at most one notice), never a thrown error.
import { buildExport } from '../lib/export/build.ts';
import { ACTION_LAYER_ENGINES } from '../lib/export/export.ts';
import { walkMoves } from '../lib/export/rpgmaker.ts';
import { message } from '../lib/message.ts';
import {
	deleteLink,
	getLink,
	putLink,
	updateLink,
	type FolderLink
} from '../lib/project-folder/links.ts';
import type { PlanAction } from '../lib/project-folder/plan.ts';
import {
	hashFiles,
	inSync,
	matchesPublished,
	publishFiles,
	type FailureReason,
	type FolderFile
} from '../lib/project-folder/publish.ts';
import { folderSupport, type FolderSupport } from '../lib/project-folder/support.ts';
import { directoryTarget } from '../lib/project-folder/target.ts';
import { readExportSettings } from '../lib/store/export-settings.ts';
import type { Engine } from '../lib/store/manifest.ts';
import { workspaceCopy } from '../lib/store/workspace-mode.ts';
import { characterZipId, editableData } from './download.svelte.ts';
import { exportActionLayering } from './exportLayering.ts';
import { openSettings } from './settingsNavigation.svelte.ts';
import { doc, store, toast } from './state.svelte.ts';

export type FolderStatus =
	| { kind: 'idle' }
	| { kind: 'publishing' }
	| { kind: 'done' }
	| { kind: 'reconnect' }
	| { kind: 'missing' }
	| { kind: 'blocked'; conflicts: PlanAction[] }
	| { kind: 'unavailable' }
	| { kind: 'failed'; reason: FailureReason };

class FolderState {
	support = $state<FolderSupport | 'checking'>('checking');
	/** The open character's link, once read. */
	link = $state.raw<FolderLink | null>(null);
	status = $state.raw<FolderStatus>({ kind: 'idle' });
	/** The link could not be stored, so it lasts only until the page closes. */
	unsaved = $state(false);
}
export const projectFolder = new FolderState();

/** Whether the open character's folder needs the user. */
export const folderNeedsAttention = (status: FolderStatus) =>
	!['idle', 'publishing', 'done'].includes(status.kind);

/** A publish request, bound to the link it was made for (`linkedAt`), so it never runs against a different one. */
type Request = { manual: boolean; linkedAt?: string; overwrite?: ReadonlyMap<string, string> };

const RW = { mode: 'readwrite' } as const;
const AUTO_DELAY_MS = 1500;
let supportCheck: Promise<FolderSupport> | null = null;
let loadedFor = '';
let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;
let queued: Request | null = null;
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
const showLink = (characterId: string, link: FolderLink | null) => {
	if (loadedFor === characterId) projectFolder.link = link;
};

/** Reads the open character's link when the character changes. */
export async function loadFolderLink(characterId: string) {
	if (loadedFor === characterId) return;
	loadedFor = characterId;
	projectFolder.link = null;
	projectFolder.status = { kind: 'idle' };
	projectFolder.unsaved = false;
	if ((await checkFolderSupport()) !== 'supported' || !characterId) return;
	try {
		showLink(characterId, await getLink(characterId));
	} catch (error) {
		// Shown in Settings, so a storage failure never looks like "no folder".
		console.warn('Could not read the linked project folder', error);
		setStatus(characterId, { kind: 'failed', reason: 'unknown' });
	}
}

/** Everything an export reads from the open character, taken in one step so a character switch cannot mix two. */
function snapshot(link: FolderLink) {
	const project = store.project;
	if (!project || doc.id !== link.characterId) return null;
	const manifest = structuredClone(project.manifest);
	return {
		project: { ...project, manifest },
		look: { items: $state.snapshot(doc.items), variants: $state.snapshot(doc.variants) },
		projectData: editableData(store.exportRecord),
		actionLayering: exportActionLayering(link.characterId, manifest.rig.animations, true)
	};
}

/** The export's files, as the Export sheet would build them, or null when no export can be built. */
async function buildFiles(
	link: FolderLink,
	input: NonNullable<ReturnType<typeof snapshot>>,
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

/** One publish at a time per destination, across tabs where Web Locks exist. */
function exclusive<T>(link: FolderLink, work: () => Promise<T>): Promise<T> {
	return navigator.locks
		? navigator.locks.request(`pixeldoll:project-folder:${link.subfolder}`, work)
		: work();
}

function notify(link: FolderLink, kind: string, manual: boolean, show: () => void) {
	const key = `${link.characterId}:${kind}`;
	// A problem from a click is already on screen in Settings; background ones are reported once per session.
	if (manual || noticed.has(key)) return;
	noticed.add(key);
	show();
}

const review = {
	action: () => openSettings('export'),
	actionLabel: message('projectFolder.review')
};

async function publish(link: FolderLink, request: Request) {
	const id = link.characterId;
	const input = snapshot(link);
	if (!input) return;
	const settings = await readExportSettings();
	await exclusive(link, async () => {
		// Another tab may have stopped or replaced this link meanwhile.
		let current: FolderLink | null = link;
		// An unsaved link exists only in this tab, so there is nothing stored to recheck.
		if (!projectFolder.unsaved)
			try {
				current = await getLink(id);
			} catch (error) {
				// Without a fresh read this tab cannot know whether the folder was stopped elsewhere, so it waits.
				console.warn('Could not recheck the linked project folder', error);
				return setStatus(id, { kind: 'failed', reason: 'unknown' });
			}
		if (!current || current.linkedAt !== link.linkedAt) {
			showLink(id, current);
			setStatus(id, { kind: 'idle' });
			return;
		}
		link = current;
		showLink(id, link);
		// Update automatically may have been turned off in another tab.
		if (!request.manual && !link.auto) return;
		if ((await permission(link)) !== 'granted') return lostAccess(link, request.manual);
		setStatus(id, { kind: 'publishing' });
		const target = directoryTarget(link.handle, [link.subfolder]);
		// Reusing the last timestamp first means an unchanged character matches what is there and writes nothing.
		if (link.exportedAt && !request.overwrite) {
			const same = await buildFiles(link, input, settings, link.exportedAt);
			const next = same && (await hashFiles(same));
			if (next && (await (request.manual ? inSync : matchesPublished)(target, next)))
				return setStatus(id, { kind: 'done' });
		}
		const now = new Date().toISOString();
		const files = await buildFiles(link, input, settings, now);
		if (!files) return setStatus(id, { kind: 'unavailable' });
		const outcome = await publishFiles(target, files, {
			owner: id,
			overwrite: request.overwrite,
			adopt: request.manual
		});
		switch (outcome.kind) {
			case 'published':
			case 'unchanged':
				for (const key of [...noticed]) if (key.startsWith(`${id}:`)) noticed.delete(key);
				if (outcome.kind === 'published') {
					try {
						const stored = await updateLink(id, link.linkedAt, {
							exportedAt: now,
							publishedAt: now
						});
						if (stored) showLink(id, stored);
					} catch (error) {
						console.warn('Could not record the project folder publish', error);
					}
				}
				return setStatus(id, { kind: 'done' });
			case 'blocked':
				setStatus(id, { kind: 'blocked', conflicts: outcome.conflicts });
				return notify(link, 'blocked', request.manual, () =>
					toast(message('projectFolder.toast.paused'), {
						tone: 'warning',
						report: false,
						...review
					})
				);
			case 'failed':
				console.warn('Project folder publish failed', outcome.error);
				if (outcome.reason === 'permission') return lostAccess(link, request.manual);
				if (outcome.reason === 'missing') {
					setStatus(id, { kind: 'missing' });
					return notify(link, 'missing', request.manual, () =>
						toast(message('projectFolder.toast.missing', { folder: link.handle.name }), {
							tone: 'warning',
							report: false,
							...review
						})
					);
				}
				setStatus(id, { kind: 'failed', reason: outcome.reason });
				return notify(link, `failed:${outcome.reason}`, request.manual, () =>
					toast(message('projectFolder.toast.failed', { folder: link.handle.name }), {
						tone: 'warning',
						error: outcome.error,
						...review
					})
				);
		}
	});
}

function lostAccess(link: FolderLink, manual: boolean) {
	setStatus(link.characterId, { kind: 'reconnect' });
	notify(link, 'reconnect', manual, () =>
		toast(message('projectFolder.toast.reconnect', { folder: link.handle.name }), {
			tone: 'warning',
			report: false,
			// A notice's button is a click, so the browser can ask for access straight away.
			action: () => void reconnectProjectFolder(link),
			actionLabel: message('projectFolder.reconnect')
		})
	);
}

/** Publishes for the open character's link, one at a time; a request arriving meanwhile runs next, keeping a manual
 *  request and an approval. Never rejects. */
function run(request: Request): Promise<void> {
	if (running) {
		queued = {
			manual: request.manual || !!queued?.manual,
			linkedAt: request.linkedAt ?? queued?.linkedAt,
			overwrite: request.overwrite ?? queued?.overwrite
		};
		return running;
	}
	running = (async () => {
		let next: Request | null = request;
		while (next) {
			const link = projectFolder.link;
			const current = next;
			if (
				usable() &&
				link &&
				link.characterId === doc.id &&
				(!current.linkedAt || current.linkedAt === link.linkedAt)
			) {
				try {
					await publish(link, current);
				} catch (error) {
					console.warn('Project folder publish stopped', error);
					setStatus(link.characterId, { kind: 'failed', reason: 'unknown' });
					notify(link, 'failed:unknown', current.manual, () =>
						toast(message('projectFolder.toast.failed', { folder: link.handle.name }), {
							tone: 'warning',
							error,
							...review
						})
					);
				}
			}
			next = queued;
			queued = null;
		}
	})().finally(() => (running = null));
	return running;
}

/** After a change: republish soon if this character publishes automatically. */
export function scheduleFolderPublish() {
	clearTimeout(timer);
	if (!usable() || !projectFolder.link?.auto) return;
	const linkedAt = projectFolder.link.linkedAt;
	timer = setTimeout(() => void run({ manual: false, linkedAt }), AUTO_DELAY_MS);
}

/** Publish now, or replace the listed conflicting files when `overwrite` maps each to the bytes the user saw. */
export const publishProjectFolder = (overwrite?: ReadonlyMap<string, string>) =>
	run({ manual: true, linkedAt: projectFolder.link?.linkedAt, overwrite });

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
	const previous = projectFolder.link;
	const link: FolderLink = {
		characterId,
		handle,
		subfolder:
			previous && (await sameFolder(previous.handle, handle))
				? previous.subfolder
				: characterZipId(project.manifest),
		engine,
		auto: previous?.auto ?? true,
		linkedAt: new Date().toISOString()
	};
	try {
		await putLink(link);
		projectFolder.unsaved = false;
	} catch (error) {
		console.warn('Could not save the linked project folder', error);
		projectFolder.unsaved = true;
	}
	showLink(characterId, link);
	await publishProjectFolder();
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
		openSettings('export');
		return;
	}
	try {
		if ((await link.handle.requestPermission(RW)) !== 'granted') return;
	} catch (error) {
		console.warn('Could not reconnect the project folder', error);
		return;
	}
	await publishProjectFolder();
}

export async function setFolderAutoPublish(auto: boolean) {
	const link = projectFolder.link;
	if (!link) return;
	try {
		const stored = await updateLink(link.characterId, link.linkedAt, { auto });
		// Null means another tab stopped or replaced this link.
		showLink(link.characterId, stored ?? (projectFolder.unsaved ? { ...link, auto } : null));
	} catch (error) {
		console.warn('Could not save Update automatically', error);
		projectFolder.unsaved = true;
		showLink(link.characterId, { ...link, auto });
	}
	if (auto) scheduleFolderPublish();
}

/** Stops publishing; files already in the folder stay. */
export async function unlinkProjectFolder() {
	const link = projectFolder.link;
	if (!link) return;
	clearTimeout(timer);
	try {
		// Only this link: if another tab chose a new folder meanwhile, that one stays.
		await deleteLink(link.characterId, link.linkedAt);
	} catch (error) {
		console.warn('Could not remove the linked project folder', error);
		setStatus(link.characterId, { kind: 'failed', reason: 'unknown' });
		return;
	}
	showLink(link.characterId, null);
	setStatus(link.characterId, { kind: 'idle' });
	projectFolder.unsaved = false;
}
