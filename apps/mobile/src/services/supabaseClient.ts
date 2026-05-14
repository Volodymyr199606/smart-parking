import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ENV } from "../constants/env";

/**
 * Supabase client instance for the mobile app.
 *
 * Uses AsyncStorage to persist auth sessions across app restarts.
 * The anon key is safe to include in client-side code — Row Level Security
 * on the database ensures users can only access their authorized data.
 */
export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
