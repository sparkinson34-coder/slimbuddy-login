// src/main.js — YourSlimBuddy Connect (Netlify, Vite)
// - Magic link sign-in with Supabase
// - Calls Railway backend /api/connect/issue to mint short Connect Key
// - Copies key and returns user to ChatGPT (returnTo)

import { createClient } from '@supabase/supabase-js';

// --- Handle Supabase magic-link hash (#access_token, #refresh_token) ---
(async () => {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const access_token  = hash.get('access_token');
  const refresh_token = hash.get('refresh_token');

  if (access_token && refresh_token) {
    // Create a session from the tokens in the hash
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    // Clean the URL (remove the fragment so it doesn't confuse future loads)
    history.replaceState({}, document.title, location.pathname + location.search);
    if (error) {
      console.error('setSession error:', error);
    }
  }
})();

// ---- Environment (Vite injects these at build time)
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BACKEND_BASE  = import.meta.env.VITE_BACKEND_BASE; // e.g. https://slimbuddy-backend-production.up.railway.app

// ---- DOM
const statusPill = document.getElementById('statusPill');
const emailPill  = document.getElementById('emailPill');
const logoutBtn  = document.getElementById('logoutBtn');

const envLine = document.getElementById('envLine');
const envWarn = document.getElementById('envWarn');

const signedOut   = document.getElementById('signedOut');
const emailInput  = document.getElementById('emailInput');
const sendLinkBtn = document.getElementById('sendLinkBtn');

const signedIn  = document.getElementById('signedIn');
const signedAs  = document.getElementById('signedAs');
const genKeyBtn = document.getElementById('genKeyBtn');
const keyBox    = document.getElementById('keyBox');
const copyBtn   = document.getElementById('copyBtn');
const msg       = document.getElementById('msg');

// ---- Small UI helpers
function setStatus(ok, text) {
  statusPill.textContent = (ok ? '● ' : '○ ') + text;
  statusPill.style.background = ok ? '#dcfce7' : '#fee2e2';
  statusPill.style.borderColor = ok ? '#86efac' : '#fecaca';
  statusPill.style.color = ok ? '#065f46' : '#7f1d1d';
}

// Env line (so you can confirm what Netlify injected)
envLine.textContent =
  `Env: SUPABASE_URL=${!!SUPABASE_URL} • ANON=${!!SUPABASE_ANON} • BACKEND_BASE=${!!BACKEND_BASE}`;

// Warn if anything missing
const missing = [];
if (!SUPABASE_URL)  missing.push('VITE_SUPABASE_URL');
if (!SUPABASE_ANON) missing.push('VITE_SUPABASE_ANON_KEY');
if (!BACKEND_BASE)  missing.push('VITE_BACKEND_BASE');
if (missing.length) {
  envWarn.style.display = 'block';
  envWarn.textContent = `Missing environment variable(s): ${missing.join(', ')}. The page will still render, but key generation and/or login cannot work until these are set in Netlify and redeployed.`;
}

// ---- Supabase client (optional; page still works without it)
let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
}

// ---- Renderers
function showSignedOut() {
  setStatus(false, 'Not signed in');
  emailPill.style.display = 'none';
  logoutBtn.style.display = 'none';
  signedOut.style.display = 'grid';
  signedIn.style.display = 'none';
  genKeyBtn.disabled = true;
  copyBtn.disabled = true;
  keyBox.style.display = 'none';
}

async function showSignedIn(user) {
  setStatus(true, 'Signed in');
  emailPill.style.display = 'inline-block';
  emailPill.textContent = user.email || 'Signed in';
  logoutBtn.style.display = 'inline-block';
  signedAs.textContent = `Signed in as ${user.email || 'your account'}`;

  signedOut.style.display = 'none';
  signedIn.style.display = 'grid';
  genKeyBtn.disabled = false;
}

// ---- State refresh
async function refreshUI() {
  if (!supabase) { showSignedOut(); return; }
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) showSignedIn(session.user);
  else showSignedOut();
}

// ---- Events
sendLinkBtn.addEventListener('click', async () => {
  if (!supabase) { msg.textContent = 'Supabase not configured.'; msg.className='hint'; return; }
  const email = (emailInput.value || '').trim();
  if (!email) { emailInput.focus(); return; }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.href }
  });
  if (error) { msg.textContent = `Error: ${error.message}`; msg.className='hint'; }
  else { msg.textContent = `Magic link sent to ${email}. Check your inbox.`; msg.className='hint'; }
});

logoutBtn.addEventListener('click', async () => {
  if (supabase) await supabase.auth.signOut();
  await refreshUI();
});

genKeyBtn.addEventListener('click', async () => {
  if (!supabase) { msg.textContent = 'Supabase not configured.'; return; }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) { await refreshUI(); return; }

  genKeyBtn.disabled = true; msg.textContent = 'Generating key…';

  try {
    const resp = await fetch(`${BACKEND_BASE}/api/connect/issue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: 'application/json'
      }
    });
    const data = await resp.json().catch(()=> ({}));
    if (!resp.ok) {
      msg.textContent = `Error: ${data.error || resp.statusText}`;
      genKeyBtn.disabled = false; return;
    }
    keyBox.style.display = 'block';
    keyBox.textContent = data.key;
    copyBtn.disabled = false;
    msg.textContent = 'Key created. Copy it and paste into YourSlimBuddy GPT.';
  } catch (e) {
    msg.textContent = 'Network error creating key.';
  } finally {
    genKeyBtn.disabled = false;
  }
});

copyBtn.addEventListener('click', async () => {
  const v = (keyBox.textContent || '').trim();
  if (!v) return;
  try { await navigator.clipboard.writeText(v); } catch {}
  msg.textContent = 'Copied. Paste this key in YourSlimBuddy GPT.';
});

// ---- Boot
if (supabase) {
  supabase.auth.onAuthStateChange(() => refreshUI());
}
refreshUI();
