"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Filter as FilterIcon, X, Navigation } from "lucide-react";

type Status = "Available" | "Occupied" | "Unknown";
type ParkingType = "METERED" | "FREE";

type Spot = {
  id: number;
  street: string;
  address: string;
  status: Status;
  price: string;
  timeLimit?: string;
  parking_type: ParkingType;
};

type FilterKey = "ALL" | "AVAILABLE" | "OCCUPIED" | "METERED";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "AVAILABLE", label: "Available" },
  { key: "OCCUPIED", label: "Occupied" },
  { key: "METERED", label: "Metered" },
];

const initialSpots: Spot[] = [
  { id: 1, street: "Market St", address: "100 Market St", status: "Available", price: "$3.50/hr", timeLimit: "2 hours", parking_type: "METERED" },
  { id: 2, street: "Howard St", address: "500 Howard St", status: "Available", price: "Free", parking_type: "FREE" },
  { id: 3, street: "Mission St", address: "2400 Mission St", status: "Occupied", price: "$2.00/hr", timeLimit: "1 hour", parking_type: "METERED" },
  { id: 4, street: "Folsom St", address: "700 Folsom St", status: "Available", price: "$2.50/hr", timeLimit: "4 hours", parking_type: "METERED" },
];

type ReportTap = "Available" | "Occupied" | "Unknown" | null;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function PhoneDemo() {
  const [spots, setSpots] = useState<Spot[]>(initialSpots);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [pulseId, setPulseId] = useState<number | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [reportTap, setReportTap] = useState<ReportTap>(null);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [showDirections, setShowDirections] = useState(false);
  const selectedRef = useRef<Spot | null>(null);

  selectedRef.current = selectedSpot;

  // Background: status flips on non-selected spots only.
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setSpots((prev) => {
        const next = [...prev];
        for (let j = 0; j < next.length; j++) {
          const idx = (i + j) % next.length;
          if (selectedRef.current && next[idx].id === selectedRef.current.id) continue;
          const target = next[idx];
          next[idx] = {
            ...target,
            status: target.status === "Available" ? "Occupied" : "Available",
          };
          setPulseId(target.id);
          i = idx + 1;
          break;
        }
        return next;
      });
    }, 4200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (pulseId === null) return;
    const t = setTimeout(() => setPulseId(null), 700);
    return () => clearTimeout(t);
  }, [pulseId]);

  // Master tour loop
  useEffect(() => {
    let cancelled = false;

    async function tour() {
      while (!cancelled) {
        for (const f of FILTERS) {
          if (cancelled) return;
          setFilter(f.key);
          await sleep(2600);
        }
        if (cancelled) return;

        setFilter("ALL");
        await sleep(400);
        setSpots((prev) => {
          const candidate = prev.find((s) => s.status === "Available") ?? prev[0];
          setSelectedSpot(candidate);
          return prev;
        });
        await sleep(2400);

        if (cancelled) return;
        setReportTap("Available");
        await sleep(900);
        setReportSuccess(true);
        await sleep(1500);
        setReportTap(null);
        setReportSuccess(false);

        if (cancelled) return;
        setShowDirections(true);
        await sleep(1800);
        setShowDirections(false);

        await sleep(700);
        setSelectedSpot(null);
        await sleep(800);
      }
    }

    tour();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSpots = useMemo(() => {
    if (filter === "ALL") return spots;
    if (filter === "AVAILABLE") return spots.filter((s) => s.status === "Available");
    if (filter === "OCCUPIED") return spots.filter((s) => s.status === "Occupied");
    if (filter === "METERED") return spots.filter((s) => s.parking_type === "METERED");
    return spots;
  }, [spots, filter]);

  useEffect(() => {
    if (!selectedSpot) return;
    const fresh = spots.find((s) => s.id === selectedSpot.id);
    if (fresh && fresh.status !== selectedSpot.status) {
      setSelectedSpot(fresh);
    }
  }, [spots, selectedSpot]);

  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="relative overflow-hidden rounded-[2.5rem] border-8 border-slate-900 bg-white shadow-2xl">
        {/* Directions toast */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-2 z-30 mx-auto flex w-fit items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-lg transition-all duration-300 ${
            showDirections
              ? "translate-y-0 opacity-100"
              : "-translate-y-4 opacity-0"
          }`}
        >
          <Navigation className="h-3.5 w-3.5" />
          Opening Apple Maps...
        </div>

        <div className="relative bg-white px-6 pt-8 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold tracking-tight text-slate-900">
                Smart Parking
              </h3>
              <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                {filteredSpots.length} spots shown
                <span className="inline-flex items-center gap-1 text-brand-700">
                  <span className="relative inline-flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-500" />
                  </span>
                  Live
                </span>
              </p>
            </div>
            <button className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
              Profile
            </button>
          </div>

          <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <FilterIcon className="h-4 w-4 text-slate-400" />
            <span className="text-sm text-slate-400">
              Search street or address...
            </span>
          </div>

          <div className="mt-4 flex gap-2 overflow-hidden">
            {FILTERS.map((f) => (
              <Chip key={f.key} active={f.key === filter}>
                {f.label}
              </Chip>
            ))}
          </div>

          <div className="mt-5 min-h-[210px] space-y-2.5">
            {filteredSpots.length > 0 ? (
              filteredSpots.map((s) => (
                <SpotCard
                  key={s.id}
                  spot={s}
                  pulse={pulseId === s.id}
                  active={selectedSpot?.id === s.id}
                />
              ))
            ) : (
              <div className="flex h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center">
                <p className="text-sm font-medium text-slate-700">
                  No spots match this filter
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Try a different one
                </p>
              </div>
            )}
          </div>

          <div
            className={`pointer-events-none absolute inset-x-3 bottom-3 z-20 transition-all duration-500 ${
              selectedSpot
                ? "translate-y-0 opacity-100"
                : "translate-y-full opacity-0"
            }`}
          >
            {selectedSpot && (
              <DetailCard
                spot={selectedSpot}
                reportTap={reportTap}
                reportSuccess={reportSuccess}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-300 ${
        active
          ? "bg-slate-900 text-white"
          : "border border-slate-200 bg-white text-slate-600"
      }`}
    >
      {children}
    </span>
  );
}

