import Link from "next/link";
import { MapPin } from "lucide-react";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <MapPin className="h-4 w-4" />
          </span>
          <span className="text-base font-medium tracking-tight text-slate-900">
            Smart Parking
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-slate-600 hover:text-slate-900">
            Features
          </a>
          <a href="#demo" className="text-sm text-slate-600 hover:text-slate-900">
            Demo
          </a>
          <a href="#pricing" className="text-sm text-slate-600 hover:text-slate-900">
            Pricing
          </a>
          <a href="#about" className="text-sm text-slate-600 hover:text-slate-900">
            About
          </a>
        </nav>

        <a
          href="#waitlist"
          className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          Join waitlist
        </a>
      </div>
    </header>
  );
}
