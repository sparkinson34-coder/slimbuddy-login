import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Handle Login
async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    document.getElementById('status').innerText = `Error: ${error.message}`;
  } else {
    const token = data.session.access_token;
    localStorage.setItem('slimbuddy_token', token);
    document.getElementById('status').innerText = "Login successful! Token stored.";
    document.getElementById('copyTokenBtn').style.display = 'block';
  }
}

// Handle Sign Up
async function signUp() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    document.getElementById('status').innerText = `Error: ${error.message}`;
  } else {
    document.getElementById('status').innerText = "Sign-up successful! Check your email to confirm.";
  }
}

// Handle Password Reset
async function resetPassword() {
  const email = document.getElementById('email').value;
  if (!email) {
    alert("Please enter your email to reset password.");
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: "https://yourslimbuddy.netlify.app/reset-password"
  });

  if (error) {
    document.getElementById('status').innerText = `Error: ${error.message}`;
  } else {
    document.getElementById('status').innerText = "Password reset email sent! Check your inbox.";
  }
}

// Copy Token
function copyToken() {
  const token = localStorage.getItem('slimbuddy_token');
  navigator.clipboard.writeText(token);
  alert('Token copied! Paste it into SlimBuddy GPT.');
}

// Attach event listeners
document.getElementById('login-btn').addEventListener('click', login);
document.getElementById('signup-btn').addEventListener('click', signUp);
document.getElementById('reset-btn').addEventListener('click', resetPassword);
document.getElementById('copyTokenBtn').addEventListener('click', copyToken);