function SpotCard({
  spot,
  pulse,
  active,
}: {
  spot: Spot;
  pulse: boolean;
  active: boolean;
}) {
  const isAvailable = spot.status === "Available";
  return (
    <div
      className={`rounded-xl border bg-white p-3 transition-all duration-300 ${
        pulse
          ? "border-brand-300 ring-2 ring-brand-500/20"
          : active
            ? "border-slate-900 ring-1 ring-slate-900/10"
            : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin
            className={`h-4 w-4 transition-colors ${
              isAvailable ? "text-brand-600" : "text-rose-500"
            }`}
          />
          <p className="text-sm font-medium text-slate-900">{spot.street}</p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
            isAvailable
              ? "bg-brand-50 text-brand-700"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          {spot.status}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
        <span>{spot.address}</span>
        <span>{spot.price}</span>
      </div>
    </div>
  );
}

function DetailCard({
  spot,
  reportTap,
  reportSuccess,
}: {
  spot: Spot;
  reportTap: ReportTap;
  reportSuccess: boolean;
}) {
  const isAvailable = spot.status === "Available";
  return (
    <div className="rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-900/5">
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold text-slate-900">{spot.street}</p>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <X className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{spot.address}</p>

      <div className="mt-2.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${
            isAvailable
              ? "bg-brand-50 text-brand-700"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isAvailable ? "bg-brand-500" : "bg-rose-500"
            }`}
          />
          {spot.status}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <DetailChip>{spot.parking_type === "METERED" ? "Metered" : "Free"}</DetailChip>
        <DetailChip>{spot.price}</DetailChip>
        {spot.timeLimit && <DetailChip>{spot.timeLimit}</DetailChip>}
      </div>

      <p className="mt-2 text-[10px] text-slate-400">Updated just now</p>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Report status
        </p>
        <div className="mt-2 flex gap-1.5">
          <ReportButton label="Available" color="green" tapped={reportTap === "Available"} />
          <ReportButton label="Occupied" color="red" tapped={reportTap === "Occupied"} />
          <ReportButton label="Unknown" color="gray" tapped={reportTap === "Unknown"} />
        </div>
        {reportSuccess && (
          <p className="mt-2 text-[10px] font-medium text-brand-700">
            Report submitted!
          </p>
        )}
      </div>

      <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-medium text-white">
        <Navigation className="h-3.5 w-3.5" />
        Get Directions
      </button>
    </div>
  );
}

function DetailChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
      {children}
    </span>
  );
}

function ReportButton({
  label,
  color,
  tapped,
}: {
  label: string;
  color: "green" | "red" | "gray";
  tapped: boolean;
}) {
  const palette = {
    green: { base: "bg-green-100 text-green-800", active: "bg-green-200 ring-2 ring-green-400" },
    red: { base: "bg-rose-100 text-rose-800", active: "bg-rose-200 ring-2 ring-rose-400" },
    gray: { base: "bg-slate-100 text-slate-700", active: "bg-slate-200 ring-2 ring-slate-400" },
  }[color];

  return (
    <span
      className={`flex-1 rounded-lg px-2 py-1.5 text-center text-[10px] font-semibold transition-all duration-200 ${
        tapped ? palette.active : palette.base
      }`}
    >
      {label}
    </span>
  );
}
