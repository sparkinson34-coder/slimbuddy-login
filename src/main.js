// SlimBuddy login helper
// - Persists/loads token locally so returning users see it immediately
// - Carries a ?returnTo=<GPT URL> through the flow and redirects back after saving

(function () {
  const $ = (id) => document.getElementById(id);

  const loginBtn = $('loginBtn');
  const saveBtn = $('saveTokenBtn');
  const tokenBox = $('jwtToken');
  const tokenSection = $('tokenSection');
  const status = $('statusMessage');

  // ----- helpers -----
  const qs = new URLSearchParams(window.location.search);
  const incomingReturnTo = qs.get('returnTo');

  // keep a stable returnTo for the session (survives round-trips)
  const sessionReturnToKey = 'slimbuddy:returnTo';
  const storedReturnTo = sessionStorage.getItem(sessionReturnToKey);

  // 1) decide our returnTo (incoming wins, else session, else blank)
  const returnTo = incomingReturnTo || storedReturnTo || '';

  // If we got a new one via query param, remember it
  if (incomingReturnTo) {
    sessionStorage.setItem(sessionReturnToKey, incomingReturnTo);
  }

  // Minimal allowlist (defensive): only redirect to trusted hosts
  function isSafe(url) {
    try {
      const u = new URL(url);
      const allow = new Set([
        'chat.openai.com',
        'yourslimbuddy.netlify.app',
      ]);
      return ['https:', 'http:'].includes(u.protocol) && allow.has(u.hostname);
    } catch {
      return false;
    }
  }

  function setStatus(msg, ok = true) {
    if (!status) return;
    status.textContent = msg;
    status.style.color = ok ? '#0a0' : '#c00';
  }

  // ----- preload any previously saved token for convenience -----
  const LS_TOKEN_KEY = 'slimbuddy_jwt';
  const existing = localStorage.getItem(LS_TOKEN_KEY) || '';
  if (existing) {
    tokenBox.value = existing;
    tokenSection.style.display = 'block';
    setStatus('✅ Found a previously saved token.');
  }

  // ----- login button -----
  // Send the user to your Netlify login app, carrying ?returnTo so it can bounce them back
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      const base = 'https://yourslimbuddy.netlify.app/';
      const url = returnTo ? `${base}?returnTo=${encodeURIComponent(returnTo)}` : base;
      window.location.href = url;
    });
  }

  // ----- save token button -----
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const token = (tokenBox.value || '').trim();
      if (!token) {
        setStatus('❌ Please paste a valid token.', false);
        return;
      }
      localStorage.setItem(LS_TOKEN_KEY, token);

      // attempt to copy to clipboard to make pasting in GPT easier
      try {
        await navigator.clipboard.writeText(token);
        setStatus('✅ Token saved & copied. Returning to SlimBuddy…', true);
      } catch {
        setStatus('✅ Token saved. Copy to clipboard failed — please copy manually.', true);
      }

      // auto-return to GPT if we have a safe URL
      if (returnTo && isSafe(returnTo)) {
        window.location.href = returnTo;
      }
    });
  }

  // If user focuses the token area, reveal the section (helps first-time flow)
  tokenBox?.addEventListener('focus', () => {
    tokenSection.style.display = 'block';
  });
})();
