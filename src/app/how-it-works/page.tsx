import Link from 'next/link';
import { DEPOSIT_PER_CONTAINER_CENTS, formatCents } from '@/lib/constants';

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="rounded-[1.5rem] border border-brand-plum/10 bg-white p-6 shadow-soft sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">From kitchen to doorstep</p>
        <h1 className="mt-3 font-display text-4xl font-bold text-brand-plum sm:text-5xl">How it works</h1>
        <p className="mt-4 max-w-2xl leading-7 text-ink/65">A simple weekly rhythm built around fresh food, reusable glass, and the care you expect from Chef Netta.</p>
      </div>

      <div className="mt-8 grid gap-5">
      <Section n="01" title="The glass, explained">
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

      <Section n="02" title="Delivery">
        <p>
          We deliver across North Carolina. Meals arrive chilled, not frozen, and keep in the
          fridge for up to five days. Reheat in the oven or microwave right in the container.
        </p>
      </Section>

      <Section n="03" title="Subscriptions vs. one-time boxes">
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
      </div>

      <Link
        href="/menu"
        className="mt-8 inline-flex min-h-12 items-center rounded-full bg-brand-plum px-7 py-3.5 font-bold text-white shadow-soft transition hover:bg-[#542043]"
      >
        See this week&apos;s menu
      </Link>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="admin-card p-6 sm:p-8">
      <div className="text-xs font-bold tracking-[0.18em] text-brand-gold">{n}</div>
      <h2 className="mt-3 font-display text-2xl font-bold text-brand-plum">{title}</h2>
      <div className="mt-4 space-y-4 leading-7 text-ink/70">{children}</div>
    </section>
  );
}
