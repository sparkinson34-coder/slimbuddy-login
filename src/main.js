// SlimBuddy login helper
// - Persists/loads token locally so returning users see it immediately
// - Carries a ?returnTo=<GPT URL> through the flow and redirects back after saving

import { createClient } from '@supabase/supabase-js';

// Vite env
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM helpers
const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const tokenBox = $('tokenBox');
const copyBtn = $('copyTokenBtn');
const toggleTokenLink = $('toggleToken');
const firstTimeView = $('firstTimeView');
const returnView = $('returnView');
const okline = $('okline');
const instructions = $('instructions');
const signedInAs = $('signedInAs');
const currentEmailEl = $('currentEmail');
const signOutLink = $('signOutLink');

function msg(text, isErr = false, flash = false) {
  statusEl.textContent = text || '';
  statusEl.className = `helper ${isErr ? 'err' : 'ok'}`;
  if (flash) setTimeout(() => (statusEl.textContent = ''), 1500);
}

function qp(name){ return new URLSearchParams(window.location.search).get(name); }
function parseHashTokens(){
  const h = (window.location.hash || '').replace(/^#/, '');
  if (!h) return null;
  const p = new URLSearchParams(h);
  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  return (access_token && refresh_token) ? { access_token, refresh_token } : null;
}
function clearUrlNoise(){
  const base = window.location.origin;
  const params = new URLSearchParams(window.location.search);
  const keep = new URLSearchParams();
  ['returnTo','mode'].forEach(k => { const v=params.get(k); if (v) keep.set(k,v); });
  const qs = keep.toString();
  window.history.replaceState({}, '', qs ? `${base}?${qs}` : base);
}

function showFirstTime(){
  firstTimeView.style.display='block';
  returnView.style.display='none';
  okline.style.display='none';
  statusEl.textContent='';
}
function showReturn(){
  firstTimeView.style.display='none';
  returnView.style.display='block';
  okline.style.display='block';
  instructions.style.display='block';
}

async function paintSignedInUser(){
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user){
    signedInAs.style.display='none';
    currentEmailEl.textContent='';
    return;
  }
  const email = data.user.email || '(unknown)';
  currentEmailEl.textContent = email;
  signedInAs.style.display='block';
}

// initial view
if (qp('mode') === 'return') showReturn(); else showFirstTime();

// hydrate from real session
(async function hydrate(){
  const { data } = await supabase.auth.getSession();
  const tok = data?.session?.access_token || '';
  if (!tok){ return; }
  tokenBox.value = tok;
  localStorage.setItem('slimbuddy_jwt', tok); // for copy convenience only
  copyBtn.style.display='inline-block';
  showReturn();
  await paintSignedInUser();
})();

// sign out
signOutLink?.addEventListener('click', async (e)=>{
  e.preventDefault();
  try{ await supabase.auth.signOut(); } catch {}
  localStorage.removeItem('slimbuddy_jwt');
  tokenBox.value='';
  signedInAs.style.display='none';
  showFirstTime();
  msg('Signed out. Send a magic link to sign in.');
});

// send magic link
$('sendLink')?.addEventListener('click', async ()=>{
  const email = ($('email')?.value || '').trim();
  if (!email) return msg('Enter an email address.', true);

  const base = window.location.origin;
  const redirect = new URL(base);
  redirect.searchParams.set('mode','return');

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect.toString() },
  });
  if (error) return msg(error.message, true);
  msg('Magic link sent. Check your inbox (and spam) for “YourSlimBuddy (Supabase Auth)”.');
});

// handle magic link (code)
(async function handleCode(){
  const code = qp('code');
  if (!code) return;
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error){ msg('Login failed. Try again.', true); return; }
  const tok = data?.session?.access_token || '';
  if (tok){
    tokenBox.value = tok;
    localStorage.setItem('slimbuddy_jwt', tok);
    copyBtn.style.display='inline-block';
    showReturn(); await paintSignedInUser();
  }
  clearUrlNoise();
})();

// handle magic link (hash)
(async function handleHash(){
  const tokens = parseHashTokens();
  if (!tokens) return;
  const { error } = await supabase.auth.setSession(tokens);
  if (error){ msg('Login failed. Try again.', true); return; }
  const { data: sess } = await supabase.auth.getSession();
  const tok = sess?.session?.access_token || '';
  if (tok){
    tokenBox.value = tok;
    localStorage.setItem('slimbuddy_jwt', tok);
    copyBtn.style.display='inline-block';
    showReturn(); await paintSignedInUser();
  }
  clearUrlNoise();
})();

// copy & guidance (no auto-open; avoids new chats)
copyBtn?.addEventListener('click', async ()=>{
  const token = (tokenBox.value || '').trim();
  if (!token) return msg('No token to copy.', true);
  localStorage.setItem('slimbuddy_jwt', token);

  let copied=false;
  if (navigator.clipboard?.writeText){
    try{ await navigator.clipboard.writeText(token); copied=true; }catch{}
  }

  if (!copied){
    tokenBox.style.display='block';
    toggleTokenLink.style.display='inline';
    msg('Copy failed — token shown. Copy manually, then close this window and return to YourSlimBuddy GPT.');
    return;
  }

  const fb = $('copy-feedback');
  if (fb){
    fb.textContent = 'Token copied. Close this window and return to your YourSlimBuddy chat, then paste it.';
    fb.style.display='block';
  }
});

// reveal token (fallback)
toggleTokenLink?.addEventListener('click', (e)=>{
  e.preventDefault();
  const show = tokenBox.style.display === 'none' || tokenBox.style.display === '';
  tokenBox.style.display = show ? 'block' : 'none';
  toggleTokenLink.textContent = show ? 'Hide token' : 'Show token';
});

// refresh session (optional helper)
$('refreshSession')?.addEventListener('click', async ()=>{
  const { data, error } = await supabase.auth.getSession();
  if (error) return msg(error.message, true);
  if (!data?.session) return msg('No active session. Send a magic link.', true);
  const tok = data.session.access_token || '';
  if (tok){
    tokenBox.value = tok; localStorage.setItem('slimbuddy_jwt', tok);
    copyBtn.style.display='inline-block';
    showReturn(); await paintSignedInUser();
    msg('Session refreshed.');
  }
});
