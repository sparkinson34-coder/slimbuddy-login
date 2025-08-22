// src/main.js — YourSlimBuddy Connect (Netlify, Vite)
// - Magic link sign-in with Supabase
// - Calls Railway backend /api/connect/issue to mint short Connect Key
// - Copies key and returns user to ChatGPT (returnTo)

// src/main.js
import { createClient } from '@supabase/supabase-js';

// --- ENV (Vite) ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE || 'https://slimbuddy-backend-production.up.railway.app';

// --- Supabase client ---
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: true, persistSession: false } // we don't persist; we use hash token for backend call
});

// --- Elements ---
const emailStep = document.getElementById('emailStep');
const emailInput = document.getElementById('emailInput');
const sendLinkBtn = document.getElementById('sendLinkBtn');
const emailStatus = document.getElementById('emailStatus');

const tokenStep = document.getElementById('tokenStep');
const genKeyBtn = document.getElementById('genKeyBtn');
const copyKeyBtn = document.getElementById('copyKeyBtn');
const returnBtn = document.getElementById('returnBtn');
const keyBox = document.getElementById('keyBox');
const tokenStatus = document.getElementById('tokenStatus');

const signedRow = document.getElementById('signedRow');
const signedAs = document.getElementById('signedAs');
const logoutBtn = document.getElementById('logoutBtn');

const debugBlock = document.getElementById('debugBlock');
const dbg = document.getElementById('dbg');

// --- Helpers ---
const qs = new URLSearchParams(window.location.search);
const hasDebug = qs.has('debug');
if (hasDebug) {
  debugBlock.style.display = 'block';
}

function setDebug(key, val) {
  if (!hasDebug) return;
  const div = document.createElement('div');
  div.textContent = `${key}: ${val}`;
  dbg.appendChild(div);
}

// Parse location.hash returned by magic link: #access_token=...&expires_at=...&refresh_token=...&token_type=bearer&type=magiclink
function parseHash() {
  const hash = window.location.hash?.replace(/^#/, '') || '';
  const params = new URLSearchParams(hash);
  const token = params.get('access_token');
  const refresh = params.get('refresh_token');
  const type = params.get('type');
  return { token, refresh, type };
}

function getReturnTarget() {
  // Preserve returnTo=https://chatgpt.com/g/<...> if present
  return qs.get('returnTo') || '';
}

function showSignedIn(email) {
  signedRow.style.display = 'flex';
  signedAs.textContent = `Signed in as ${email}`;
}

function showEmailForm() {
  emailStep.style.display = 'block';
  tokenStep.style.display = 'none';
}

function showTokenStep() {
  emailStep.style.display = 'none';
  tokenStep.style.display = 'block';
}

async function getUserEmailFromJWT(jwt) {
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error) return { email: null, error };
  return { email: data.user?.email || null, error: null };
}

// --- Send magic link ---
sendLinkBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  if (!email) {
    emailStatus.innerHTML = '<span class="error">Please enter your email.</span>';
    return;
  }
  sendLinkBtn.disabled = true;
  emailStatus.textContent = 'Sending magic link…';

  try {
    const emailRedirectTo = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo
      }
    });
    if (error) {
      // 429 rate limit is common when testing repeatedly
      if (error.message?.toLowerCase().includes('rate') || error.status === 429) {
        emailStatus.innerHTML = '<span class="warn">Too many requests — please wait a minute and try again.</span>';
      } else {
        emailStatus.innerHTML = `<span class="error">Failed to send link: ${error.message}</span>`;
      }
    } else {
      emailStatus.innerHTML = '<span class="success">Magic link sent — check your inbox (sender: Supabase Auth).</span>';
    }
  } catch (e) {
    emailStatus.innerHTML = `<span class="error">Unexpected error: ${e.message}</span>`;
  } finally {
    sendLinkBtn.disabled = false;
  }
});

// --- On load: handle magic-link callback ---
window.addEventListener('DOMContentLoaded', async () => {
  const { token, refresh, type } = parseHash();
  setDebug('hashType', type || '(none)');
  setDebug('hasToken', token ? 'yes' : 'no');

  if (token) {
    // We have a session JWT from magic link — show token step, fetch email, and allow issuing a Connect Key
    showTokenStep();

    // Get user email (for header, and “signed in as”)
    const { email, error } = await getUserEmailFromJWT(token);
    if (email) {
      showSignedIn(email);
    } else {
      showSignedIn('YourSlimBuddy user');
      setDebug('emailError', error?.message || 'unknown');
    }

    // Enable Generate Connect Key
    genKeyBtn.disabled = false;

    // Wire up copy + return after key is minted
    copyKeyBtn.addEventListener('click', async () => {
      const text = keyBox.textContent.trim();
      if (!text) return;
      await navigator.clipboard.writeText(text);
      tokenStatus.innerHTML = '<span class="success">Key copied to clipboard.</span>';
      const rt = getReturnTarget();
      if (rt) {
        // small delay so the user sees the “copied” feedback
        setTimeout(() => (window.location.href = rt), 400);
      }
    });

    // Generate Connect Key -> POST /api/connect/issue with Bearer JWT
    genKeyBtn.addEventListener('click', async () => {
      genKeyBtn.disabled = true;
      tokenStatus.textContent = 'Generating your Connect Key…';

      try {
        const resp = await fetch(`${BACKEND_BASE}/api/connect/issue`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
        const json = await resp.json();
        if (!resp.ok) {
          tokenStatus.innerHTML = `<span class="error">Error generating key: ${json?.error || resp.statusText}</span>`;
          genKeyBtn.disabled = false;
          return;
        }
        keyBox.textContent = json.key;
        keyBox.style.display = 'block';
        copyKeyBtn.style.display = 'inline-flex';
        returnBtn.style.display = getReturnTarget() ? 'inline-flex' : 'none';
        tokenStatus.innerHTML = '<span class="success">Connect Key ready — copy it and return to YourSlimBuddy GPT.</span>';
      } catch (e) {
        tokenStatus.innerHTML = `<span class="error">Error generating key: ${e.message}</span>`;
        genKeyBtn.disabled = false;
      }
    });

    // Return button: only when returnTo given
    returnBtn.addEventListener('click', () => {
      const rt = getReturnTarget();
      if (rt) window.location.href = rt;
    });

    // Logout clears UI (since we don’t persist sessions, just reload)
    logoutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.href = window.location.origin + window.location.pathname + window.location.search; // clear hash
    });

  } else {
    // No token in hash — show email form
    showEmailForm();
    logoutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut();
      showEmailForm();
      signedRow.style.display = 'none';
    });
  }

  // Debug info (only with ?debug)
  setDebug('SUPABASE_URL', SUPABASE_URL);
  setDebug('BACKEND_BASE', BACKEND_BASE);
  setDebug('returnTo', getReturnTarget() || '(none)');
});
