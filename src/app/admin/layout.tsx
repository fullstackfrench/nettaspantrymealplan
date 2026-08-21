import { redirect } from 'next/navigation';
import { createSessionClient } from '@/lib/supabase/server';
import { signOut } from '../auth/actions';
import AdminNav from '@/components/admin/AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/admin');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') redirect('/');

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="rounded-[1.5rem] border border-brand-plum/10 bg-white p-5 shadow-soft sm:p-7">
        <div className="flex flex-col gap-4 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">Netta&apos;s Pantry operations</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-brand-plum sm:text-4xl">Chef dashboard</h1>
            <p className="mt-2 text-sm text-ink/55">Meals, weekly menus, orders, customers, and reusable glass.</p>
          </div>
        <form action={signOut}>
            <button className="admin-secondary-button">Sign out</button>
        </form>
        </div>
        <div className="mt-6 border-t border-brand-plum/10 pt-5"><AdminNav /></div>
      </header>

      <div className="mt-7">{children}</div>
    </div>
  );
}
