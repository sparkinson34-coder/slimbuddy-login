import { createClient } from '@supabase/supabase-js';

// ✅ 1. LOAD ENVIRONMENT VARIABLES
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ✅ 2. CREATE SUPABASE CLIENT
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ✅ 3. EVENT HANDLER FOR DOM LOADED
document.addEventListener('DOMContentLoaded', () => {
  // ✅ If URL contains access_token → Reset Password Page
  if (window.location.pathname.includes('reset-password') && window.location.hash.includes('access_token')) {
    showPasswordResetUI();
  } else {
    // ✅ Attach Events for Login Page Buttons
    document.getElementById('login-btn').addEventListener('click', login);
    document.getElementById('signup-btn').addEventListener('click', signUp);
    document.getElementById('reset-btn').addEventListener('click', resetPasswordRequest);
  }
});

// ✅ 4. LOGIN FUNCTION
async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    document.getElementById('status').innerText = `Error: ${error.message}`;
  } else {
    const token = data.session.access_token;
    localStorage.setItem('slimbuddy_token', token);
    document.getElementById('status').innerText = 'Login successful! Token stored.';
    document.getElementById('copyTokenBtn').style.display = 'block';
    document.getElementById('instructions').style.display = 'block';
    document.getElementById('copyTokenBtn').onclick = () => {
      navigator.clipboard.writeText(token);
      alert('Token copied! Paste it into SlimBuddy GPT when prompted.');
    };
  }
}

// ✅ 5. SIGN-UP FUNCTION
async function signUp() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    document.getElementById('status').innerText = `Error: ${error.message}`;
  } else {
    document.getElementById('status').innerText = 'Sign-up successful! Check your email.';
  }
}

// ✅ 6. RESET PASSWORD REQUEST FUNCTION
async function resetPasswordRequest() {
  const email = document.getElementById('email').value;
  if (!email) {
    alert('Please enter your email to reset the password.');
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://yourslimbuddy.netlify.app/reset-password',
  });

  if (error) {
    document.getElementById('status').innerText = `Error: ${error.message}`;
  } else {
    document.getElementById('status').innerText = 'Password reset email sent! Check your inbox.';
  }
}

// ✅ 7. SHOW RESET PASSWORD UI
function showPasswordResetUI() {
  document.body.innerHTML = `
    <h2>Reset Your Password</h2>
    <input type="password" id="new-password" placeholder="Enter New Password">
    <button id="update-password-btn">Update Password</button>
    <p id="status"></p>
  `;

  document.getElementById('update-password-btn').addEventListener('click', updatePassword);
}

// ✅ 8. UPDATE PASSWORD FUNCTION
async function updatePassword() {
  const newPassword = document.getElementById('new-password').value;
  if (!newPassword) {
    alert('Please enter a new password.');
    return;
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    document.getElementById('status').innerText = `Error: ${error.message}`;
  } else {
    document.getElementById('status').innerText = 'Password updated successfully! You can now log in.';
  }
}
