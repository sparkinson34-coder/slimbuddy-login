// SlimBuddy login helper
// - Persists/loads token locally so returning users see it immediately
// - Carries a ?returnTo=<GPT URL> through the flow and redirects back after saving

import { createClient } from '@supabase/supabase-js';

// ----- Vite env (injected at build time) -----
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ----- DOM helpers -----
const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const tokenBox = $('tokenBox');
const copyBtn = $('copyTokenBtn');
const toggleTokenLink = $('toggleToken');

function msg(text, isErr = false, flash = false) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = isErr ? 'err' : 'ok';
  if (flash) setTimeout(() => (statusEl.textContent = ''), 1500);
}

// Query param helper
function qp(name) {
  const p = new URLSearchParams(window.location.search);
  return p.get(name);
}

// Safe redirect allowlist
function isSafeReturnUrl(url) {
  try {
    const u = new URL(url);
    const allow = new Set([
      'chat.openai.com',
      'chatgpt.com',
      'yourslimbuddy.netlify.app', // this site
    ]);
    return ['https:', 'http:'].includes(u.protocol) && allow.has(u.hostname);
  } catch {
    return false;
  }
}

// Redirect priority with safe checks
function smartRedirectAfterCopy() {
  const qsReturnTo = qp('returnTo');
  const ssReturnTo = sessionStorage.getItem('slimbuddyReturnUrl');
  const ref = document.referrer;

  if (qsReturnTo && isSafeReturnUrl(qsReturnTo)) return (window.location.href = qsReturnTo);
  if (ssReturnTo && isSafeReturnUrl(ssReturnTo)) {
    sessionStorage.removeItem('slimbuddyReturnUrl');
    return (window.location.href = ssReturnTo);
  }
  if (ref && isSafeReturnUrl(ref)) return (window.location.href = ref);
  if (history.length > 1) return history.back();

  // final fallback: show a message
  const fb = $('copy-feedback');
  if (fb) {
    fb.textContent = 'Token copied. Switch back to SlimBuddy GPT and paste it.';
    fb.style.display = 'block';
  }
}

// ----- returnTo wiring -----
const SS_RETURN = 'slimbuddyReturnUrl';
const incomingReturnTo = qp('returnTo');
const storedReturnTo = sessionStorage.getItem(SS_RETURN);
const returnTo = incomingReturnTo || storedReturnTo || '';
if (incomingReturnTo) sessionStorage.setItem(SS_RETURN, incomingReturnTo);

// ----- token storage (for fast-path / returning users) -----
const LS_TOKEN = 'slimbuddy_jwt';
let existingToken = localStorage.getItem(LS_TOKEN) || '';

// If we have a token, prep the UI for immediate copy-return flow
if (existingToken) {
  tokenBox.value = existingToken;
  copyBtn.style.display = 'inline-block';
  $('instructions').style.display = 'block';
  msg('✅ Found a previously saved token.');
}

// ----- fast-path: auto-copy + auto-redirect when possible -----
(function maybeFastReturn() {
  if (!existingToken || !returnTo || !isSafeReturnUrl(returnTo)) return;

  const fastDiv = $('fastReturn');
  const fastSeconds = $('fastSeconds');
  const cancel = $('cancelRedirect');

  if (fastDiv && fastSeconds && cancel) {
    fastDiv.style.display = 'block';
    let remaining = 1;
    fastSeconds.textContent = String(remaining);

    // Try to copy (best-effort)
    navigator.clipboard?.writeText(existingToken).catch(() => {});

    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timer);
        window.location.href = returnTo;
      } else {
        fastSeconds.textContent = String(remaining);
      }
    }, 1000);

    cancel.addEventListener('click', (e) => {
      e.preventDefault();
      clearInterval(timer);
      fastDiv.style.display = 'none';
      msg('Fast return cancelled.', false, true);
    });
  }
})();

// ----- Send magic link -----
$('sendLink')?.addEventListener('click', async () => {
  const email = ($('email')?.value || '').trim();
  if (!email) return msg('Enter an email address.', true);

  // Carry returnTo through the email link (works across devices)
  const base = window.location.origin;
  const emailRedirectTo =
    returnTo && isSafeReturnUrl(returnTo)
      ? `${base}?returnTo=${encodeURIComponent(returnTo)}`
      : base;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });
  if (error) return msg(error.message, true);
  msg('Magic link sent. Check your email.');
});

// ----- Handle redirect from magic link (?code=...) -----
(async function handleRedirect() {
  const code = qp('code');
  const next = qp('next') || '';
  if (!code) return;

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) { msg('Login failed. Try again.', true); return; }

  msg('Signed in. Tap “Copy Token & Return to SlimBuddy”.');
  // preload token for copy
  tokenBox.value = data?.session?.access_token || '';
  if (tokenBox.value) {
    copyBtn.style.display = 'inline-block';
    $('instructions').style.display = 'block';
    // keep a local copy for next time (fast-path)
    localStorage.setItem(LS_TOKEN, tokenBox.value);
    existingToken = tokenBox.value;
  }

  // Clean URL (keep next if present)
  window.history.replaceState({}, '', window.location.origin + (next ? `?next=${encodeURIComponent(next)}` : ''));
})();

// ----- Refresh session (renew token) -----
$('refreshSession')?.addEventListener('click', async () => {
  const { data, error } = await supabase.auth.getSession(); // refresh if possible
  if (error) return msg(error.message, true);
  if (!data?.session) return msg('No active session. Send a magic link.', true);

  tokenBox.value = data.session.access_token || '';
  if (tokenBox.value) {
    msg('Session refreshed. Token updated.');
    copyBtn.style.display = 'inline-block';
    $('instructions').style.display = 'block';
    localStorage.setItem(LS_TOKEN, tokenBox.value);
    existingToken = tokenBox.value;
  } else {
    msg('No token available. Try magic link.', true);
  }
});

// ----- Copy token & return -----
copyBtn?.addEventListener('click', async () => {
  const token = (tokenBox.value || '').trim();
  if (!token) return msg('No token to copy.', true);

  localStorage.setItem(LS_TOKEN, token);

  let copied = false;
  try { await navigator.clipboard.writeText(token); copied = true; }
  catch { /* non-fatal */ }

  if (!copied) {
    // fallback: reveal token + toggle link
    tokenBox.style.display = 'block';
    toggleTokenLink.style.display = 'inline';
    msg('Copy failed — token shown. Copy manually, then return to SlimBuddy.');
    return;
  }

  smartRedirectAfterCopy();
});

// ----- Toggle token visibility (optional) -----
toggleTokenLink?.addEventListener('click', (e) => {
  e.preventDefault();
  const isHidden = tokenBox.style.display === 'none' || tokenBox.style.display === '';
  tokenBox.style.display = isHidden ? 'block' : 'none';
  toggleTokenLink.textContent = isHidden ? 'Hide token' : 'Show token';
});
