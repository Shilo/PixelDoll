import { get } from 'svelte/store';
import { message } from '../lib/message.ts';
import { pwa } from '../lib/pwa.ts';
import {
	compareVersions,
	createSeenRelease,
	fetchReleaseIndex,
	SEEN_RELEASE_KEY,
	type ReleaseEntry
} from '../lib/releases.ts';
import { dismissToast, toast, ui, updateBlocked } from './state.svelte.ts';
import { updateNotice } from './updateNotice.svelte.ts';

const seenRelease = createSeenRelease();
let seen = $state<string | null>(null);
let entries = $state.raw<ReleaseEntry[] | null>();
let inFlight: Promise<void> | undefined;
let firstIndex = false;

const latest = $derived(entries?.[0]);
// Newer than the last one read: an older cached index can never reopen news or rewind what was read.
const unseen = $derived(!!latest && (!seen || compareVersions(latest.version, seen) > 0));
let firstVisitSession = false;
const autoOpened = new Set<string>();

function markSeen(version: string) {
	if (version === latest?.version && (!seen || compareVersions(version, seen) > 0))
		seen = seenRelease.mark(version);
}

function refresh() {
	if (inFlight) return inFlight;
	if (entries === null) entries = undefined;
	inFlight = fetchReleaseIndex()
		.then(
			(next) => {
				entries = next;
				if (firstIndex && next[0]) markSeen(next[0].version);
				firstIndex = false;
			},
			() => {
				// A failed refresh keeps the releases already known; the next visible moment retries.
				if (!entries) entries = null;
			}
		)
		.finally(() => (inFlight = undefined));
	return inFlight;
}

function open() {
	if (!updateNotice.visible) ui.releaseOverlay = true;
}

export const releaseNews = {
	get entries() {
		return entries;
	},
	get unseen() {
		return unseen;
	},
	get blocked() {
		return updateNotice.visible;
	},
	refresh,
	markShown(version: string) {
		markSeen(version);
		if (ui.toastAfterUpdate) dismissToast();
	},
	open,
	close() {
		ui.releaseOverlay = false;
	}
};

export function startReleaseNews(firstVisit: boolean) {
	firstIndex = firstVisit;
	firstVisitSession = firstVisit;
	seen = seenRelease.sync();
	const wake = () => {
		if (!document.hidden) void refresh();
	};
	const syncSeen = (event: StorageEvent) => {
		if (event.key === SEEN_RELEASE_KEY || event.key === null) seen = seenRelease.sync();
	};
	document.addEventListener('visibilitychange', wake);
	window.addEventListener('storage', syncSeen);
	void refresh();
	return () => {
		document.removeEventListener('visibilitychange', wake);
		window.removeEventListener('storage', syncSeen);
	};
}

// Check only while a feature release is waiting. Native popovers and positioned tips can change
// without a Studio state change, so each attempt checks what is actually on screen.
let toastedVersion: string | undefined;
export function offerReleaseNews() {
	const candidate = latest;
	if (
		firstVisitSession ||
		!candidate?.features ||
		!unseen ||
		ui.releaseOverlay ||
		candidate.version === toastedVersion ||
		autoOpened.has(candidate.version) ||
		// An older running app waits for its update instead of announcing features it does not have yet.
		compareVersions(__APP_VERSION__, candidate.version) < 0
	)
		return;
	const { version } = candidate;

	const deadline = performance.now() + 10_000;
	// After this, a notice that never clears (such as a lasting error) leaves only the unread dot.
	const giveUp = deadline + 60_000;
	let timer: ReturnType<typeof setTimeout>;
	function offer() {
		if (latest?.version !== version || !unseen || ui.releaseOverlay) return;
		const now = performance.now();
		if (now >= giveUp) return;
		const expired = now >= deadline;
		if (!document.hidden && !updateNotice.visible && !get(pwa).checking && !ui.toast) {
			if (expired) {
				let opened = false;
				const shown = toast(message('releaseNews.notice'), {
					action: () => {
						opened = true;
						open();
					},
					actionLabel: message('releaseNews.open'),
					afterUpdate: true,
					// Opening counts as read only once the article shows; dismissing the notice counts at once.
					onDismiss: () => {
						if (!opened) markSeen(version);
					},
					duration: 0
				});
				if (shown) {
					toastedVersion = version;
					return;
				}
			} else if (
				!updateBlocked() &&
				!document.querySelector(
					'dialog[open], :popover-open:not([popover="manual"]), [data-tip], input:focus, textarea:focus, select:focus, [contenteditable]:focus'
				)
			) {
				// Once per release per visit: closing it before the notes load must not reopen it.
				autoOpened.add(version);
				open();
				return;
			}
		}
		timer = setTimeout(offer, expired ? 1000 : 250);
	}
	timer = setTimeout(offer, 500);
	return () => clearTimeout(timer);
}
