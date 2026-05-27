import { Clock, MapPinOff, Wallet } from "lucide-react";

const points = [
  {
    icon: Clock,
    title: "17 hours wasted per year",
    body: "Drivers spend almost a full day every year just circling the block looking for a spot.",
  },
  {
    icon: MapPinOff,
    title: "Outdated and incomplete tools",
    body: "Existing apps focus on garages or paid lots — not the curbside spots most people actually need.",
  },
  {
    icon: Wallet,
    title: "Hidden cost of frustration",
    body: "Missed appointments, unnecessary fuel, and the daily stress of city driving.",
  },
];

export function Problem() {
  return (
    <section className="border-y border-slate-100 bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-brand-700">
            The problem
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Finding parking shouldn&apos;t be a treasure hunt
          </h2>
          <p className="mt-4 text-base text-slate-600 sm:text-lg">
            City driving is hard enough. Parking is the last mile that
            everyone still gets wrong.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-3">
          {points.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-slate-200 bg-white p-6"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <p.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-base font-medium text-slate-900">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
