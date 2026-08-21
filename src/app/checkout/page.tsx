'use client';

import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { DEPOSIT_PER_CONTAINER_CENTS, formatCents } from '@/lib/constants';

export default function CheckoutPage() {
  const { lines, remove, totalMeals, mode, selectedPlan, remaining, subtotalCents, depositCents, totalCents } = useCart();

  if (totalMeals === 0) {
    return <div className="mx-auto max-w-2xl px-6 py-24 text-center"><h1 className="font-display text-2xl font-bold">Your order is empty</h1><Link href="/menu" className="mt-6 inline-block rounded-full bg-moss-600 px-6 py-3 text-sm font-semibold text-white">Browse this week&apos;s menu</Link></div>;
  }

  const incomplete = mode === 'subscription' && (!selectedPlan || remaining > 0);

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[1fr_380px]">
      <div>
        <h1 className="font-display text-3xl font-bold">Review your order</h1>
        <p className="mt-2 text-sm text-black/50">Prices shown here are a preview. Payment is not enabled yet.</p>
        <div className="mt-6 divide-y divide-black/10 rounded-2xl bg-white ring-1 ring-black/5">
          {lines.map((line) => (
            <div key={line.id} className="flex items-center gap-4 p-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-cream">
                {line.display.imageUrl ? <img src={line.display.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center">🍲</div>}
              </div>
              <div className="flex-1">
                <div className="font-semibold">{line.display.mealName}</div>
                <div className="text-sm text-black/50">{line.display.sizeLabel} · Feeds {line.display.servings}</div>
                <div className="text-sm text-black/50">
                  {line.quantity} selected
                  {line.kind === 'one_time' && ` × ${formatCents(line.display.unitPriceCents)}`}
                </div>
              </div>
              <button onClick={() => remove(line.id)} className="text-sm text-black/40 hover:text-black">Remove one</button>
            </div>
          ))}
        </div>
      </div>

      <aside className="h-fit rounded-2xl bg-white p-6 ring-1 ring-black/5 lg:sticky lg:top-24">
        <h2 className="font-display text-lg font-bold">{mode === 'subscription' ? selectedPlan?.name ?? 'Weekly subscription' : 'One-time box'}</h2>
        {mode === 'subscription' && selectedPlan && <p className="mt-1 text-xs text-black/50">{formatCents(selectedPlan.priceCents)}/{selectedPlan.billingInterval} · {selectedPlan.includedCredits} meals</p>}
        <dl className="mt-4 space-y-2 text-sm">
          <Row label={mode === 'subscription' ? 'Plan total' : `${totalMeals} meal units`} value={formatCents(subtotalCents)} />
          <Row label={`Container preview (${totalMeals} × ${formatCents(DEPOSIT_PER_CONTAINER_CENTS)})`} value={formatCents(depositCents)} />
          <div className="border-t border-black/10 pt-3"><Row label="Preview total" value={formatCents(totalCents)} bold /></div>
        </dl>
        {incomplete && <p className="mt-4 text-sm text-clay-500">Your subscription plan still needs {remaining} more meal{remaining === 1 ? '' : 's'}.</p>}
        <div className="mt-6 rounded-xl bg-black/5 p-4 text-center text-sm font-semibold text-black/60">Payment checkout is being connected.</div>
        <Link href="/menu" className="mt-4 block text-center text-sm font-semibold underline">Return to menu</Link>
      </aside>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? 'font-bold' : ''}`}><dt className="text-black/60">{label}</dt><dd>{value}</dd></div>;
}
