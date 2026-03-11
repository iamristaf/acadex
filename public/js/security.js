(function () {

  // ── Disable right click ───────────────────────
  document.addEventListener('contextmenu', e => e.preventDefault());

  // ── Disable text selection ────────────────────
  document.addEventListener('selectstart', e => e.preventDefault());

  // ── Disable copy, cut, paste ──────────────────
  document.addEventListener('copy',  e => e.preventDefault());
  document.addEventListener('cut',   e => e.preventDefault());
  document.addEventListener('paste', e => e.preventDefault());

  // ── Disable drag ──────────────────────────────
  document.addEventListener('dragstart', e => e.preventDefault());

  // ── Disable keyboard shortcuts ────────────────
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;

    // Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+A, Ctrl+S, Ctrl+U
    if (ctrl && ['c','x','v','a','s','u'].includes(k)) {
      e.preventDefault(); return false;
    }
    // Ctrl+Shift+I (DevTools), Ctrl+Shift+J, Ctrl+Shift+C
    if (ctrl && e.shiftKey && ['i','j','c'].includes(k)) {
      e.preventDefault(); return false;
    }
    // F12 (DevTools)
    if (e.key === 'F12') {
      e.preventDefault(); return false;
    }
    // Ctrl+P (Print)
    if (ctrl && k === 'p') {
      e.preventDefault(); return false;
    }
    // Print Screen
    if (e.key === 'PrintScreen') {
      e.preventDefault();
      // Flood clipboard with blank
      navigator.clipboard?.writeText('').catch(() => {});
      return false;
    }
  });

  // ── Disable print ─────────────────────────────
  window.addEventListener('beforeprint', e => {
    e.preventDefault();
    window.stop();
  });

  // ── Detect DevTools open (basic) ─────────────
  const threshold = 160;
  const devToolsCheck = () => {
    if (
      window.outerWidth - window.innerWidth > threshold ||
      window.outerHeight - window.innerHeight > threshold
    ) {
      document.body.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;' +
        'height:100vh;font-family:sans-serif;font-size:20px;color:#dc2626;">' +
        '🚫 Developer tools are not allowed on this platform.</div>';
    }
  };
  setInterval(devToolsCheck, 1000);


  // ── Blur page on visibility change (tab switch record attempt) ─
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      document.body.style.filter = 'blur(0px)';
    } else {
      document.body.style.filter = 'none';
    }
  });

})();