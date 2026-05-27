export function About() {
  return (
    <section
      id="about"
      className="border-t border-slate-100 bg-white"
    >
      <div className="mx-auto max-w-4xl px-6 py-20 sm:py-24">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-brand-700">
            About
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Built for drivers, by drivers
          </h2>
        </div>

        <div className="mx-auto mt-10 max-w-2xl space-y-5 text-center text-base leading-relaxed text-slate-600 sm:text-lg">
          <p>
            We&apos;re a small team that got tired of circling for parking.
            Existing tools either forced us into expensive garages or showed
            stale, unreliable data.
          </p>
          <p>
            Smart Parking is our attempt at fixing that — a focused, real-time
            tool for street parking. Starting in San Francisco, growing from
            there.
          </p>
        </div>
      </div>
    </section>
  );
}
