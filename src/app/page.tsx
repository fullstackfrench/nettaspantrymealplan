import Link from 'next/link';
import { PLANS, formatCents, DEPOSIT_PER_CONTAINER_CENTS } from '@/lib/constants';

export default function HomePage() {
  return (
    <>
      <section className="border-b border-black/10 bg-white">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 py-20 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-moss-600">
              Rooted in community. Grown with love.
            </p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight md:text-5xl">
              Southern cooking, delivered across North Carolina — in glass, not plastic.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-black/60">
              Chef Netta cooks a fresh menu every week. Your meals arrive in reusable glass
              containers. Eat, rinse, and hand the empties back on your next delivery.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/menu"
                className="rounded-full bg-ink px-7 py-3.5 font-semibold text-white hover:bg-black"
              >
                See this week&apos;s menu
              </Link>
              <Link
                href="/how-it-works"
                className="rounded-full px-7 py-3.5 font-semibold ring-1 ring-black/20 hover:bg-black/5"
              >
                How it works
              </Link>
            </div>
          </div>

          <div className="aspect-square rounded-3xl bg-gradient-to-br from-moss-100 to-clay-100" />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <h2 className="text-center font-display text-3xl font-bold">Zero-waste by design</h2>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          <Step
            n="1"
            title="Choose your meals"
            body="Browse the weekly menu and filter by what you eat. Subscribe for the best price or order a one-time box."
          />
          <Step
            n="2"
            title="We deliver in glass"
            body={`Meals arrive chilled in reusable glass containers. A refundable ${formatCents(
              DEPOSIT_PER_CONTAINER_CENTS
            )} deposit per container keeps the loop turning.`}
          />
          <Step
            n="3"
            title="Send the glass back"
            body="Rinse the empties and leave them out on your next delivery day. Your deposit is refunded or credited automatically."
          />
        </div>
      </section>

      <section className="border-t border-black/10 bg-white py-20">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-center font-display text-3xl font-bold">Weekly plans</h2>
          <p className="mt-3 text-center text-black/60">
            Skip, pause, or cancel any week.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PLANS.map((p) => (
              <div key={p.size} className="rounded-2xl p-8 ring-1 ring-black/10">
                <div className="font-display text-2xl font-bold">{p.label}</div>
                <div className="mt-2 text-3xl font-bold">
                  {formatCents(p.subscriptionPriceCents)}
                  <span className="text-base font-normal text-black/50"> / meal</span>
                </div>
                <p className="mt-2 text-sm text-moss-600">{p.blurb}</p>
                <Link
                  href="/menu"
                  className="mt-6 block rounded-full bg-ink px-5 py-3 text-center text-sm font-semibold text-white hover:bg-black"
                >
                  Choose {p.size} meals
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-moss-600 font-display text-lg font-bold text-white">
        {n}
      </div>
      <h3 className="mt-5 font-display text-xl font-bold">{title}</h3>
      <p className="mt-2 leading-relaxed text-black/60">{body}</p>
    </div>
  );
}
