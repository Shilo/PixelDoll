// Do not initialize credentials, queues, or API clients inside another page's frame.
import { workspaceCopy } from './lib/store/workspace-mode.ts';
import { browserEnvironment, buildReport, reportText, reportUrl } from './lib/report/report.ts';
import { PRE_RELEASE } from './studio/previewNotice.ts';

export {};

/** Before the Studio and its catalog load, Report shows the same public report as plain, English page content. */
function startupReport(summary: string, error: unknown) {
	const report = buildReport(
		{ area: 'Startup', summary, error },
		{
			env: browserEnvironment(navigator.language, PRE_RELEASE),
			uptime: performance.now() / 1000
		}
	);
	const details = document.createElement('details');
	const title = document.createElement('summary');
	title.textContent = 'Report this problem';
	const note = document.createElement('p');
	note.textContent =
		'This opens a public GitHub issue with only the text below. You post it with your GitHub account.';
	const preview = document.createElement('pre');
	preview.textContent = reportText(report);
	preview.style.whiteSpace = 'pre-wrap';
	const open = document.createElement('a');
	open.href = reportUrl(report);
	open.target = '_blank';
	open.rel = 'noreferrer';
	open.textContent = 'Open on GitHub';
	details.append(title, note, preview, open);
	return details;
}
if (window.top === window) {
	try {
		// Keep these imports inside the frame guard: bundlers can share their chunks with credential-bearing Studio modules.
		if (workspaceCopy) await import('./workspace-entry.ts');
		else {
			if (import.meta.env.PROD && window.isSecureContext)
				(await import('./lib/startup-update.ts')).observeStartupUpdate();
			await (await import('./bootstrap.ts')).launchStudio();
		}
	} catch (error) {
		// A page keeps a failed module for its lifetime; only a new page fetches it again. Reloading stays the user's
		// choice: startup may already have connected to saved work.
		const status = document.querySelector('#startup-message p');
		if (status) {
			// Startup may already explain a more specific failure, such as unavailable saved data.
			if (status.getAttribute('role') !== 'alert') {
				status.setAttribute('role', 'alert');
				status.textContent =
					'PixelDoll could not finish loading. Check your connection, then reload.';
			}
			const reload = document.createElement('button');
			reload.type = 'button';
			reload.textContent = 'Reload';
			reload.addEventListener('click', () => location.reload());
			status.after(reload);
			reload.after(startupReport(status.textContent ?? '', error));
		}
		throw error;
	}
} else {
	const link = document.createElement('a');
	link.href = location.href;
	link.target = '_blank';
	link.rel = 'noopener noreferrer';
	link.textContent = 'Open PixelDoll in its own tab';
	document.getElementById('app')?.replaceChildren(link);
}
