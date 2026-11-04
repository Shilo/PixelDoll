// Do not initialize credentials, queues, or API clients inside another page's frame.
export {};
if (window.top === window) {
  // Keep this import inside the frame guard: bundlers can share its chunk with credential-bearing Studio modules.
  if (import.meta.env.PROD && window.isSecureContext) (await import('./lib/startup-update.ts')).observeStartupUpdate();
  await import('./bootstrap.ts');
} else {
  const link = document.createElement('a');
  link.href = location.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open PixelDoll in its own tab';
  document.getElementById('app')?.replaceChildren(link);
}
