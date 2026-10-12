import Link from 'next/link';
import { ORDER_CHANGE_POLICY } from '@/lib/account/policy';
export default function SuccessPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-20 text-center">
      <h1 className="font-display text-3xl text-brand-plum">
        Thank you for your order
      </h1>
      <p className="mt-4 text-ink/65">
        Your payment is being confirmed. Sign in with the email used at checkout
        to see your order status and manage your meals.
      </p>
      <p className="mt-5 rounded-control bg-cream p-4 text-sm leading-6">
        {ORDER_CHANGE_POLICY}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/login?redirect=/account" className="admin-primary-button">
          View your account
        </Link>
        <Link href="/menu" className="admin-secondary-button">
          Back to the menu
        </Link>
      </div>
    </div>
  );
}
