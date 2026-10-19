// Runs before first paint so the page never flashes the wrong theme.
// It lives in a file (not inline) so the Content-Security-Policy can stay strict.
(function () {
  try {
    var saved = localStorage.getItem('np.theme');
    var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = saved || (dark ? 'dark' : 'light');
  } catch (e) {}
})();
