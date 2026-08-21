import Link from 'next/link';
import { DEPOSIT_PER_CONTAINER_CENTS, formatCents } from '@/lib/constants';

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-4xl font-bold">How it works</h1>

      <Section title="The glass, explained">
        <p>
          Every meal comes in an oven- and dishwasher-safe glass container. Glass keeps food
          tasting like food, and it can be reused hundreds of times instead of thrown away
          once.
        </p>
        <p>
          Because glass costs real money, we hold a refundable deposit of{' '}
          <strong>{formatCents(DEPOSIT_PER_CONTAINER_CENTS)} per container</strong>. It is not
          a fee — you get it back. Return your containers and the deposit is refunded to your
          card or applied as credit toward your next order, whichever you prefer.
        </p>
        <p>
          Subscribers pay the deposit only once. After your first week you are simply swapping
          empties for fulls, so you never hold more than one set.
        </p>
      </Section>

      <Section title="Delivery">
        <p>
          We deliver across North Carolina. Meals arrive chilled, not frozen, and keep in the
          fridge for up to five days. Reheat in the oven or microwave right in the container.
        </p>
      </Section>

      <Section title="Subscriptions vs. one-time boxes">
        <p>
          A weekly subscription gets you the lowest per-meal price and a standing delivery
          slot. You choose your meals each week, and you can skip, pause, or cancel any time
          before the weekly cutoff.
        </p>
        <p>
          Prefer no commitment? Order a one-time box at any size. The deposit works the same
          way — it comes back when the glass does.
        </p>
      </Section>

      <Link
        href="/menu"
        className="mt-10 inline-block rounded-full bg-moss-600 px-7 py-3.5 font-semibold text-white hover:bg-moss-700"
      >
        See this week&apos;s menu
      </Link>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      <div className="mt-3 space-y-4 leading-relaxed text-black/70">{children}</div>
    </section>
  );
}
