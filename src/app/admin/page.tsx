import { createAdminClient } from '@/lib/supabase/server';
import { formatCents } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const supabase = createAdminClient();

  const [{ count: mealCount }, { count: openOrders }, { data: customers }] =
    await Promise.all([
      supabase.from('meals').select('*', { count: 'exact', head: true }),
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['paid', 'packing', 'out_for_delivery']),
      supabase.from('customers').select('containers_out, deposit_held_cents'),
    ]);

  const glassOut = (customers ?? []).reduce((s, c) => s + (c.containers_out ?? 0), 0);
  const depositHeld = (customers ?? []).reduce(
    (s, c) => s + (c.deposit_held_cents ?? 0),
    0
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Meals in library" value={String(mealCount ?? 0)} />
      <Stat label="Orders to fulfill" value={String(openOrders ?? 0)} />
      <Stat label="Containers out" value={String(glassOut)} />
      <Stat label="Deposits held" value={formatCents(depositHeld)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
      <div className="font-display text-3xl font-bold">{value}</div>
      <div className="mt-1 text-sm text-black/50">{label}</div>
    </div>
  );
}
