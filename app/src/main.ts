// Do not initialize credentials, queues, or API clients inside another page's frame.
export {};
if (window.top === window) {
  await import('./bootstrap.ts');
} else {
  const link = document.createElement('a');
  link.href = location.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open PixelDoll in its own tab';
  document.getElementById('app')?.replaceChildren(link);
}
