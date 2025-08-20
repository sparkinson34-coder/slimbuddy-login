// src/main.js
// YourSlimBuddy Connect — Netlify frontend
// - Sends Supabase magic link
// - After login, calls backend /api/connect/issue to mint a short Connect Key
// - Lets user copy key and jump back to GPT (returnTo param)

import { createClient } from '@supabase/supabase-js';

// ---- Config from Vite .env (do NOT hardcode secrets) ----
// .env (Netlify):
// VITE_SUPABASE_URL=... (Project URL)
// VITE_SUPABASE_ANON_KEY=... (anon key)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// Backend base (Railway)
const BACKEND_BASE = 'https://slimbuddy-backend-production.up.railway.app';

const qs = new URLSearchParams(window.location.search);
const returnTo = qs.get('returnTo') || 'https://chatgpt.com/';

// ---- Elements ----
const stepEmail = document.getElementById('step-email');
const emailInput = document.getElementById('email');
const sendLinkBtn = document.getElementById('sendLinkBtn');
const emailMsg = document.getElementById('emailMsg');
const emailPill = document.getElementById('email-pill');

const stepKey = document.getElementById('step-key');
const signedPill = document.getElementById('signedPill');
const signedDetail = document.getElementById('signedDetail');
const issueKeyBtn = document.getElementById('issueKeyBtn');
const regenKeyBtn = document.getElementById('regenKeyBtn');
const keyWrap = document.getElementById('keyWrap');
const connectKeyEl = document.getElementById('connectKey');
const copyKeyBtn = document.getElementById('copyKeyBtn');
const returnBtn = document.getElementById('returnBtn');
const keyMsg = document.getElementById('keyMsg');

// ---- Helpers ----
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const show = (el, v=true) => { el.hidden = !v; el.style.display = v ? '' : 'none'; };

function setEmailPhase() {
  show(stepEmail, true);
  show(stepKey, false);
  show(emailPill, true);
  emailPill.textContent = 'Signed out';
}

function setKeyPhase(email) {
  show(stepEmail, false);
  show(stepKey, true);
  signedPill.textContent = 'Signed in';
  signedDetail.textContent = email ? `Signed in as ${email}` : 'Signed in';
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function renderKey(key) {
  connectKeyEl.textContent = key;
  show(keyWrap, true);
  keyMsg.textContent = 'Key generated. Paste it into ChatGPT when prompted for “API Key”.';
}

// ---- Auth state & initial load ----
async function init() {
  // Supabase handles magic-link redirects automatically; we just read session.
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    setEmailPhase();
  } else {
    const email = session.user?.email || '';
    setKeyPhase(email);
  }

  // Keep UI in sync with future auth changes
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      const email = session.user?.email || '';
      setKeyPhase(email);
    } else {
      setEmailPhase();
    }
  });
}

// ---- Events ----
sendLinkBtn.addEventListener('click', async () => {
  const email = (emailInput.value || '').trim();
  if (!email) {
    emailMsg.textContent = 'Please enter a valid email address.';
    return;
  }
  emailMsg.textContent = 'Sending magic link…';
  sendLinkBtn.disabled = true;

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // After user clicks the email link, they should land back here
        emailRedirectTo: window.location.origin + window.location.pathname + window.location.search,
      },
    });
    if (error) throw error;
    emailMsg.innerHTML = 'Magic link sent. Check your inbox (sender: Supabase Auth).';
  } catch (e) {
    emailMsg.textContent = `Error: ${e.message || 'Could not send link.'}`;
  } finally {
    sendLinkBtn.disabled = false;
  }
});

issueKeyBtn.addEventListener('click', async () => {
  keyMsg.textContent = '';
  issueKeyBtn.disabled = true;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      keyMsg.textContent = 'You are not signed in. Please request a magic link first.';
      issueKeyBtn.disabled = false;
      return;
    }

    const resp = await fetch(`${BACKEND_BASE}/api/connect/issue`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Issue failed (${resp.status})`);
    }

    const payload = await resp.json();
    const key = payload.connect_key;
    renderKey(key);
    regenKeyBtn.style.display = 'inline-block';
    keyMsg.innerHTML = 'Copy your key, then return to ChatGPT and paste it when prompted for <b>API Key</b>.';
  } catch (e) {
    keyMsg.textContent = `Error: ${e.message || 'Unable to generate key.'}`;
  } finally {
    issueKeyBtn.disabled = false;
  }
});

regenKeyBtn.addEventListener('click', () => {
  // Optional: you could call a revoke+issue endpoint. For now we just re-issue by clicking Generate again.
  issueKeyBtn.click();
});

copyKeyBtn.addEventListener('click', async () => {
  const key = connectKeyEl.textContent || '';
  if (!key) return;

  const ok = await copyToClipboard(key);
  keyMsg.textContent = ok ? 'Connect Key copied.' : 'Copy failed — please copy manually.';
});

returnBtn.addEventListener('click', async () => {
  // Tiny visual feedback
  returnBtn.disabled = true;
  await sleep(200);
  try {
    window.location.assign(returnTo);
  } finally {
    returnBtn.disabled = false;
  }
});

// ---- Go ----
init();
