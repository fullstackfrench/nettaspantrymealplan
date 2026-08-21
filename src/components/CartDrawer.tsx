'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '@/lib/cart';
import { formatCents } from '@/lib/constants';

/**
 * Sticky summary bar. Appears once something is in the order, and stays out of
 * the way on the checkout page itself.
 */
export default function CartDrawer() {
  const { totalMeals, subtotalCents, depositCents, mode, remaining, selectedPlan } = useCart();
  const pathname = usePathname();

  if (totalMeals === 0) return null;
  if (pathname?.startsWith('/checkout')) return null;

  const planTotal = mode === 'subscription' && selectedPlan ? selectedPlan.includedCredits : 0;
  const progress = planTotal > 0 ? Math.min(100, (totalMeals / planTotal) * 100) : 0;

  return (
    <>
      <div className="h-32 sm:h-24" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-plum/15 bg-white/95 shadow-[0_-10px_35px_-22px_rgba(104,41,82,.45)] backdrop-blur-md">
        {mode === 'subscription' && <div className="h-1 bg-brand-plum/10" aria-hidden><div className="h-full bg-brand-gold transition-[width]" style={{ width: `${progress}%` }} /></div>}
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2"><span className="font-bold text-brand-plum">{totalMeals} meal{totalMeals === 1 ? '' : 's'}</span><span className="font-semibold text-ink/70">{formatCents(subtotalCents)}</span></div>
            <p className="mt-0.5 truncate text-xs text-ink/55">{mode === 'subscription' && remaining > 0 ? `${remaining} more to fill ${selectedPlan?.name ?? 'your weekly plan'}` : depositCents > 0 ? `Plus ${formatCents(depositCents)} refundable glass deposit` : 'Your order is ready to review'}</p>
          </div>
          <Link href="/checkout" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-brand-plum px-5 py-3 text-sm font-bold text-white shadow-soft transition hover:bg-[#542043] sm:px-6"><span className="hidden min-[360px]:inline">Review order</span><span className="min-[360px]:hidden">Review</span></Link>
        </div>
      </div>
    </>
  );
}
