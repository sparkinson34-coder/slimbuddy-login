import { createClient } from '@supabase/supabase-js';

// ✅ 1) Load env vars from Vite (.env)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Basic guard to help beginners
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check 6.3 .env setup.');
}

// ✅ 2) Create the Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Redirect helpers (for “Copy Token” UX) ----------
function getQueryParam(name) {
  const p = new URLSearchParams(window.location.search);
  return p.get(name);
}

function isSafeReturnUrl(url) {
  try {
    const u = new URL(url);
    // Allowlist ONLY your trusted domains
    const allowHosts = [
      'chat.openai.com',
      'yourslimbuddy.netlify.app',
      'slimbuddy-login.netlify.app',
      // 'your.custom.domain' // add if/when you use a custom domain
    ];
    return ['https:', 'http:'].includes(u.protocol) && allowHosts.includes(u.hostname);
  } catch {
    return false;
  }
}

function smartRedirectAfterCopy() {
  const qsReturnTo = getQueryParam('returnTo');
  const ssReturnTo = sessionStorage.getItem('slimbuddyReturnUrl');
  const ref = document.referrer;

  // 1) ?returnTo= (validated)
  if (qsReturnTo && isSafeReturnUrl(qsReturnTo)) {
    window.location.href = qsReturnTo;
    return;
  }
  // 2) sessionStorage handoff (validated)
  if (ssReturnTo && isSafeReturnUrl(ssReturnTo)) {
    sessionStorage.removeItem('slimbuddyReturnUrl');
    window.location.href = ssReturnTo;
    return;
  }
  // 3) Referrer (e.g., ChatGPT tab)
  if (ref && isSafeReturnUrl(ref)) {
    window.location.href = ref;
    return;
  }
  // 4) History back
  if (history.length > 1) {
    history.back();
    return;
  }
  // 5) Fallback: show hint to paste token
  const msg = document.getElementById('copy-feedback');
  if (msg) {
    msg.textContent = 'Token copied! Switch back to SlimBuddy GPT and paste it in.';
    msg.style.display = 'block';
  }
}
// -----------------------------------------------------------

// ✅ 3) Wire up events when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const isResetPage = window.location.pathname.includes('reset-password');
  const hasAccessToken = window.location.hash.includes('access_token');

  if (isResetPage && hasAccessToken) {
    // We’ve landed from the email link → render the reset UI
    showPasswordResetUI();
    return;
  }

  // Otherwise we’re on index.html → set up buttons
  const loginBtn = document.getElementById('login-btn');
  const signupBtn = document.getElementById('signup-btn');
  const resetBtn = document.getElementById('reset-btn');

  if (loginBtn) loginBtn.addEventListener('click', login);
  if (signupBtn) signupBtn.addEventListener('click', signUp);
  if (resetBtn) resetBtn.addEventListener('click', resetPasswordRequest);

  // If a token already exists (returning user), reveal Copy Token button
  const existingToken = localStorage.getItem('slimbuddy_token');
  if (existingToken) revealCopyUI(existingToken);
});

// 🔧 Small UI helper
function setStatus(msg) {
  const el = document.getElementById('status');
  if (el) el.innerText = msg;
}

// 🔧 Show Copy Token UI and wire the redirect behaviour
function revealCopyUI(token) {
  const copyBtn = document.getElementById('copyTokenBtn');
  const instructions = document.getElementById('instructions');

  if (copyBtn) {
    copyBtn.style.display = 'block';
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(token);
      } catch {
        // Ignore clipboard failure; still try to redirect
      } finally {
        smartRedirectAfterCopy();
      }
    };
  }
  if (instructions) instructions.style.display = 'block';
}

// ✅ 4) Login
async function login() {
  const email = document.getElementById('email')?.value;
  const password = document.getElementById('password')?.value;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    setStatus(`Error: ${error.message}`);
    return;
  }

  const token = data.session.access_token;
  localStorage.setItem('slimbuddy_token', token);
  setStatus('Login successful! Token stored.');

  // Reveal Copy Token + instructions (with smart redirect)
  revealCopyUI(token);
}

// ✅ 5) Sign Up
async function signUp() {
  const email = document.getElementById('email')?.value;
  const password = document.getElementById('password')?.value;

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) setStatus(`Error: ${error.message}`);
  else setStatus('Sign-up successful! Check your email.');
}

// ✅ 6) Request a Reset Password email
async function resetPasswordRequest() {
  const email = document.getElementById('email')?.value;
  if (!email) {
    alert('Please enter your email to reset the password.');
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // This must match your Supabase Allowed Redirect URLs (see 6.5)
    redirectTo: 'https://yourslimbuddy.netlify.app/reset-password',
  });

  if (error) setStatus(`Error: ${error.message}`);
  else setStatus('Password reset email sent! Check your inbox.');
}

// ✅ 7) Render the Reset Password UI on /reset-password after email link
function showPasswordResetUI() {
  // Simple, inline UI – your reset-password.html only needs a #status element.
  document.body.innerHTML = `
    <div style="max-width:420px;margin:60px auto;background:#fff;padding:24px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);font-family:Arial,sans-serif">
      <h2 style="color:#2b6777;margin-top:0">Reset Your Password</h2>
      <input type="password" id="new-password" placeholder="Enter New Password"
             style="width:100%;padding:10px;border:1px solid #ccc;border-radius:4px;font-size:16px" />
      <button id="update-password-btn" style="width:100%;padding:12px 16px;margin-top:12px;background:#2b6777;color:#fff;border:none;border-radius:5px;cursor:pointer">
        Update Password
      </button>
      <p id="status" style="margin-top:12px;font-weight:bold"></p>
      <p><a href="index.html">Back to Login</a></p>
      <p id="copy-feedback" style="display:none;margin-top:8px;font-size:0.95rem;"></p>
    </div>
  `;

  document.getElementById('update-password-btn')
    .addEventListener('click', updatePassword);
}

// ✅ 8) Submit the new password to Supabase
async function updatePassword() {
  const newPassword = document.getElementById('new-password')?.value;
  if (!newPassword) {
    alert('Please enter a new password.');
    return;
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) setStatus(`Error: ${error.message}`);
  else setStatus('Password updated successfully! You can now log in.');
}

