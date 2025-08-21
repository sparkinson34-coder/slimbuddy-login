// src/main.js — YourSlimBuddy Connect (Netlify, Vite)
// - Magic link sign-in with Supabase
// - Calls Railway backend /api/connect/issue to mint short Connect Key
// - Copies key and returns user to ChatGPT (returnTo)

import { createClient } from '@supabase/supabase-js';

// ---- Env (Netlify) ---------------------------------------------------------
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BACKEND_BASE  = import.meta.env.VITE_BACKEND_BASE; // e.g. https://slimbuddy-backend-production.up.railway.app
if (!SUPABASE_URL || !SUPABASE_ANON || !BACKEND_BASE) {
  console.error('Missing env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_BACKEND_BASE');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ---- UI elements -----------------------------------------------------------
const statusDot   = document.getElementById('statusDot');
const emailPill   = document.getElementById('emailPill');
const logoutBtn   = document.getElementById('logoutBtn');

const sendLinkBtn = document.getElementById('sendLinkBtn');
const showTokenBtn= document.getElementById('showTokenBtn');
const tokenBox    = document.getElementById('tokenBox');

const genKeyBtn   = document.getElementById('genKeyBtn');
const keyBox      = document.getElementById('keyBox');
const copyBtn     = document.getElementById('copyBtn');
const returnBtn   = document.getElementById('returnBtn');
const msg         = document.getElementById('msg');

// Return target (so Return button knows where to go)
const params    = new URLSearchParams(location.search);
const returnTo  = params.get('returnTo') || 'https://chat.openai.com/';

// ---- Helpers ---------------------------------------------------------------
function setStatus(ok, text) {
  statusDot.textContent = (ok ? '● ' : '○ ') + text;
  statusDot.style.background = ok ? '#dcfce7' : '#fee2e2';
  statusDot.style.borderColor = ok ? '#86efac' : '#fecaca';
  statusDot.style.color = ok ? '#065f46' : '#7f1d1d';
}
function setMessage(text, type='') {
  msg.textContent = text || '';
  msg.className = type ? type : 'muted';
}
async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}
async function refreshStatus() {
  const session = await getSession();
  if (session?.user) {
    setStatus(true, 'Signed in');
    emailPill.style.display = 'inline-block';
    emailPill.textContent = session.user.email;
    logoutBtn.style.display = 'inline-block';
    genKeyBtn.disabled = false;
  } else {
    setStatus(false, 'Not signed in');
    emailPill.style.display = 'none';
    logoutBtn.style.display = 'none';
    genKeyBtn.disabled = true;
  }
}

// ---- Auth actions ----------------------------------------------------------
sendLinkBtn.addEventListener('click', async () => {
  const email = prompt('Enter your email to receive a magic link:');
  if (!email) return;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
  if (error) return setMessage(`Error sending link: ${error.message}`, 'error');
  setMessage('Magic link sent. Check your email.', 'ok');
});

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  keyBox.style.display = 'none';
  copyBtn.disabled = true;
  returnBtn.disabled = true;
  setMessage('Signed out. Re-send a magic link to sign in.', '');
  refreshStatus();
});

showTokenBtn.addEventListener('click', async () => {
  const session = await getSession();
  if (!session) return setMessage('Not signed in.', 'error');
  tokenBox.style.display = 'block';
  tokenBox.textContent = session.access_token;
});

// ---- Generate key via backend ----------------------------------------------
genKeyBtn.addEventListener('click', async () => {
  try {
    const session = await getSession();
    if (!session) return setMessage('Please sign in first.', 'error');

    setMessage('Generating key…');
    const resp = await fetch(`${BACKEND_BASE}/api/connect/issue`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Accept': 'application/json',
      },
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('issue error', data);
      return setMessage(`Error generating key: ${data.error || resp.statusText}`, 'error');
    }

    // Expect { key: 'SB-XXXX-XXX-X-XXXX', expires_at: '...' }
    keyBox.style.display = 'block';
    keyBox.textContent = data.key;
    copyBtn.disabled = false;
    returnBtn.disabled = false;
    setMessage('Key created. Copy it, then return to ChatGPT and paste it.', 'ok');
  } catch (e) {
    console.error(e);
    setMessage('Unexpected error creating key.', 'error');
  }
});

copyBtn.addEventListener('click', async () => {
  const value = keyBox.textContent.trim();
  if (!value) return;
  await navigator.clipboard.writeText(value).catch(() => {});
  setMessage('Copied. Now return to ChatGPT and paste your key.', 'ok');
});

returnBtn.addEventListener('click', () => {
  const value = keyBox.textContent.trim();
  if (value) {
    // Try to grant temporary clipboard read permission prompt on some browsers
    // then return to the GPT chat page.
  }
  window.location.href = returnTo;
});

// ---- Boot ------------------------------------------------------------------
supabase.auth.onAuthStateChange(() => refreshStatus());
refreshStatus();
