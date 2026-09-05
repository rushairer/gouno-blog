/* Same-origin, parser-blocking bootstrap. No auth state is read or written. */
(() => {
  const script = document.currentScript;
  const key = script?.dataset.storageKey || 'gouno-blog:theme';
  let mode = 'system';
  try { const stored = localStorage.getItem(key); if (stored === 'light' || stored === 'dark') mode = stored; } catch {}
  const resolved = mode === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.brand = script?.dataset.brand || (/^\/admin(?:\/|$)/.test(location.pathname) ? 'blog-admin' : 'blog');
  root.style.colorScheme = resolved;
})();
