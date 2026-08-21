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
    <div className="relative overflow-hidden px-4 py-12 sm:px-6 sm:py-16">
      <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-brand-gold/10 blur-3xl" aria-hidden />
      <div className="relative mx-auto max-w-md rounded-[1.5rem] border border-brand-plum/10 bg-white p-6 shadow-lift sm:p-8">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-plum font-brand text-2xl text-white shadow-soft">N</div>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">Netta&apos;s Pantry</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-brand-plum">Welcome to the table</h1>
          <p className="mt-3 text-sm leading-6 text-ink/60">Sign in to see order history and return to your Netta&apos;s Pantry account.</p>
        </div>

        {searchParams.error && (
          <p className="mt-5 rounded-control border border-brand-brick/20 bg-clay-100 p-4 text-sm leading-6 text-ink/75" role="alert">
            That sign-in link didn&apos;t work—it may have expired. Try again below.
          </p>
        )}

        <div className="mt-7">
          <AuthForm redirectTo={redirectTo} />
        </div>

        <p className="mt-7 border-t border-brand-plum/10 pt-5 text-center text-xs leading-5 text-ink/50">Customer accounts and Chef Netta&apos;s dashboard use the same secure sign-in.</p>
      </div>
    </div>
  );
}
