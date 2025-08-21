// src/main.js — YourSlimBuddy Connect (Netlify, Vite)
// - Magic link sign-in with Supabase
// - Calls Railway backend /api/connect/issue to mint short Connect Key
// - Copies key and returns user to ChatGPT (returnTo)

import { createClient } from '@supabase/supabase-js';

// ── Env (Netlify) ─────────────────────────────────────────────────────────────
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BACKEND_BASE  = import.meta.env.VITE_BACKEND_BASE; // e.g. https://slimbuddy-backend-production.up.railway.app

if (!SUPABASE_URL || !SUPABASE_ANON || !BACKEND_BASE) {
  console.error('Missing env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_BACKEND_BASE');
}

// Supabase client: detectSessionInUrl=true is critical for magic-link return
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// ── Elements ──────────────────────────────────────────────────────────────────
const statusPill   = document.getElementById('statusPill');
const emailPill    = document.getElementById('emailPill');
const logoutBtn    = document.getElementById('logoutBtn');

const signedOut    = document.getElementById('signedOut');
const emailInput   = document.getElementById('emailInput');
const sendLinkBtn  = document.getElementById('sendLinkBtn');

const signedIn     = document.getElementById('signedIn');
const genKeyBtn    = document.getElementById('genKeyBtn');
const keyBox       = document.getElementById('keyBox');
const copyBtn      = document.getElementById('copyBtn');
const msg          = document.getElementById('msg');

const debugBlock   = document.getElementById('debugBlock');
const showTokenBtn = document.getElementById('showTokenBtn');
const tokenBox     = document.getElementById('tokenBox');

const urlParams = new URLSearchParams(location.search);
const isDebug   = urlParams.get('debug') === '1';

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(ok, text) {
  statusPill.textContent = (ok ? '● ' : '○ ') + text;
  statusPill.style.background = ok ? '#dcfce7' : '#fee2e2';
  statusPill.style.borderColor = ok ? '#86efac' : '#fecaca';
  statusPill.style.color = ok ? '#065f46' : '#7f1d1d';
}

async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

async function refreshUI() {
  const session = await getSession();
  const authed = !!session?.user;

  if (authed) {
    setStatus(true, 'Signed in');
    emailPill.style.display = 'inline-block';
    emailPill.textContent = session.user.email || 'Signed in';
    logoutBtn.style.display = 'inline-block';

    signedOut.style.display = 'none';
    signedIn.style.display = 'grid';
    genKeyBtn.disabled = false;

    if (isDebug) debugBlock.style.display = 'grid';
  } else {
    setStatus(false, 'Not signed in');
    emailPill.style.display = 'none';
    logoutBtn.style.display = 'none';

    signedIn.style.display = 'none';
    signedOut.style.display = 'grid';
    genKeyBtn.disabled = true;
    keyBox.style.display = 'none';
    copyBtn.disabled = true;

    debugBlock.style.display = isDebug ? 'grid' : 'none';
    tokenBox.style.display = 'none';
  }
}

// ── Events ────────────────────────────────────────────────────────────────────
sendLinkBtn.addEventListener('click', async () => {
  const email = (emailInput.value || '').trim();
  if (!email) return (emailInput.focus(), undefined);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.href }
  });
  if (error) {
    msg.textContent = `Error sending link: ${error.message}`;
    msg.className = 'hint err';
  } else {
    msg.textContent = `Magic link sent to ${email}. Check your inbox.`;
    msg.className = 'hint ok';
  }
});

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  msg.textContent = 'Signed out.';
  msg.className = 'hint';
  await refreshUI();
});

showTokenBtn.addEventListener('click', async () => {
  const ses = await getSession();
  if (!ses) return;
  tokenBox.style.display = 'block';
  tokenBox.textContent = ses.access_token;
});

// Create short Connect Key using backend
genKeyBtn.addEventListener('click', async () => {
  const ses = await getSession();
  if (!ses) { await refreshUI(); return; }

  genKeyBtn.disabled = true;
  msg.textContent = 'Generating key…';
  msg.className = 'hint';

  try {
    const resp = await fetch(`${BACKEND_BASE}/api/connect/issue`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ses.access_token}`,
        'Accept': 'application/json'
      }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      msg.textContent = `Error: ${data.error || resp.statusText}`;
      msg.className = 'hint err';
      genKeyBtn.disabled = false;
      return;
    }
    // Expect: { key: "SB-....", expires_at: "..." }
    keyBox.style.display = 'block';
    keyBox.textContent = data.key;
    copyBtn.disabled = false;
    msg.textContent = 'Key created. Copy it and paste into YourSlimBuddy GPT when asked.';
    msg.className = 'hint ok';
  } catch (e) {
    console.error(e);
    msg.textContent = 'Unexpected error creating key.';
    msg.className = 'hint err';
  } finally {
    genKeyBtn.disabled = false;
  }
});

copyBtn.addEventListener('click', async () => {
  const value = (keyBox.textContent || '').trim();
  if (!value) return;
  try { await navigator.clipboard.writeText(value); } catch {}
  msg.textContent = 'Copied. Paste this key in YourSlimBuddy GPT.';
  msg.className = 'hint ok';
});

// Keep UI in sync with auth state (including magic-link redirect)
supabase.auth.onAuthStateChange(async (_event, _session) => {
  await refreshUI();
});
await refreshUI();
