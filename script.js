import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Handle Sign Up
async function signUp() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    alert(`Error: ${error.message}`);
  } else {
    alert('Sign-up successful! Check your email to confirm.');
  }
}

// Handle Login
async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    alert(`Error: ${error.message}`);
  } else {
    alert('Login successful! Copy your token below:');
    alert(data.session.access_token);
  }
}

// Attach to buttons
document.getElementById('signup-btn').addEventListener('click', signUp);
document.getElementById('login-btn').addEventListener('click', login);
