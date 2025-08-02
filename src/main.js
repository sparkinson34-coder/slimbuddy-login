import { createClient } from '@supabase/supabase-js';

// Load environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create Supabase client
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ✅ Login function
window.login = async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    document.getElementById('status').innerText = `Error: ${error.message}`;
  } else {
    const token = data.session.access_token;
    localStorage.setItem('slimbuddy_token', token);
    document.getElementById('status').innerText = "Login successful! Token stored.";
    document.getElementById('copyTokenBtn').style.display = 'block';
  }
};

// ✅ Sign-up function
window.signUp = async function signUp() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { data, error } = await supabaseClient.auth.signUp({ email, password });

  if (error) {
    document.getElementById('status').innerText = `Error: ${error.message}`;
  } else {
    document.getElementById('status').innerText = "Sign-up successful! Check your email to confirm your account.";
  }
};

// ✅ Reset password function
window.resetPassword = async function resetPassword() {
  const email = document.getElementById('email').value;
  if (!email) {
    alert("Please enter your email to reset the password.");
    return;
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: "https://yourslimbuddy.netlify.app/reset-password"
  });

  if (error) {
    document.getElementById('status').innerText = `Error: ${error.message}`;
  } else {
    document.getElementById('status').innerText = "Password reset email sent! Check your inbox.";
  }
};

// ✅ Copy token function
window.copyToken = function copyToken() {
  const token = localStorage.getItem('slimbuddy_token');
  navigator.clipboard.writeText(token);
  alert('Token copied! Paste it into SlimBuddy GPT when prompted.');
};
