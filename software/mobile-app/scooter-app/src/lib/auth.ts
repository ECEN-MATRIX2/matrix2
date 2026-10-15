import { supabase } from './supabase';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

function resolveEmailFromIdentifier(identifier: string): string {
  const normalized = identifier.trim().toLowerCase();
  if (normalized.includes('@')) {
    return normalized;
  }

  const username = normalized.replace(/[^a-z0-9._-]/g, '');
  if (!username) {
    throw new Error('Enter a valid email or username');
  }
  return `${username}@test.local`;
}

export async function signUp(identifier: string, password: string) {
  const email = resolveEmailFromIdentifier(identifier);
  const result = await supabase.auth.signUp({ email, password });
  await ensureProfileForCurrentUser();
  return result;
}

export async function signIn(identifier: string, password: string) {
  const email = resolveEmailFromIdentifier(identifier);
  const result = await supabase.auth.signInWithPassword({ email, password });
  await ensureProfileForCurrentUser();
  return result;
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function signInWithGoogle() {
  const redirectTo = makeRedirectUri({
    scheme: 'matrix2',
    path: 'auth/callback',
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    return { error };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    return { error: new Error('Google sign-in cancelled') };
  }

  const callbackUrl = new URL(result.url);
  const code = callbackUrl.searchParams.get('code');
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
      code
    );
    if (exchangeError) {
      return { error: exchangeError };
    }
  }

  await ensureProfileForCurrentUser();
  return { error: null };
}

export async function ensureProfileForCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
    });
  }
}
