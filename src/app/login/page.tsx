import { redirect } from 'next/navigation';
import { createSessionClient } from '@/lib/supabase/server';
import { safeRedirect } from '@/app/auth/after-auth';
import AuthForm from '@/components/AuthForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { redirect?: string; error?: string };
}) {
  const redirectTo = searchParams.redirect
    ? safeRedirect(searchParams.redirect, '')
    : undefined;

  const supabase = createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(redirectTo || '/account');

  return (
    <div className="mx-auto max-w-sm px-6 py-16">
      <h1 className="font-display text-2xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-black/50">
        To Netta&apos;s Pantry — order history, subscriptions, and the chef dashboard all
        live behind one sign-in.
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-xl bg-clay-100 p-4 text-sm">
          That sign-in link didn&apos;t work — it may have expired. Try again below.
        </p>
      )}

      <div className="mt-6">
        <AuthForm redirectTo={redirectTo} />
      </div>
    </div>
  );
}
