/**
 * Public user profile (stored in the profiles table, linked to auth.users).
 * Matches: public.profiles table columns exactly.
 *
 * IMPORTANT: This file is the single source of truth for the user model.
 * The Supabase database schema must stay aligned with this type.
 */
export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}
