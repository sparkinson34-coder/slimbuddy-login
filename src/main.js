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

function qp(name) {
  const p = new URLSearchParams(window.location.search);
  return p.get(name);
}

function parseHashTokens() {
  // handle implicit flow: #access_token=...&refresh_token=...
  const h = (window.location.hash || '').replace(/^#/, '');
  if (!h) return null;
  const params = new URLSearchParams(h);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (access_token && refresh_token) return { access_token, refresh_token };
  return null;
}

function clearUrlNoise(keepNext = '') {
  const base = window.location.origin;
  const ret = qp('returnTo');
  const next = keepNext ? `?next=${encodeURIComponent(keepNext)}` : '';
  const rt = ret ? `${next ? '&' : '?'}returnTo=${encodeURIComponent(ret)}` : '';
  window.history.replaceState({}, '', base + next + rt);
}

function isSafeReturnUrl(url) {
  try {
    const u = new URL(url);
    const allow = new Set([
      'chat.openai.com',
      'chatgpt.com',
      'yourslimbuddy.netlify.app',
    ]);
    return ['https:', 'http:'].includes(u.protocol) && allow.has(u.hostname);
  } catch {
    return false;
  }
}

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

function revealCopy(token) {
  tokenBox.value = token || '';
  copyBtn.style.display = 'inline-block';
  $('instructions').style.display = 'block';
  localStorage.setItem(LS_TOKEN, tokenBox.value);
  existingToken = tokenBox.value;
  msg('✅ Logged in. Tap “Copy Token & Return to SlimBuddy”.');
}

// If we have a token already, prep UI
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
  // carry returnTo through email link (cross-device safe)
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
  msg('Magic link sent. Email comes from Supabase Auth.');
});

// ----- Handle redirect from email -----
// 1) Try PKCE/code flow (?code=...)
(async function handleCodeFlow() {
  const code = qp('code');
  const next = qp('next') || '';
  if (!code) return;
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) { msg('Login failed. Try again.', true); return; }
  revealCopy(data?.session?.access_token || '');
  clearUrlNoise(next);
})();

// 2) Try implicit flow (#access_token=...&refresh_token=...)
(async function handleHashFlow() {
  const tokens = parseHashTokens();
  if (!tokens) return;
  const { data, error } = await supabase.auth.setSession(tokens);
  if (error) { msg('Login failed. Try again.', true); return; }
  // after setSession, get fresh session to show token
  const { data: sess } = await supabase.auth.getSession();
  revealCopy(sess?.session?.access_token || '');
  clearUrlNoise();
})();

// 3) Fallback: if we arrive with an active session already, reveal copy
(async function onLoadSessionCheck() {
  const { data } = await supabase.auth.getSession();
  if (data?.session?.access_token && !existingToken) {
    revealCopy(data.session.access_token);
  }
})();

// ----- Refresh session (renew token) -----
$('refreshSession')?.addEventListener('click', async () => {
  const { data, error } = await supabase.auth.getSession(); // will refresh if possible
  if (error) return msg(error.message, true);
  if (!data?.session) return msg('No active session. Send magic link.', true);
  revealCopy(data.session.access_token || '');
});

// ----- Copy token & return -----
copyBtn?.addEventListener('click', async () => {
  const token = (tokenBox.value || '').trim();
  if (!token) return msg('No token to copy.', true);
  localStorage.setItem(LS_TOKEN, token);
  let copied = false;
  try { await navigator.clipboard.writeText(token); copied = true; } catch {}
  if (!copied) {
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
