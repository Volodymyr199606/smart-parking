/**
 * Environment variables for the mobile app.
 *
 * Expo automatically loads variables prefixed with EXPO_PUBLIC_ from .env files.
 * Access them via process.env.EXPO_PUBLIC_*.
 *
 * Required:
 *   EXPO_PUBLIC_SUPABASE_URL      — Your Supabase project URL
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY — Your Supabase anonymous (public) key
 */

export const ENV = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
} as const;
