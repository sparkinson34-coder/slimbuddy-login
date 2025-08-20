// src/main.js — YourSlimBuddy Connect (Netlify, Vite)
// - Magic link sign-in with Supabase
// - Calls Railway backend /api/connect/issue to mint short Connect Key
// - Copies key and returns user to ChatGPT (returnTo)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginDiv = document.getElementById('login');
const afterLoginDiv = document.getElementById('after-login');
const showKeyDiv = document.getElementById('show-key');
const keyInput = document.getElementById('connect-key');

async function login() {
  const email = document.getElementById('email').value;
  if (!email) return alert("Please enter your email");

  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) {
    alert("Error sending magic link: " + error.message);
  } else {
    alert("Check your email for a login link!");
  }
}

async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    loginDiv.classList.add('hidden');
    afterLoginDiv.classList.remove('hidden');
  }
}
checkSession();

async function generateKey() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return alert("Not logged in.");
  }

  try {
    const resp = await fetch(`${BACKEND_BASE}/api/connect/issue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: 'application/json',
      },
    });
    if (!resp.ok) throw new Error(await resp.text());
    const json = await resp.json();
    keyInput.value = json.connect_key;
    afterLoginDiv.classList.add('hidden');
    showKeyDiv.classList.remove('hidden');
  } catch (err) {
    alert("Error generating key: " + err.message);
  }
}

function copyKey() {
  navigator.clipboard.writeText(keyInput.value).then(() => {
    alert("Copied key: " + keyInput.value);
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("returnTo");
    if (returnTo) window.location.href = returnTo;
  });
}

window.login = login;
window.generateKey = generateKey;
window.copyKey = copyKey;
