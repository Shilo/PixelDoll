import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { queue } from './lib/pixellab/queue.ts';
import { askPersist } from './lib/store/db.ts';
import { app, getKeyRevision, setKey } from './lib/app.svelte.ts';

askPersist();
const target = document.getElementById('app')!;
const startup = document.getElementById('startup-message');
// Release before document cleanup, which can lag tab closure. Cached documents keep their existing connection.
const leave = (event: PageTransitionEvent) => {
	if (!event.persisted) queue.disconnect();
};
addEventListener('pagehide', leave);
try {
	// leader tab resumes the ledger; other tabs mirror it (Web Locks). Only a real open error fails here (no IndexedDB,
	// onerror, onblocked in db.ts): a slow open (big ledger, hidden throttled tab) just takes longer.
	await queue.connect();
} catch (e) {
	const status = startup?.querySelector('p');
	if (status) {
		status.setAttribute('role', 'alert');
		status.textContent =
			'PixelDoll could not open your saved work. Allow site data and check that your device has free storage, then reload.';
	}
	throw e;
}
import.meta.hot?.dispose(() => {
	removeEventListener('pagehide', leave);
	queue.disconnect();
});
if (import.meta.env.DEV) (window as unknown as { __queue: unknown }).__queue = queue; // dev: inspect role/ledger

// AI-agent automation only (`npm run dev:agent`, Vite mode "agent"): connect with the key the agent dev server serves from
// ../.env. Statically false in `npm run dev` and every build, so the bundle has no trace of it. Scripts that must stay keyless
// set localStorage 'pixeldoll.agentKey' = 'off' first. Never when framed: another page could embed and clickjack the app.
if (import.meta.env.DEV && import.meta.env.MODE === 'agent' && window.top === window && !app.key) {
	let off = false;
	try {
		off = localStorage.getItem('pixeldoll.agentKey') === 'off';
	} catch {
		/* Optional storage can be unavailable; the agent key stays memory-only. */
	}
	const revision = getKeyRevision();
	if (!off)
		fetch('/__dev/pixellab-key', { cache: 'no-store' })
			.then(async (r) => {
				if (!r.ok) return;
				const key = await r.text();
				// A delayed agent response must not replace a manual connection or undo Forget, even while still keyless.
				if (key && revision === getKeyRevision() && !app.key) setKey(key, false);
			})
			.catch(() => {});
}

const mounted = mount(App, { target });
startup?.remove();
export default mounted;
