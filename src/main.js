// SlimBuddy login helper
// - Persists/loads token locally so returning users see it immediately
// - Carries a ?returnTo=<GPT URL> through the flow and redirects back after saving

import { createClient } from '@supabase/supabase-js';

// --- Vite env (build-time)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DOM helpers
const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const tokenBox = $('tokenBox');
const copyBtn = $('copyTokenBtn');
const toggleTokenLink = $('toggleToken');
const firstTimeView = $('firstTimeView');
const returnView = $('returnView');
const subTitle = $('modeSubtitle');
const openGptLink = $('openGptLink');

function msg(text, isErr = false, flash = false) {
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.className = `helper ${isErr ? 'err' : 'ok'}`;
  if (flash) setTimeout(() => (statusEl.textContent = ''), 1500);
}

function qp(name) { return new URLSearchParams(window.location.search).get(name); }

function parseHashTokens() {
  const h = (window.location.hash || '').replace(/^#/, '');
  if (!h) return null;
  const params = new URLSearchParams(h);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (access_token && refresh_token) return { access_token, refresh_token };
  return null;
}

function isSafeReturnUrl(url) {
  try {
    const u = new URL(url);
    const allow = new Set(['chat.openai.com', 'chatgpt.com', 'yourslimbuddy.netlify.app']);
    return ['https:', 'http:'].includes(u.protocol) && allow.has(u.hostname);
  } catch { return false; }
}

function clearUrlNoise() {
  const base = window.location.origin;
  const params = new URLSearchParams(window.location.search);
  const keep = new URLSearchParams();
  ['returnTo', 'mode'].forEach(k => { const v = params.get(k); if (v) keep.set(k, v); });
  const qs = keep.toString();
  window.history.replaceState({}, '', qs ? `${base}?${qs}` : base);
}

function hasMagicLinkParams() {
  const code = qp('code') || '';
  const hash = (window.location.hash || '').toLowerCase();
  return Boolean(code) || hash.includes('access_token=');
}
function canWriteClipboard() { return !!(navigator.clipboard && navigator.clipboard.writeText); }

// --- Views
function showFirstTime() {
  firstTimeView.style.display = 'block';
  returnView.style.display = 'none';
  subTitle.textContent = 'Log in to get your Access Token';
}
function showReturn() {
  firstTimeView.style.display = 'none';
  returnView.style.display = 'block';
  subTitle.textContent = 'Copy your token & return to YourSlimBuddy';
}

// --- returnTo handling
const returnTo = (() => {
  const q = qp('returnTo');
  return q && isSafeReturnUrl(q) ? q : '';
})();
// expose optional open-in-new-tab link
if (returnTo) {
  openGptLink.href = returnTo;
  openGptLink.style.display = 'inline-block';
}

// --- First render: pick a view
if (qp('mode') === 'return') showReturn(); else showFirstTime();

// --- Hydrate from real Supabase session (not from localStorage)
(async function hydrateFromSession() {
  const { data } = await supabase.auth.getSession();
  const tok = data?.session?.access_token || '';
  if (!tok) { msg(''); return; } // clear "Loading…" and keep current view
  tokenBox.value = tok;
  localStorage.setItem('slimbuddy_jwt', tok); // keep for copy convenience
  copyBtn.style.display = 'inline-block';
  $('instructions').style.display = 'block';
  showReturn();
  msg('✅ You’re signed in. Press the button to copy your token and return.');
})();

// --- Fast return (disabled if handling magic link; and only if copy succeeds)
(function maybeFastReturn() {
  if (hasMagicLinkParams()) return;
  const existingToken = localStorage.getItem('slimbuddy_jwt') || '';
  if (!existingToken || !returnTo) return;

  const fastDiv = $('fastReturn');
  const fastSeconds = $('fastSeconds');
  const cancel = $('cancelRedirect');
  if (!fastDiv || !fastSeconds || !cancel) return;

  (async () => {
    let copied = false;
    if (canWriteClipboard()) { try { await navigator.clipboard.writeText(existingToken); copied = true; } catch {} }
    if (!copied) {
      copyBtn.style.display = 'inline-block';
      $('instructions').style.display = 'block';
      showReturn();
      msg('Tap “Copy Token & Return to YourSlimBuddy”. If needed, reveal token to copy manually.');
      return;
    }
    showReturn();
    fastDiv.style.display = 'block';
    let remaining = 1;
    fastSeconds.textContent = String(remaining);
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) { clearInterval(timer); /* do NOT auto-open GPT to avoid new threads */ fastDiv.style.display='none'; }
      else fastSeconds.textContent = String(remaining);
    }, 1000);
    cancel.addEventListener('click', (e) => {
      e.preventDefault(); clearInterval(timer); fastDiv.style.display = 'none';
      msg('Fast return cancelled.', false, true);
      copyBtn.style.display = 'inline-block'; $('instructions').style.display = 'block';
    });
  })();
})();

