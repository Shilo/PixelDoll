// CSP-compatible, pre-module appearance selection. No credentials or network.
try {
  const theme = localStorage.getItem('pixeldoll.theme') === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
} catch { document.documentElement.dataset.theme = 'dark'; }
