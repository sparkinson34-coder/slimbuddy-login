import { createClient } from '@supabase/supabase-js';

// ✅ Load environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ✅ Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ✅ Event Listener
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-btn').addEventListener('click', login);
  document.getElementById('signup-btn').addEventListener('click', signUp);
  document.getElementById('reset-btn').addEventListener('click', resetPassword);
});

// ✅ Login function
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
    document.getElementById('copyTokenBtn').onclick = () => {
      navigator.clipboard.writeText(token);
      alert('Token copied! Paste it into SlimBuddy GPT when prompted.');
    };
  }
}

// ✅ Sign-up function
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

// ✅ Reset Password function
async function resetPassword() {
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
    document.getElementById('status').innerText =
      'Password reset email sent! Check your inbox.';
  }
}

// ✅ Copy token function
window.copyToken = function copyToken() {
  const token = localStorage.getItem('slimbuddy_token');
  navigator.clipboard.writeText(token);
  alert('Token copied! Paste it into SlimBuddy GPT when prompted.');
};