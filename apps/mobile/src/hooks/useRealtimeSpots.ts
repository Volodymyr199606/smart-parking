import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../services/supabaseClient";
import type { ParkingSpot } from "../shared";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type ConnectionStatus = "live" | "reconnecting" | "offline";

interface UseRealtimeSpotsOptions {
  onInsert: (spot: ParkingSpot) => void;
  onUpdate: (spot: ParkingSpot) => void;
  onDelete: (id: string) => void;
}

export function useRealtimeSpots({ onInsert, onUpdate, onDelete }: UseRealtimeSpotsOptions) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("offline");
  const channelRef = useRef<RealtimeChannel | null>(null);

  const callbacksRef = useRef({ onInsert, onUpdate, onDelete });
  callbacksRef.current = { onInsert, onUpdate, onDelete };

  const subscribe = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel("parking_spots_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "parking_spots" },
        (payload) => {
          callbacksRef.current.onInsert(payload.new as ParkingSpot);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "parking_spots" },
        (payload) => {
          callbacksRef.current.onUpdate(payload.new as ParkingSpot);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "parking_spots" },
        (payload) => {
          const old = payload.old as { id?: string };
          if (old.id) callbacksRef.current.onDelete(old.id);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnectionStatus("live");
        } else if (status === "CHANNEL_ERROR") {
          setConnectionStatus("offline");
        } else if (status === "TIMED_OUT") {
          setConnectionStatus("reconnecting");
        } else {
          setConnectionStatus("reconnecting");
        }
      });

    channelRef.current = channel;
  }, []);

  useEffect(() => {
    subscribe();
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [subscribe]);

  return { connectionStatus };
}
