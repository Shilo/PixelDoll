import { fromStore } from 'svelte/store';
import { pwa } from '../lib/pwa.ts';

const status = fromStore(pwa);
// Shared across Toast mounts when a sheet opens or closes; polling must not resurrect an expired notice.
const hidden = $state({ build: '', phase: '' });
const phase = $derived(
	status.current.available
		? `${status.current.available.build}:${status.current.reloading ? 'reloading' : status.current.ready}`
		: ''
);
const visible = $derived(
	!!phase &&
		(status.current.reloading ||
			(hidden.build !== status.current.available?.build && hidden.phase !== phase))
);
let timedPhase = '',
	remaining = 0,
	started: number | null = null;
function syncClock(next: string) {
	if (timedPhase !== next) {
		timedPhase = next;
		remaining = 15000;
		started = Date.now();
	}
}
function timeLeft() {
	return Math.max(0, remaining - (started === null ? 0 : Date.now() - started));
}
export const updateNotice = {
	get phase() {
		return phase;
	},
	get visible() {
		return visible;
	},
	dismiss() {
		hidden.build = status.current.available?.build ?? '';
	},
	expire(phase: string) {
		hidden.phase = phase;
	},
	delay(phase: string) {
		syncClock(phase);
		const delay = timeLeft();
		if (started === null) started = Date.now();
		return delay;
	},
	pause(phase: string) {
		syncClock(phase);
		remaining = timeLeft();
		started = null;
	}
};
