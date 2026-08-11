/* TriFold accessibility widget — self-contained, no dependencies.
   Preferences persist in localStorage("trifold-a11y") and apply as
   data-a11y-* attributes on <html> (styled in styles.css). */
(function () {
  var KEY = 'trifold-a11y';
  var FLAGS = ['font', 'contrast', 'gray', 'links', 'cursor', 'focus', 'lines', 'spacing', 'motion'];
  var root = document.documentElement;
  var state = {};

  try { state = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { state = {}; }

  function apply() {
    FLAGS.forEach(function (f) {
      if (state[f]) root.setAttribute('data-a11y-' + f, '1');
      else root.removeAttribute('data-a11y-' + f);
    });
    document.querySelectorAll('.a11y-opt[data-flag]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', state[btn.dataset.flag] ? 'true' : 'false');
    });
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function ready() {
    var fab = document.getElementById('a11yFab');
    var panel = document.getElementById('a11yPanel');
    var closeBtn = document.getElementById('a11yClose');
    var resetBtn = document.getElementById('a11yReset');
    if (!fab || !panel) { apply(); return; }

    function setOpen(open) {
      panel.classList.toggle('open', open);
      fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    fab.addEventListener('click', function () { setOpen(!panel.classList.contains('open')); });
    if (closeBtn) closeBtn.addEventListener('click', function () { setOpen(false); fab.focus(); });

    document.querySelectorAll('.a11y-opt[data-flag]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var f = btn.dataset.flag;
        state[f] = !state[f];
        apply();
      });
    });

    if (resetBtn) resetBtn.addEventListener('click', function () { state = {}; apply(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('open')) { setOpen(false); fab.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (panel.classList.contains('open') && !panel.contains(e.target) && !fab.contains(e.target)) setOpen(false);
    });

    apply();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
