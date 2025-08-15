// SlimBuddy login helper
// - Persists/loads token locally so returning users see it immediately
// - Carries a ?returnTo=<GPT URL> through the flow and redirects back after saving

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------- Supabase config ----------
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase env. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- DOM helpers ----------
const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const tokenBox = $('tokenBox');

function msg(text, isErr=false, flash=false) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = isErr ? 'err' : 'ok';
  if (flash) setTimeout(() => { statusEl.textContent = ''; }, 1500);
}

function getQueryParam(name) {
  const p = new URLSearchParams(window.location.search);
  return p.get(name);
}

function isSafeReturnUrl(url) {
  try {
    const u = new URL(url);
    const allowHosts = new Set([
      'chat.openai.com',
      'yourslimbuddy.netlify.app',
    ]);
    return ['https:', 'http:'].includes(u.protocol) && allowHosts.has(u.hostname);
  } catch {
    return false;
  }
}

function smartRedirectAfterCopy() {
  const qsReturnTo = getQueryParam('returnTo');
  const ssReturnTo = sessionStorage.getItem('slimbuddyReturnUrl');
  const ref = document.referrer;

  if (qsReturnTo && isSafeReturnUrl(qsReturnTo)) {
    window.location.href = qsReturnTo;
    return;
  }
  if (ssReturnTo && isSafeReturnUrl(ssReturnTo)) {
    sessionStorage.removeItem('slimbuddyReturnUrl');
    window.location.href = ssReturnTo;
    return;
  }
  if (ref && isSafeReturnUrl(ref)) {
    window.location.href = ref;
    return;
  }
  if (history.length > 1) {
    history.back();
    return;
  }
  const fb = $('copy-feedback');
  if (fb) {
    fb.textContent = 'Token copied! Switch back to SlimBuddy GPT and paste it in.';
    fb.style.display = 'block';
  }
}

// ---------- Return-to detection ----------
const sessionReturnToKey = 'slimbuddyReturnUrl';
const incomingReturnTo = getQueryParam('returnTo');
const storedReturnTo = sessionStorage.getItem(sessionReturnToKey);
const returnTo = incomingReturnTo || storedReturnTo || '';
if (incomingReturnTo) {
  sessionStorage.setItem(sessionReturnToKey, incomingReturnTo);
}

// ---------- Existing token (for fast-path) ----------
const LS_TOKEN_KEY = 'slimbuddy_jwt';
const existingToken = localStorage.getItem(LS_TOKEN_KEY) || '';
if (existingToken) {
  tokenBox.value = existingToken;
  $('copyTokenBtn').style.display = 'inline-block';
  $('instructions').style.display = 'block';
  msg('✅ Found a previously saved token.');
}

// ---------- Fast-path: token + safe returnTo => auto-copy & redirect ----------
(function maybeFastReturn() {
  if (!existingToken || !returnTo || !isSafeReturnUrl(returnTo)) return;

  const fastDiv = $('fastReturn');
  const fastSeconds = $('fastSeconds');
  const cancel = $('cancelRedirect');

  if (fastDiv && fastSeconds && cancel) {
    fastDiv.style.display = 'block';
    let remaining = 1; // seconds
    fastSeconds.textContent = String(remaining);

    // try to copy (non-fatal if it fails)
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

// ---------- Send magic link ----------
$('sendLink').onclick = async () => {
  const email = ($('email')?.value || '').trim();
  if (!email) return msg('Enter an email address.', true);

  if (incomingReturnTo && isSafeReturnUrl(incomingReturnTo)) {
    sessionStorage.setItem(sessionReturnToKey, incomingReturnTo);
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin }
  });
  if (error) return msg(error.message, true);
  msg('Magic link sent. Check your email and click the link.');
};

// ---------- Handle redirect from email (exchange ?code -> session) ----------
(async function handleRedirect() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '';
  if (!code) return;

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) { msg('Login failed. Please try again.', true); return; }

  msg('Signed in! Click “Show My Token”.');
  window.history.replaceState({}, '', window.location.origin + (next ? `?next=${encodeURIComponent(next)}` : ''));
})();

// ---------- Show token ----------
$('showToken').onclick = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session) return msg('Not signed in. Use magic link first.', true);

  tokenBox.value = data.session.access_token || '';
  if (tokenBox.value) {
    msg('Token ready. Click “Copy Token & Return to SlimBuddy”.');
    $('copyTokenBtn').style.display = 'inline-block';
    $('instructions').style.display = 'block';
  } else {
    msg('No token available. Try Refresh Session or magic link.', true);
  }
};

// ---------- Refresh session ----------
$('refreshSession').onclick = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) return msg(error.message, true);
  if (!data?.session) return msg('No active session. Send a magic link again.', true);

  tokenBox.value = data.session.access_token || '';
  msg('Session refreshed. Token updated.');
  $('copyTokenBtn').style.display = 'inline-block';
  $('instructions').style.display = 'block';
};

// ---------- Copy token & return ----------
$('copyTokenBtn').onclick = async () => {
  const token = (tokenBox.value || '').trim();
  if (!token) return msg('No token to copy.', true);

  localStorage.setItem(LS_TOKEN_KEY, token);

  try { await navigator.clipboard.writeText(token); }
  catch { /* ignore */ }

  smartRedirectAfterCopy();
};

// ---------- Optional: Open GPT in new tab ----------
$('openGpt').onclick = () => {
  // Replace with your real SlimBuddy GPT share URL:
  window.open('https://chat.openai.com/g/g-XXXXXX-slimbuddy', '_blank', 'noopener');
};
