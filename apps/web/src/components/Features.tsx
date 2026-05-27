import {
  Radio,
  Search,
  Navigation,
  MessageSquare,
  Smartphone,
  Lock,
} from "lucide-react";

const features = [
  {
    icon: Radio,
    title: "Realtime availability",
    body: "Live updates over a websocket connection. No manual refresh — spots change as they happen.",
  },
  {
    icon: Search,
    title: "Search & filter",
    body: "Find spots by street, status, parking type, price, or time limit. Quickly narrow down your options.",
  },
  {
    icon: Navigation,
    title: "One-tap directions",
    body: "Open Apple Maps or Google Maps with one tap and start navigating to your spot.",
  },
  {
    icon: MessageSquare,
    title: "Community reports",
    body: "Mark a spot as available, occupied, or unsure. Help others find parking faster.",
  },
  {
    icon: Smartphone,
    title: "Native iOS & Android",
    body: "Built with React Native for a smooth, responsive feel on both platforms.",
  },
  {
    icon: Lock,
    title: "Private by design",
    body: "Your account is protected by row-level security. We only see what you choose to share.",
  },
];

export function Features() {
  return (
    <section
      id="features"
      className="border-y border-slate-100 bg-slate-50"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-brand-700">
            Features
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Everything you need, nothing you don&apos;t
          </h2>
          <p className="mt-4 text-base text-slate-600 sm:text-lg">
            Designed to be the fastest way to find a parking spot in the city.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-slate-300"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-base font-medium text-slate-900">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
