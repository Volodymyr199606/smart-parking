/**
 * Public user profile (stored in the profiles table, linked to auth.users).
 */
export interface UserProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}
