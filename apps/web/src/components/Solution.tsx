import { Check } from "lucide-react";

const bullets = [
  "Live availability for street parking, not just garages",
  "Search by location, type, price, or time limit",
  "Tap any spot for one-click directions to it",
  "Community reports keep data fresh in real time",
];

export function Solution() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-brand-700">
            The solution
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            One app, every nearby spot
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
            Smart Parking connects you to live availability data for street
            parking. See which spots are open, where they are, and how much
            they cost — all in one place.
          </p>

          <ul className="mt-8 space-y-3">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                <span className="text-sm text-slate-700">{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm sm:p-10">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Nearby
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  Live
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <SpotRow street="Market St" status="available" price="$3.50/hr" />
                <SpotRow street="Howard St" status="available" price="Free" />
                <SpotRow street="Mission St" status="occupied" price="$2.00/hr" />
                <SpotRow street="Folsom St" status="available" price="$2.50/hr" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SpotRow({
  street,
  status,
  price,
}: {
  street: string;
  status: "available" | "occupied";
  price: string;
}) {
  const isAvailable = status === "available";
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3">
      <div>
        <p className="text-sm font-medium text-slate-900">{street}</p>
        <p className="text-xs text-slate-500">San Francisco, CA</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500">{price}</span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            isAvailable
              ? "bg-brand-50 text-brand-700"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          {isAvailable ? "Available" : "Occupied"}
        </span>
      </div>
    </div>
  );
}
