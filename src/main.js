// src/main.js — YourSlimBuddy Connect (Netlify, Vite)
// - Magic link sign-in with Supabase
// - Calls Railway backend /api/connect/issue to mint short Connect Key
// - Copies key and returns user to ChatGPT (returnTo)

import { createClient } from '@supabase/supabase-js';

// ---- Config (from Vite .env) ----
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
// Optional: set in Netlify as VITE_BACKEND_BASE=https://... (falls back to prod)
const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE || 'https://slimbuddy-backend-production.up.railway.app';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// returnTo -> back to GPT
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
const clear = (el) => { if (el) el.textContent = ''; };

function setEmailPhase() {
  show(stepEmail, true);
  show(stepKey, false);
  show(emailPill, true);
  emailPill.textContent = 'Signed out';
  clear(emailMsg);
}

function setKeyPhase(email) {
  show(stepEmail, false);
  show(stepKey, true);
  signedPill.textContent = 'Signed in';
  signedDetail.textContent = email ? `Signed in as ${email}` : 'Signed in';
  show(keyWrap, false);
  regenKeyBtn.style.display = 'none';
  clear(keyMsg);
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
  keyMsg.innerHTML = 'Key generated. Copy it, return to ChatGPT, and paste when asked for <b>API Key</b>.';
  regenKeyBtn.style.display = 'inline-block';
}

// ---- Auth state & initial load ----
async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) setEmailPhase(); else setKeyPhase(session.user?.email || '');
  supabase.auth.onAuthStateChange((_evt, session2) => {
    if (session2) setKeyPhase(session2.user?.email || '');
    else setEmailPhase();
  });
}

// ---- Events ----
sendLinkBtn.addEventListener('click', async () => {
  const email = (emailInput.value || '').trim();
  if (!email) { emailMsg.textContent = 'Please enter a valid email.'; return; }
  emailMsg.textContent = 'Sending magic link…';
  sendLinkBtn.disabled = true;
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname + window.location.search,
      },
    });
    if (error) throw error;
    emailMsg.innerHTML = 'Magic link sent. Check your inbox (sender: <i>Supabase Auth</i>).';
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
    const token = session?.access_token;
    if (!token) { keyMsg.textContent = 'You are not signed in. Please use the magic link first.'; return; }

    const resp = await fetch(`${BACKEND_BASE}/api/connect/issue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Issue failed (${resp.status})`);
    }
    const payload = await resp.json();
    renderKey(payload.connect_key);
  } catch (e) {
    keyMsg.textContent = `Error: ${e.message || 'Unable to generate key.'}`;
  } finally {
    issueKeyBtn.disabled = false;
  }
});

regenKeyBtn.addEventListener('click', () => issueKeyBtn.click());

copyKeyBtn.addEventListener('click', async () => {
  const key = connectKeyEl.textContent || '';
  if (!key) return;
  keyMsg.textContent = (await copyToClipboard(key))
    ? 'Connect Key copied.'
    : 'Copy failed — please copy manually.';
});

returnBtn.addEventListener('click', async () => {
  returnBtn.disabled = true;
  await sleep(150);
  try { window.location.assign(returnTo); }
  finally { returnBtn.disabled = false; }
});

// ---- Go ----
init();