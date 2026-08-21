'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '@/lib/cart';
import { createClient } from '@/lib/supabase/client';
import { signOut } from '@/app/auth/actions';

type AuthState = 'loading' | 'logged_out' | 'customer' | 'admin';

export default function Header() {
  const { totalMeals } = useCart();
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMenuOpen(false), [pathname]);

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

  const navLink = (href: string) =>
    [
      'relative rounded-control px-3 py-2 text-sm font-medium transition-colors',
      pathname === href
        ? 'bg-brand-plum/8 text-brand-plum'
        : 'text-ink/70 hover:bg-brand-plum/5 hover:text-brand-plum',
    ].join(' ');

  const accountLinks = (
    <>
      {authState === 'customer' && <Link href="/account" className={navLink('/account')}>Account</Link>}
      {authState === 'admin' && <Link href="/admin" className={navLink('/admin')}>Admin</Link>}
      {authState === 'logged_out' && <Link href="/login" className={navLink('/login')}>Login</Link>}
      {authState === 'loading' && <span className="px-3 py-2 text-sm text-ink/55" aria-live="polite">Loading…</span>}
      {(authState === 'customer' || authState === 'admin') && (
        <form action={signOut}>
          <button className="min-h-10 rounded-control px-3 py-2 text-sm font-medium text-ink/60 transition-colors hover:bg-brand-plum/5 hover:text-brand-plum">
            Sign out
          </button>
        </form>
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-brand-plum/10 bg-cream/95 shadow-[0_1px_0_rgba(104,41,82,0.04)] backdrop-blur-md">
      <div className="mx-auto flex min-h-[72px] max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="mr-auto flex min-w-0 shrink items-center" aria-label="Netta's Pantry home">
          <Image
            src="/nettas-pantry-logo.png"
            alt="Netta's Pantry"
            width={970}
            height={387}
            priority
            sizes="(max-width: 359px) 112px, (max-width: 639px) 138px, 170px"
            className="h-auto w-[112px] shrink-0 object-contain min-[360px]:w-[138px] sm:w-[170px]"
          />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
          <Link href="/menu" className={navLink('/menu')}>This Week&apos;s Menu</Link>
          <Link href="/how-it-works" className={navLink('/how-it-works')}>How It Works</Link>
          <a href="https://yoursouthernfoodie.com/" className={navLink('external')}>Catering &amp; Events</a>
          <span className="mx-1 h-6 w-px bg-brand-plum/15" aria-hidden />
          {accountLinks}
        </nav>

        <Link
          href="/checkout"
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-brand-plum px-4 py-2.5 text-sm font-bold text-white shadow-soft transition hover:bg-[#542043] hover:shadow-lift sm:px-5"
          aria-label={`Cart${totalMeals > 0 ? ` with ${totalMeals} meals` : ''}`}
        >
          <CartIcon />
          <span className="hidden sm:inline">Cart</span>
          {totalMeals > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs text-brand-plum">
              {totalMeals}
            </span>
          )}
        </Link>

        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brand-plum/15 text-brand-plum transition hover:bg-brand-plum/5 lg:hidden"
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {menuOpen && (
        <nav id="mobile-navigation" className="border-t border-brand-plum/10 bg-white px-4 py-4 shadow-soft lg:hidden" aria-label="Mobile navigation">
          <div className="mx-auto grid max-w-7xl gap-1">
            <Link href="/menu" className={navLink('/menu')}>This Week&apos;s Menu</Link>
            <Link href="/how-it-works" className={navLink('/how-it-works')}>How It Works</Link>
            <a href="https://yoursouthernfoodie.com/" className={navLink('external')}>Catering &amp; Events</a>
            <div className="my-2 h-px bg-brand-plum/10" />
            {accountLinks}
          </div>
        </nav>
      )}
    </header>
  );
}

function CartIcon() {
  return <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8"><path d="M3.5 4.5h2l1.8 9.1a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4l1.5-5.3H6.3M9.5 19.5h.01M17.5 19.5h.01" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function MenuIcon() {
  return <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.8"><path d="M5 7.5h14M5 12h14M5 16.5h14" strokeLinecap="round" /></svg>;
}

function CloseIcon() {
  return <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.8"><path d="m6.5 6.5 11 11m0-11-11 11" strokeLinecap="round" /></svg>;
}
