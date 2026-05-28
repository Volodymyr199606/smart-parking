"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type Status = "idle" | "submitting" | "success" | "already" | "error";

const POSTGRES_UNIQUE_VIOLATION = "23505";

function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!trimmed.includes("@")) return false;
  if (trimmed.length > 254) return false;
  return true;
}

export function Waitlist() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!isValidEmail(email)) {
      setStatus("error");
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus("error");
      setErrorMessage(
        "Waitlist is temporarily unavailable. Please try again later."
      );
      return;
    }

    setStatus("submitting");

    const { error } = await supabase.from("waitlist_signups").insert({
      full_name: fullName.trim() || null,
      email: email.trim().toLowerCase(),
      interest: interest.trim() || null,
    });

    if (error) {
      if (error.code === POSTGRES_UNIQUE_VIOLATION) {
        setStatus("already");
        return;
      }
      setStatus("error");
      setErrorMessage("Something went wrong. Please try again.");
      return;
    }

    setStatus("success");
  }

  const isDone = status === "success" || status === "already";
  const isSubmitting = status === "submitting";

  return (
    <section id="waitlist" className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
      <div
        id="pricing"
        className="rounded-3xl border border-slate-200 bg-gradient-to-br from-brand-50 to-white p-10 sm:p-16"
      >
        <div className="mx-auto max-w-xl">
          <div className="text-center">
            <p className="text-sm font-medium uppercase tracking-wider text-brand-700">
              Free during early access
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Be first to know when we launch
            </h2>
            <p className="mt-4 text-base text-slate-600 sm:text-lg">
              Smart Parking is in beta. Join the waitlist and we&apos;ll send
              you an invite the moment it&apos;s available in your city.
            </p>
          </div>

          {isDone ? (
            <div className="mt-10 rounded-2xl border border-brand-200 bg-white p-6 text-center">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <Check className="h-5 w-5" strokeWidth={3} />
              </span>
              <p className="mt-4 text-base font-medium text-slate-900">
                {status === "already"
                  ? "You're already on the list"
                  : "You're on the list!"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {status === "already"
                  ? "We have your email and will reach out when access opens."
                  : "We'll be in touch as soon as access opens."}
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="mt-10 space-y-4"
              noValidate
            >
              <Field label="Full name" optional>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  autoComplete="name"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </Field>

              <Field label="Email" required>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </Field>

              <Field label="What interests you most?" optional>
                <textarea
                  value={interest}
                  onChange={(e) => setInterest(e.target.value)}
                  placeholder="Anything specific you're hoping the app does..."
                  rows={3}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </Field>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {isSubmitting ? "Joining..." : "Join waitlist"}
              </button>

              {status === "error" && errorMessage && (
                <p className="text-center text-sm text-rose-600">
                  {errorMessage}
                </p>
              )}

              <p className="text-center text-xs text-slate-500">
                No spam. Unsubscribe anytime.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  optional,
  required,
  children,
}: {
  label: string;
  optional?: boolean;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {optional && (
          <span className="text-xs text-slate-400">Optional</span>
        )}
        {required && (
          <span className="text-xs text-brand-700">Required</span>
        )}
      </span>
      {children}
    </label>
  );
}
