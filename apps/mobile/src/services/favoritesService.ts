import { supabase } from "./supabaseClient";
import type { FavoriteParkingSpot } from "../shared";

/**
 * Favorites service — save/unsave parking_spots for the logged-in user.
 * Requires migration 00008_favorite_parking_spots.sql applied.
 */

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("You must be logged in to manage favorites.");

  return user.id;
}

/** Fetch all favorites for the current user. Returns [] when not logged in. */
export async function getFavorites(): Promise<FavoriteParkingSpot[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) return [];

  const { data, error } = await supabase
    .from("favorite_parking_spots")
    .select("id, user_id, parking_spot_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as FavoriteParkingSpot[];
}

/** Save a parking spot to the current user's favorites. */
export async function addFavorite(parkingSpotId: string): Promise<void> {
  const userId = await requireUserId();

  const { error } = await supabase.from("favorite_parking_spots").insert({
    user_id: userId,
    parking_spot_id: parkingSpotId,
  });

  if (error) throw error;
}

/** Remove a parking spot from the current user's favorites. */
export async function removeFavorite(parkingSpotId: string): Promise<void> {
  const userId = await requireUserId();

  const { error } = await supabase
    .from("favorite_parking_spots")
    .delete()
    .eq("user_id", userId)
    .eq("parking_spot_id", parkingSpotId);

  if (error) throw error;
}

/** Check whether a spot is favorited by the current user. */
export async function isFavorite(parkingSpotId: string): Promise<boolean> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) return false;

  const { data, error } = await supabase
    .from("favorite_parking_spots")
    .select("id")
    .eq("user_id", user.id)
    .eq("parking_spot_id", parkingSpotId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}
