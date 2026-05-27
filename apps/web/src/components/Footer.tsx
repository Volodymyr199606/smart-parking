import { MapPin } from "lucide-react";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-100 bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-white">
              <MapPin className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-medium text-slate-900">
              Smart Parking
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500">
            <a href="#features" className="hover:text-slate-900">
              Features
            </a>
            <a href="#demo" className="hover:text-slate-900">
              Demo
            </a>
            <a href="#waitlist" className="hover:text-slate-900">
              Waitlist
            </a>
            <a href="#about" className="hover:text-slate-900">
              About
            </a>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-200 pt-6 text-xs text-slate-500">
          © {year} Smart Parking. Built with Next.js and Supabase.
        </div>
      </div>
    </footer>
  );
}
