import { supabase } from "./supabaseClient";

/**
 * Authentication service for the mobile app.
 *
 * Uses Supabase Auth for email/password authentication.
 * Sessions are persisted in AsyncStorage automatically.
 *
 * Future additions:
 * - Google OAuth
 * - Apple Sign-In (required for iOS App Store if OAuth is offered)
 * - Password reset via email
 */

/**
 * Create a new user account.
 * Also stores full_name in user metadata, which the database trigger
 * uses to create the profiles row automatically.
 */
export async function signUp(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });

  if (error) throw error;
  return data;
}

/**
 * Sign in an existing user with email and password.
 */
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

/**
 * Sign out the current user and clear the local session.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Get the currently authenticated user, or null if not signed in.
 */
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
