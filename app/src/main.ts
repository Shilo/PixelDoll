// Do not initialize credentials, queues, or API clients inside another page's frame.
export {};
if (window.top === window) {
	try {
		// Keep these imports inside the frame guard: bundlers can share their chunks with credential-bearing Studio modules.
		if (import.meta.env.PROD && window.isSecureContext)
			(await import('./lib/startup-update.ts')).observeStartupUpdate();
		await import('./bootstrap.ts');
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
