import Link from 'next/link';
import { formatCents, DEPOSIT_PER_CONTAINER_CENTS } from '@/lib/constants';
import { getActiveSubscriptionPlans } from '@/lib/catalog';

export const revalidate = 60;

export default async function HomePage() {
  const plans = await getActiveSubscriptionPlans();
  return (
    <>
      <section className="relative overflow-hidden border-b border-brand-plum/10 bg-[#fffdf9]">
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-brand-gold/10 blur-3xl" aria-hidden />
        <div className="absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-brand-plum/10 blur-3xl" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.04fr_.96fr] lg:py-24">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-moss-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-moss-700 ring-1 ring-moss-600/15"><span className="h-2 w-2 rounded-full bg-moss-500" aria-hidden /> Rooted in community. Grown with love.</p>
            <h1 className="mt-6 font-display text-[2.55rem] font-bold leading-[1.04] tracking-[-0.035em] text-brand-plum sm:text-5xl lg:text-[3.65rem]">Southern cooking made with care, delivered to your table.</h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-ink/70 sm:text-lg sm:leading-8">Chef Netta prepares a fresh menu each week, then delivers it across North Carolina in reusable glass containers—comforting food with less waste.</p>
            <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row"><Link href="/menu" className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand-plum px-7 py-3.5 font-bold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-[#542043] hover:shadow-lift">Explore this week&apos;s menu</Link><Link href="/how-it-works" className="inline-flex min-h-12 items-center justify-center rounded-full border border-brand-plum/20 bg-white px-7 py-3.5 font-bold text-brand-plum transition hover:bg-brand-plum/5">See how it works</Link></div>
            <div className="mt-9 grid max-w-xl grid-cols-3 gap-3 border-t border-brand-plum/10 pt-6 text-sm"><TrustPoint title="Chef-made" body="Fresh weekly" /><TrustPoint title="NC delivery" body="Made locally" /><TrustPoint title="Glass-first" body="Return & reuse" /></div>
          </div>
          <div className="relative mx-auto w-full max-w-xl lg:mx-0">
            <div className="absolute -left-5 -top-5 h-full w-full rounded-[2rem] border border-brand-gold/30" aria-hidden />
            <div className="relative flex aspect-[4/4.25] min-h-[360px] flex-col justify-end overflow-hidden rounded-[2rem] bg-brand-plum p-6 text-white shadow-lift sm:p-8">
              <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_20%_20%,rgba(255,255,255,.22)_0_1px,transparent_1.5px)] [background-size:18px_18px]" aria-hidden />
              <div className="absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(circle_at_55%_25%,rgba(168,139,67,.55),transparent_42%),radial-gradient(circle_at_20%_70%,rgba(203,84,57,.45),transparent_35%)]" aria-hidden />
              <div className="relative max-w-sm rounded-panel border border-white/20 bg-black/20 p-5 backdrop-blur-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#eadcae]">A note from the kitchen</p><p className="mt-3 font-brand text-3xl leading-tight">Food should nourish more than the moment.</p><p className="mt-3 text-sm leading-6 text-white/80">Cooked with intention, packed with care, and connected to the community we call home.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center"><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-brick">Simple from start to finish</p><h2 className="mt-3 font-display text-3xl font-bold text-brand-plum sm:text-4xl">Good food, with a lighter footprint</h2></div>
        <div className="mt-12 grid gap-5 md:grid-cols-3"><Step n="01" title="Choose your meals" body="Browse the fresh weekly menu and choose a subscription or build a one-time box." /><Step n="02" title="We deliver in glass" body={`Meals arrive in reusable containers. A refundable ${formatCents(DEPOSIT_PER_CONTAINER_CENTS)} deposit keeps the loop turning.`} /><Step n="03" title="Send the glass back" body="Rinse the empties and leave them out on your next delivery day." /></div>
      </section>

      <section className="border-y border-brand-plum/10 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">Made for your week</p><h2 className="mt-3 font-display text-3xl font-bold text-brand-plum sm:text-4xl">Weekly meal plans</h2><p className="mt-3 text-ink/65">Choose the rhythm that fits your table. Skip, pause, or cancel any week.</p></div><Link href="/menu" className="text-sm font-bold text-brand-plum underline decoration-brand-gold/60 decoration-2">View this week&apos;s dishes</Link></div>
          <div className="mt-9 grid gap-5 md:grid-cols-3">
            {plans.map((plan, index) => <div key={plan.id} className={`relative flex flex-col rounded-panel border p-6 transition hover:-translate-y-1 hover:shadow-lift sm:p-7 ${index === 1 ? 'border-brand-gold/50 bg-[#fffcf4]' : 'border-brand-plum/10 bg-cream/50'}`}>{index === 1 && <span className="mb-4 self-start rounded-full bg-brand-gold/15 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wider text-[#725d28] md:absolute md:right-5 md:top-5">A generous week</span>}<div className="font-display text-2xl font-bold text-brand-plum">{plan.name}</div><div className="mt-5 flex items-end gap-1 text-brand-plum"><span className="text-4xl font-bold tracking-tight">{formatCents(plan.price_cents)}</span><span className="pb-1 text-sm text-ink/55">/ {plan.billing_interval}</span></div><p className="mt-2 text-sm text-ink/55">{formatCents(Math.round(plan.price_cents / plan.included_credits))} per meal</p><p className="mt-3 min-h-10 text-sm leading-6 text-ink/65">{plan.blurb}</p><Link href="/menu" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-brand-plum px-5 py-3 text-sm font-bold text-white transition hover:bg-[#542043]">Choose {plan.included_credits} meals</Link></div>)}
          </div>
        </div>
      </section>
      <section className="bg-moss-50/70"><div className="mx-auto flex max-w-5xl flex-col items-center gap-5 px-4 py-12 text-center sm:px-6"><p className="font-brand text-3xl text-brand-plum sm:text-4xl">Rooted here. Made with intention.</p><p className="max-w-2xl leading-7 text-ink/65">Netta&apos;s Pantry brings the care and hospitality of Your Southern Foodie into an easier weekly ordering experience.</p><a href="https://yoursouthernfoodie.com/" className="text-sm font-bold text-brand-plum underline decoration-brand-gold/60 decoration-2">Meet Your Southern Foodie</a></div></section>
    </>
  );
}

function TrustPoint({ title, body }: { title: string; body: string }) { return <div><div className="font-bold text-brand-plum">{title}</div><div className="mt-1 text-xs text-ink/55">{body}</div></div>; }
function Step({ n, title, body }: { n: string; title: string; body: string }) { return <div className="rounded-panel border border-brand-plum/10 bg-white p-6 shadow-soft sm:p-7"><div className="text-xs font-bold tracking-[0.18em] text-brand-gold">{n}</div><h3 className="mt-5 font-display text-xl font-bold text-brand-plum">{title}</h3><p className="mt-3 text-sm leading-7 text-ink/65">{body}</p></div>; }