// --- Send magic link
$('sendLink')?.addEventListener('click', async () => {
  const email = ($('email')?.value || '').trim();
  if (!email) return msg('Enter an email address.', true);

  // Include mode=return so when they come back we show the return view directly
  const base = window.location.origin;
  const redirect = new URL(base);
  redirect.searchParams.set('mode', 'return');
  if (returnTo) redirect.searchParams.set('returnTo', returnTo);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect.toString() },
  });
  if (error) return msg(error.message, true);
  msg('Magic link sent. Email comes from YourSlimBuddy via Supabase Auth (check spam).');
});

// --- Handle magic link (both styles)

// 1) PKCE code
(async function handleCodeFlow() {
  const code = qp('code');
  if (!code) return;
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) { msg('Login failed. Try again.', true); return; }
  const tok = data?.session?.access_token || '';
  if (tok) {
    tokenBox.value = tok; localStorage.setItem('slimbuddy_jwt', tok);
    copyBtn.style.display = 'inline-block'; $('instructions').style.display = 'block';
    showReturn(); msg('✅ Logged in. Press the button below to copy your token and return.');
  }
  clearUrlNoise();
})();

// 2) Implicit hash tokens
(async function handleHashFlow() {
  const tokens = parseHashTokens();
  if (!tokens) return;
  const { error } = await supabase.auth.setSession(tokens);
  if (error) { msg('Login failed. Try again.', true); return; }
  const { data: sess } = await supabase.auth.getSession();
  const tok = sess?.session?.access_token || '';
  if (tok) {
    tokenBox.value = tok; localStorage.setItem('slimbuddy_jwt', tok);
    copyBtn.style.display = 'inline-block'; $('instructions').style.display = 'block';
    showReturn(); msg('✅ Logged in. Press the button below to copy your token and return.');
  }
  clearUrlNoise();
})();

// --- Refresh session (optional helper)
$('refreshSession')?.addEventListener('click', async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) return msg(error.message, true);
  if (!data?.session) return msg('No active session. Send a magic link.', true);
  const tok = data.session.access_token || '';
  if (tok) {
    tokenBox.value = tok; localStorage.setItem('slimbuddy_jwt', tok);
    copyBtn.style.display = 'inline-block'; $('instructions').style.display = 'block';
    showReturn(); msg('Session refreshed. Token updated.');
  }
});

// --- Copy & return (no auto-open; avoid new GPT threads)
copyBtn?.addEventListener('click', async () => {
  const token = (tokenBox.value || '').trim();
  if (!token) return msg('No token to copy.', true);
  localStorage.setItem('slimbuddy_jwt', token);

  let copied = false;
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(token); copied = true; } catch {}
  }

  if (!copied) {
    tokenBox.style.display = 'block';
    toggleTokenLink.style.display = 'inline';
    msg('Copy failed — token shown. Copy manually, then switch back to YourSlimBuddy.');
    return;
  }

  const fb = $('copy-feedback');
  if (fb) { fb.textContent = 'Token copied. Return to your original YourSlimBuddy chat and paste it.'; fb.style.display = 'block'; }
});

// --- Toggle token visibility
toggleTokenLink?.addEventListener('click', (e) => {
  e.preventDefault();
  const isHidden = tokenBox.style.display === 'none' || tokenBox.style.display === '';
  tokenBox.style.display = isHidden ? 'block' : 'none';
  toggleTokenLink.textContent = isHidden ? 'Hide token' : 'Show token';
});
