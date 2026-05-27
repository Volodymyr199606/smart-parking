"use client";

import { useState } from "react";
import { Check } from "lucide-react";

type Status = "idle" | "submitting" | "success" | "error";

export function Waitlist() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.includes("@")) {
      setStatus("error");
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setStatus("submitting");
    // Placeholder: simulate network call. Wire up to Supabase or an
    // /api/waitlist route when backend is ready.
    await new Promise((r) => setTimeout(r, 700));
    setStatus("success");
  }

  return (
    <section id="waitlist" className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
      <div
        id="pricing"
        className="rounded-3xl border border-slate-200 bg-gradient-to-br from-brand-50 to-white p-10 sm:p-16"
      >
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-brand-700">
            Free during early access
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Be first to know when we launch
          </h2>
          <p className="mt-4 text-base text-slate-600 sm:text-lg">
            Smart Parking is in beta. Join the waitlist and we&apos;ll send you
            an invite the moment it&apos;s available in your city.
          </p>

          {status === "success" ? (
            <div className="mt-10 inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-medium text-white">
              <Check className="h-4 w-4" />
              You&apos;re on the list. We&apos;ll be in touch.
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="mx-auto mt-10 flex max-w-md flex-col items-stretch gap-2 sm:flex-row"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="flex-1 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
              <button
                type="submit"
                disabled={status === "submitting"}
                className="rounded-full bg-brand-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "submitting" ? "Joining..." : "Join waitlist"}
              </button>
            </form>
          )}

          {errorMessage && status === "error" && (
            <p className="mt-3 text-sm text-rose-600">{errorMessage}</p>
          )}

          <p className="mt-4 text-xs text-slate-500">
            No spam. Unsubscribe anytime.
          </p>
        </div>
      </div>
    </section>
  );
}
