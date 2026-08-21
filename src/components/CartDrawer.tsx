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

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="text-sm">
          <span className="font-semibold">
            {totalMeals} meal{totalMeals === 1 ? '' : 's'}
          </span>
          <span className="text-black/50">
            {' · '}
            {formatCents(subtotalCents)}
            {depositCents > 0 && ` + ${formatCents(depositCents)} refundable deposit`}
          </span>
          {mode === 'subscription' && remaining > 0 && (
            <span className="ml-2 text-clay-500">{remaining} more to fill your plan</span>
          )}
          {mode === 'subscription' && selectedPlan && (
            <span className="ml-2 text-black/50">{selectedPlan.name}</span>
          )}
        </div>

        <Link
          href="/checkout"
          className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white hover:bg-black"
        >
          Review order
        </Link>
      </div>
    </div>
  );
}
