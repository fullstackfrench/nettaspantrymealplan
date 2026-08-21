import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSessionClient } from '@/lib/supabase/server';
import { signOut } from '../auth/actions';

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
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Chef dashboard</h1>
        <form action={signOut}>
          <button className="text-sm text-black/50 hover:text-black">Sign out</button>
        </form>
      </div>

      <nav className="mt-6 flex flex-wrap gap-2 border-b border-black/10 pb-4">
        <Tab href="/admin/meals">Meals</Tab>
        <Tab href="/admin/menus">Weekly menus</Tab>
        <Tab href="/admin/orders">Orders</Tab>
        <Tab href="/admin/customers">Customers &amp; glass</Tab>
      </nav>

      <div className="mt-8">{children}</div>
    </div>
  );
}

function Tab({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-black/15 hover:bg-black/5"
    >
      {children}
    </Link>
  );
}
