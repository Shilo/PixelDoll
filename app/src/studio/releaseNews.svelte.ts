import { get } from 'svelte/store';
import { message } from '../lib/message.ts';
import { pwa } from '../lib/pwa.ts';
import {
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
const unseen = $derived(!!latest && latest.version !== seen);

function markSeen(version: string) {
	if (version === latest?.version) seen = seenRelease.mark(version);
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
				entries = null;
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
	if (!candidate?.features || !unseen || ui.releaseOverlay || candidate.version === toastedVersion)
		return;
	const { version } = candidate;

	const deadline = performance.now() + 10_000;
	let timer: ReturnType<typeof setTimeout>;
	function offer() {
		if (latest?.version !== version || !unseen || ui.releaseOverlay) return;
		const expired = performance.now() >= deadline;
		if (!document.hidden && !updateNotice.visible && !get(pwa).checking && !ui.toast) {
			if (expired) {
				const shown = toast(message('releaseNews.notice'), {
					action: open,
					actionLabel: message('releaseNews.open'),
					afterUpdate: true,
					onDismiss: () => markSeen(version),
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
				open();
				return;
			}
		}
		timer = setTimeout(offer, expired ? 1000 : 250);
	}
	timer = setTimeout(offer, 500);
	return () => clearTimeout(timer);
}
