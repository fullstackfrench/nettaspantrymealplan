import Link from 'next/link';

export default function SuccessPage({
  searchParams,
}: {
  searchParams: { order?: string; demo?: string };
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <div className="text-5xl">🫙</div>
      <h1 className="mt-6 font-display text-3xl font-bold">You&apos;re all set</h1>
      <p className="mt-4 text-black/60">
        Chef Netta has your order. You&apos;ll get an email with your delivery day.
      </p>
      <p className="mt-4 text-sm text-black/50">
        When you&apos;ve finished your meals, give the glass a rinse and leave the containers
        out on your next delivery day. Your deposit comes back automatically.
      </p>

      {searchParams.demo && (
        <p className="mt-6 rounded-xl bg-clay-100 p-4 text-sm">
          Demo mode: the order was recorded but no payment was taken because{' '}
          <code>STRIPE_SECRET_KEY</code> is not set.
        </p>
      )}

      <Link
        href="/menu"
        className="mt-8 inline-block rounded-full bg-moss-600 px-6 py-3 text-sm font-semibold text-white hover:bg-moss-700"
      >
        Back to the menu
      </Link>
    </div>
  );
}
