import { PhoneDemo } from "./PhoneDemo";

export function DemoPreview() {
  return (
    <section id="demo" className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-brand-700">
          Demo preview
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Real data, real spots, today
        </h2>
        <p className="mt-4 text-base text-slate-600 sm:text-lg">
          A guided tour of the mobile app — search, filter, view spot details,
          report status, and get directions. Interactive preview with sample
          data (live app uses Supabase).
        </p>
      </div>

      <div className="mx-auto mt-14 max-w-4xl">
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-8 shadow-sm sm:p-12">
          <PhoneDemo />
        </div>
      </div>
    </section>
  );
}
