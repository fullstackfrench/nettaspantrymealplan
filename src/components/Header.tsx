'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { createClient } from '@/lib/supabase/client';
import { signOut } from '@/app/auth/actions';

type AuthState = 'loading' | 'logged_out' | 'customer' | 'admin';

export default function Header() {
  const { totalMeals } = useCart();
  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let requestId = 0;

    async function resolveAuthState(
      session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']
    ) {
      const currentRequest = ++requestId;

      if (!session) {
        if (active) setAuthState('logged_out');
        return;
      }

      if (active) setAuthState('loading');
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (active && currentRequest === requestId) {
        setAuthState(profile?.role === 'admin' ? 'admin' : 'customer');
      }
    }

    supabase.auth.getSession().then(({ data }) => resolveAuthState(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void resolveAuthState(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-xl font-bold tracking-tight">
          Netta&apos;s Pantry
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
          <Link href="/menu" className="hover:text-moss-600">This Week&apos;s Menu</Link>
          <Link href="/how-it-works" className="hover:text-moss-600">How It Works</Link>
          <a
            href="https://yoursouthernfoodie.com/"
            className="hover:text-moss-600"
          >
            Catering &amp; Events
          </a>
          {authState === 'customer' && (
            <Link href="/account" className="hover:text-moss-600">Account</Link>
          )}
          {authState === 'admin' && (
            <Link href="/admin" className="hover:text-moss-600">Admin</Link>
          )}
          {authState === 'logged_out' && (
            <Link href="/login" className="hover:text-moss-600">Login</Link>
          )}
          {authState === 'loading' && (
            <span className="text-black/40" aria-live="polite">Loading…</span>
          )}
          {(authState === 'customer' || authState === 'admin') && (
            <form action={signOut}>
              <button className="hover:text-moss-600">Sign out</button>
            </form>
          )}
        </nav>

        <Link
          href="/checkout"
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-black"
        >
          Cart{totalMeals > 0 ? ` · ${totalMeals}` : ''}
        </Link>
      </div>
    </header>
  );
}
